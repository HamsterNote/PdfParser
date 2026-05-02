import { describe, expect, it, jest, beforeAll } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import type {
  PDFDocumentProxy,
  PDFPageProxy
} from 'pdfjs-dist/types/src/display/api'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('PdfParser encode safeguards', () => {
  it('does not cap pages by default encode options', () => {
    const resolveEncodeOptions = (
      PdfParser as unknown as {
        resolveEncodeOptions: (
          options: { maxPages?: number; pageLoadTimeoutMs?: number },
          totalPages: number
        ) => { maxPages: number; pageLoadTimeoutMs: number }
      }
    ).resolveEncodeOptions.bind(PdfParser)

    const options = resolveEncodeOptions({}, 350)

    expect(options.maxPages).toBe(350)
    expect(options.pageLoadTimeoutMs).toBe(5000)
  })

  it('limits page info scan by maxPages', async () => {
    const getPage = jest.fn(async (pageNumber: number) => {
      return {
        getViewport: () => ({
          width: 100 + pageNumber,
          height: 200 + pageNumber
        }),
        cleanup: jest.fn()
      } as unknown as PDFPageProxy
    })

    const pdf = {
      numPages: 50,
      getPage
    } as unknown as PDFDocumentProxy

    const buildPageInfoList = (
      PdfParser as unknown as {
        buildPageInfoList: (
          pdf: PDFDocumentProxy,
          pdfId: string,
          options: { maxPages: number; pageLoadTimeoutMs: number }
        ) => Promise<
          Array<{
            id: string
            pageNumber: number
            size: { x: number; y: number }
            getData: () => Promise<unknown>
          }>
        >
      }
    ).buildPageInfoList.bind(PdfParser)

    const result = await buildPageInfoList(pdf, 'pdf-id', {
      maxPages: 5,
      pageLoadTimeoutMs: 1000
    })

    expect(getPage).toHaveBeenCalledTimes(5)
    expect(result).toHaveLength(5)
    expect(result[4].pageNumber).toBe(5)
  })

  it('throws when page load exceeds timeout', async () => {
    const getPage = jest.fn(
      () => new Promise<PDFPageProxy>(() => undefined) as Promise<PDFPageProxy>
    )

    const pdf = {
      numPages: 1,
      getPage
    } as unknown as PDFDocumentProxy

    const buildPageInfoList = (
      PdfParser as unknown as {
        buildPageInfoList: (
          pdf: PDFDocumentProxy,
          pdfId: string,
          options: { maxPages: number; pageLoadTimeoutMs: number }
        ) => Promise<unknown>
      }
    ).buildPageInfoList.bind(PdfParser)

    await expect(
      buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 1,
        pageLoadTimeoutMs: 10
      })
    ).rejects.toThrow('Timed out while loading page 1 during PDF encode')
  })

  it('throws when text extraction exceeds timeout in lazy getData', async () => {
    const page = {
      getViewport: () => ({ width: 100, height: 200 }),
      getTextContent: () => new Promise<never>(() => undefined),
      cleanup: jest.fn()
    } as unknown as PDFPageProxy

    const getPage = jest.fn(async () => page)
    const pdf = {
      numPages: 1,
      getPage
    } as unknown as PDFDocumentProxy

    const buildPageInfoList = (
      PdfParser as unknown as {
        buildPageInfoList: (
          pdf: PDFDocumentProxy,
          pdfId: string,
          options: { maxPages: number; pageLoadTimeoutMs: number }
        ) => Promise<
          Array<{
            getData: () => Promise<unknown>
          }>
        >
      }
    ).buildPageInfoList.bind(PdfParser)

    const pages = await buildPageInfoList(pdf, 'pdf-id', {
      maxPages: 1,
      pageLoadTimeoutMs: 10
    })

    await expect(pages[0].getData()).rejects.toThrow(
      'Timed out while extracting text from page 1 during PDF encode'
    )
  })

  describe('PdfParser.encode signature compatibility', () => {
    let pdfBuffer: ArrayBuffer

    beforeAll(async () => {
      const pdfPath = path.resolve(__dirname, 'test_github.pdf')
      const buffer = await fs.promises.readFile(pdfPath)
      pdfBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      )
    }, 30000)

    it('PdfParser.encode(input) works with no second argument', async () => {
      const result = await PdfParser.encode(pdfBuffer)
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
    })

    it('PdfParser.encode(input, options) works with options object', async () => {
      const result = await PdfParser.encode(pdfBuffer, { maxPages: 5 })
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
    })

    it('PdfParser.encode(input, reporter as any) throws TypeError with exact message', async () => {
      const invalidReporter = (() => {}) as unknown as Parameters<
        (typeof PdfParser)['encode']
      >[2]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encodePromise = PdfParser.encode(pdfBuffer, invalidReporter as any)
      await expect(encodePromise).rejects.toThrow(
        'PdfParser.encode() no longer accepts a progress function as the second argument. ' +
          'Use PdfParser.encode(input, options, reporter) instead.'
      )
    })

    it('reporter-thrown exception bubbles to caller unchanged', async () => {
      const error = new Error('reporter error during encode')
      const failingReporter = ((info: { stage: string }) => {
        if (info.stage === 'encode:start') {
          throw error
        }
      }) as unknown as Parameters<(typeof PdfParser)['encode']>[2]

      // prettier-ignore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encodePromise = PdfParser.encode(pdfBuffer, {}, failingReporter as any)
      await expect(encodePromise).rejects.toThrow(error)
    })
  })
})
