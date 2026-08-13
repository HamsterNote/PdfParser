import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { IntermediateImage } from '@hamster-note/types'
import type {
  DocumentInitParameters,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy
} from 'pdfjs-dist/types/src/display/api'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist'
import { PdfParser, type OpenDocumentHandle } from '../pdfParser'

type Deferred<T> = Readonly<{
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}>

type Session = Readonly<{
  loadingTask: PDFDocumentLoadingTask
  pdf: PDFDocumentProxy
}>

type ParserInternals = {
  extractImagesFromPage: (
    page: PDFPageProxy,
    pdfId: string,
    pageNumber: number
  ) => Promise<[]>
  loadPdfSession: (
    data: ArrayBuffer,
    overrides?: Partial<DocumentInitParameters>
  ) => Promise<Session>
  renderThumbnail: (
    page: PDFPageProxy,
    scale: number
  ) => Promise<IntermediateImage | undefined>
}

type RetirementError = Error & { retirement: Promise<void> }

const parser = PdfParser as unknown as ParserInternals
const handles = new Set<OpenDocumentHandle>()

const createDeferred = <T>(): Deferred<T> => {
  let rejectPromise: (reason?: unknown) => void = () => undefined
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject
    resolvePromise = resolve
  })
  return { promise, reject: rejectPromise, resolve: resolvePromise }
}

const createPage = (
  pageNumber: number,
  width = 100 + pageNumber,
  height = 200 + pageNumber
): PDFPageProxy =>
  ({
    pageNumber,
    getViewport: jest.fn(() => ({
      width,
      height,
      transform: [1, 0, 0, -1, 0, height]
    })),
    getTextContent: jest.fn(async () => ({
      items: [],
      styles: Object.create(null)
    }))
  }) as unknown as PDFPageProxy

const createSession = (overrides: Partial<PDFDocumentProxy> = {}) => {
  const destroy = jest.fn(async (): Promise<void> => undefined)
  const pages = new Map<number, PDFPageProxy>()
  const getPage = jest.fn(async (pageNumber: number) => {
    let page = pages.get(pageNumber)
    if (!page) {
      page = createPage(pageNumber)
      pages.set(pageNumber, page)
    }
    return page
  })
  const pdf = {
    numPages: 10,
    fingerprints: ['fixture-id', null],
    getMetadata: jest.fn(async () => ({
      info: { Title: 'Fixture title' },
      metadata: undefined
    })),
    getPage,
    getOutline: jest.fn(async () => []),
    getDestination: jest.fn(async () => null),
    getPageIndex: jest.fn(async () => 0),
    ...overrides
  } as unknown as PDFDocumentProxy
  return {
    destroy,
    getPage,
    pages,
    session: {
      loadingTask: { destroy } as unknown as PDFDocumentLoadingTask,
      pdf
    }
  }
}

const captureRejection = async (
  promise: Promise<unknown>
): Promise<RetirementError> => {
  try {
    await promise
    throw new Error('expected promise to reject')
  } catch (error: unknown) {
    if (error instanceof Error && 'retirement' in error) {
      return error as RetirementError
    }
    throw error
  }
}

const track = (handle: OpenDocumentHandle): OpenDocumentHandle => {
  handles.add(handle)
  return handle
}

const toIndependentArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

const createTenPagePdf = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create()
  document.setTitle('Ten page fixture')
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
    const page = document.addPage([300 + pageNumber, 400 + pageNumber])
    page.drawText(`Page ${pageNumber}`, { x: 20, y: 350, font, size: 12 })
  }
  return document.save({ useObjectStreams: false })
}

const createOutlinePdf = (): Uint8Array => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R /PageMode /UseOutlines >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Outlines /First 6 0 R /Last 6 0 R /Count 1 >>',
    '<< /Title (Committed Outline) /Parent 5 0 R /Dest [3 0 R /Fit] >>'
  ]
  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, 'binary'))
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body, 'binary')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Uint8Array.from(Buffer.from(body, 'binary'))
}

afterEach(async () => {
  for (const handle of handles) await handle.dispose()
  handles.clear()
  expect(handles.size).toBe(0)
  jest.restoreAllMocks()
})

describe('PdfParser.openDocument', () => {
  it('opens an in-memory ten-page PDF with complete sizes and lazy text', async () => {
    const bytes = await createTenPagePdf()
    const load = jest.spyOn(parser, 'loadPdfSession')
    const handle = track(
      await PdfParser.openDocument(toIndependentArrayBuffer(bytes))
    )

    expect(load).toHaveBeenCalledTimes(1)
    expect(handle.title).toBe('Ten page fixture')
    expect(handle.pageCount).toBe(10)
    expect(handle.document.pageNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
      expect(handle.document.getPageSizeByPageNumber(pageNumber)).toEqual({
        x: 300 + pageNumber,
        y: 400 + pageNumber
      })
    }
    const firstPage = await handle.document.getPageByPageNumber(1)
    const content = await firstPage?.getContent()
    expect(
      content?.some((item) => 'content' in item && item.content === 'Page 1')
    ).toBe(true)
  }, 30000)

  it('preserves a validated PDF outline with encode parity', async () => {
    const bytes = createOutlinePdf()
    const directTask = getDocument({ data: bytes.slice() })
    let handle: OpenDocumentHandle | undefined
    try {
      const directPdf = await directTask.promise
      const rawOutline = await directPdf.getOutline()
      expect(rawOutline).toHaveLength(1)
      expect(rawOutline?.[0]?.title).toBe('Committed Outline')

      const encoded = await PdfParser.encode(toIndependentArrayBuffer(bytes))
      expect(encoded?.getOutline()).toBeDefined()
      expect(encoded?.getOutline()?.[0]?.content).toBe('Committed Outline')

      handle = track(
        await PdfParser.openDocument(toIndependentArrayBuffer(bytes))
      )
      expect(handle.document.getOutline()).toEqual(encoded?.getOutline())
    } finally {
      await handle?.dispose()
      await directTask.destroy()
    }
  }, 30000)

  it('reuses one copied session and eagerly exposes all requested sizes', async () => {
    const fixture = createSession()
    const load = jest
      .spyOn(parser, 'loadPdfSession')
      .mockResolvedValue(fixture.session)
    jest.spyOn(parser, 'extractImagesFromPage').mockResolvedValue([])
    const source = Uint8Array.from([1, 2, 3, 4])

    const handle = track(
      await PdfParser.openDocument(source, { pages: [2, 3] })
    )
    const page = await handle.document.getPageByPageNumber(2)
    const content = await page?.getContent()

    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.calls[0][0]).not.toBe(source.buffer)
    expect(handle).toMatchObject({
      id: 'fixture-id',
      title: 'Fixture title',
      pageCount: 10
    })
    expect(handle.document.pageNumbers).toEqual([2, 3])
    expect(handle.document.getPageSizeByPageNumber(2)).toEqual({
      x: 102,
      y: 202
    })
    expect(content).toEqual([])
  })

  it('passes pdfjs overrides through and reports monotonic completion order', async () => {
    const fixture = createSession()
    const overrides = { disableAutoFetch: true, disableStream: true }
    const events: Array<{ stage: string; current: number; total: number }> = []
    const load = jest
      .spyOn(parser, 'loadPdfSession')
      .mockResolvedValue(fixture.session)

    const handle = track(
      await PdfParser.openDocument(new ArrayBuffer(8), {
        pages: [2, 10],
        pdfjsOverrides: overrides,
        onProgress: (event) => events.push(event)
      })
    )

    expect(load.mock.calls[0][1]).toBe(overrides)
    expect(handle.document.pageNumbers).toEqual([2, 10])
    expect(events).toEqual([
      { stage: 'encode:start', current: 0, total: 2 },
      expect.objectContaining({ stage: 'encode:page', current: 1, total: 2 }),
      expect.objectContaining({ stage: 'encode:page', current: 2, total: 2 }),
      { stage: 'encode:complete', current: 2, total: 2 }
    ])
  })

  it('isolates two handles and destroys each shared session exactly once', async () => {
    const first = createSession()
    const second = createSession()
    jest
      .spyOn(parser, 'loadPdfSession')
      .mockResolvedValueOnce(first.session)
      .mockResolvedValueOnce(second.session)
    jest.spyOn(parser, 'extractImagesFromPage').mockResolvedValue([])

    const handleA = track(await PdfParser.openDocument(new ArrayBuffer(4)))
    const handleB = track(await PdfParser.openDocument(new ArrayBuffer(4)))
    await handleA.dispose()
    const pageB = await handleB.document.getPageByPageNumber(1)

    await expect(pageB?.getContent()).resolves.toEqual([])
    await handleA.dispose()
    await handleB.dispose()
    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(second.destroy).toHaveBeenCalledTimes(1)
  })

  it('rejects untouched lazy closures after disposal', async () => {
    const fixture = createSession()
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)
    const handle = track(await PdfParser.openDocument(new ArrayBuffer(4)))
    const page = await handle.document.getPageByPageNumber(1)

    await handle.dispose()

    await expect(page?.getContent()).rejects.toThrow('document disposed')
    await expect(page?.getThumbnail(1)).rejects.toThrow('document disposed')
    await expect(page?.getThumbnail(0)).rejects.toThrow('document disposed')
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the lazy lease until a timed-out underlying content task settles', async () => {
    const text =
      createDeferred<Awaited<ReturnType<PDFPageProxy['getTextContent']>>>()
    const page = createPage(1)
    jest.spyOn(page, 'getTextContent').mockReturnValue(text.promise)
    const fixture = createSession({
      numPages: 1,
      getPage: jest.fn(async () => page)
    })
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)
    jest.spyOn(parser, 'extractImagesFromPage').mockResolvedValue([])
    const handle = track(
      await PdfParser.openDocument(new ArrayBuffer(4), {
        pageLoadTimeoutMs: 5
      })
    )
    const lazyPage = await handle.document.getPageByPageNumber(1)

    await expect(lazyPage?.getContent()).rejects.toThrow('Timed out')
    let disposed = false
    const disposal = handle.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)
    text.resolve({ items: [], styles: Object.create(null), lang: null })
    await disposal
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps a timed-out thumbnail lease until the underlying render settles', async () => {
    const rendering = createDeferred<IntermediateImage | undefined>()
    const fixture = createSession({ numPages: 1 })
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)
    jest.spyOn(parser, 'renderThumbnail').mockReturnValue(rendering.promise)
    const handle = track(
      await PdfParser.openDocument(new ArrayBuffer(4), {
        pageLoadTimeoutMs: 5
      })
    )
    const page = await handle.document.getPageByPageNumber(1)

    await expect(page?.getThumbnail(1)).rejects.toThrow('Timed out')
    let disposed = false
    const disposal = handle.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)
    rendering.resolve(undefined)
    await disposal
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('deduplicates content and normalized thumbnail tasks with a two-item LRU', async () => {
    const fixture = createSession({ numPages: 1 })
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)
    jest.spyOn(parser, 'extractImagesFromPage').mockResolvedValue([])
    const thumbnail = jest
      .spyOn(parser, 'renderThumbnail')
      .mockResolvedValue(undefined)
    const handle = track(await PdfParser.openDocument(new ArrayBuffer(4)))
    const page = await handle.document.getPageByPageNumber(1)

    await Promise.all([page?.getContent(), page?.getContent()])
    await Promise.all([page?.getThumbnail(1), page?.getThumbnail(1.004)])
    await page?.getThumbnail(1.006)
    await page?.getThumbnail(2)
    await page?.getThumbnail(1)

    expect(fixture.getPage).toHaveBeenCalledTimes(6)
    expect(thumbnail.mock.calls.map((call) => call[1])).toEqual([1, 1.01, 2, 1])
    await expect(page?.getThumbnail(0)).rejects.toThrow(RangeError)
    await expect(page?.getThumbnail(Number.NaN)).rejects.toThrow(RangeError)
  })

  it('aborts before a deferred loader resolves and retires the late session once', async () => {
    const deferred = createDeferred<Session>()
    const fixture = createSession()
    const load = jest
      .spyOn(parser, 'loadPdfSession')
      .mockReturnValue(deferred.promise)
    const controller = new AbortController()
    const opening = PdfParser.openDocument(new ArrayBuffer(4), {
      signal: controller.signal
    })
    for (
      let attempt = 0;
      attempt < 10 && load.mock.calls.length === 0;
      attempt += 1
    ) {
      await Promise.resolve()
    }
    expect(load).toHaveBeenCalledTimes(1)

    controller.abort()
    const error = await captureRejection(opening)

    expect(error.name).toBe('AbortError')
    deferred.resolve(fixture.session)
    await error.retirement
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the abort retirement fence pending until scan and destroy drain', async () => {
    const page = createDeferred<PDFPageProxy>()
    const destroy = createDeferred<void>()
    const fixture = createSession({
      numPages: 1,
      getPage: jest.fn(() => page.promise)
    })
    fixture.destroy.mockImplementation(() => destroy.promise)
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)
    const controller = new AbortController()
    const opening = PdfParser.openDocument(new ArrayBuffer(4), {
      signal: controller.signal
    })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()

    const error = await captureRejection(opening)
    let retired = false
    error.retirement.then(() => {
      retired = true
    })
    page.resolve(createPage(1))
    await Promise.resolve()
    expect(retired).toBe(false)
    destroy.resolve(undefined)
    await error.retirement
    expect(retired).toBe(true)
  })

  it('drains every started scan worker before resolving retirement', async () => {
    const firstPage = createDeferred<PDFPageProxy>()
    const secondPage = createDeferred<PDFPageProxy>()
    const fixture = createSession({
      numPages: 2,
      getPage: jest
        .fn<PDFDocumentProxy['getPage']>()
        .mockReturnValueOnce(firstPage.promise)
        .mockReturnValueOnce(secondPage.promise)
    })
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)
    const controller = new AbortController()
    const opening = PdfParser.openDocument(new ArrayBuffer(4), {
      scanConcurrency: 2,
      signal: controller.signal
    })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    const error = await captureRejection(opening)
    let retired = false
    error.retirement.then(() => {
      retired = true
    })

    firstPage.resolve(createPage(1))
    await Promise.resolve()
    expect(retired).toBe(false)
    secondPage.resolve(createPage(2))
    await error.retirement
    expect(retired).toBe(true)
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('does not report completion after abort during outline loading', async () => {
    const outline =
      createDeferred<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>()
    const fixture = createSession({
      numPages: 1,
      getOutline: jest.fn(() => outline.promise)
    })
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)
    const events: string[] = []
    const controller = new AbortController()
    const opening = PdfParser.openDocument(new ArrayBuffer(4), {
      signal: controller.signal,
      onProgress: (event) => events.push(event.stage)
    })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    const error = await captureRejection(opening)
    outline.resolve([])
    await error.retirement

    expect(events).not.toContain('encode:complete')
  })

  it('attaches an immediate fence to pre-owner abort and conversion failure', async () => {
    const controller = new AbortController()
    controller.abort()
    const load = jest.spyOn(parser, 'loadPdfSession')

    const aborted = await captureRejection(
      PdfParser.openDocument(new ArrayBuffer(4), { signal: controller.signal })
    )
    const invalid = await captureRejection(
      PdfParser.openDocument({
        arrayBuffer: async () => Promise.reject('bad')
      } as Blob)
    )

    expect(aborted.name).toBe('AbortError')
    await expect(aborted.retirement).resolves.toBeUndefined()
    await expect(invalid.retirement).resolves.toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })

  it('aborts a deferred Blob conversion without creating an owner', async () => {
    const conversion = createDeferred<ArrayBuffer>()
    const blob = new Blob(['fixture'])
    Object.defineProperty(blob, 'arrayBuffer', {
      value: () => conversion.promise
    })
    const load = jest.spyOn(parser, 'loadPdfSession')
    const controller = new AbortController()
    const opening = PdfParser.openDocument(blob, { signal: controller.signal })

    controller.abort()
    const error = await captureRejection(opening)

    expect(error.name).toBe('AbortError')
    await expect(error.retirement).resolves.toBeUndefined()
    expect(load).not.toHaveBeenCalled()
    conversion.resolve(new ArrayBuffer(8))
    await Promise.resolve()
  })

  it('rejects invalid PDF bytes with a settled retirement fence', async () => {
    const error = await captureRejection(
      PdfParser.openDocument(Uint8Array.from([4, 8, 15, 16, 23, 42]))
    )

    await expect(error.retirement).resolves.toBeUndefined()
  }, 30000)

  it('awaits disposal on scan failure and preserves the original error', async () => {
    const failure = new Error('scan failed')
    const fixture = createSession({
      numPages: 2,
      getPage: jest.fn(async (pageNumber: number) => {
        if (pageNumber === 2) throw failure
        return createPage(pageNumber)
      })
    })
    jest.spyOn(parser, 'loadPdfSession').mockResolvedValue(fixture.session)

    const error = await captureRejection(
      PdfParser.openDocument(new ArrayBuffer(4), { scanConcurrency: 2 })
    )

    expect(error).toBe(failure)
    await error.retirement
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })
})
