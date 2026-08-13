import { describe, expect, it, jest } from '@jest/globals'
import type {
  DocumentInitParameters,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RefProxy
} from 'pdfjs-dist/types/src/display/api'
import { PdfParser } from '../pdfParser'
import { PdfSessionOwner } from '../pdfSessionOwner'
import type { PdfSessionLoader } from '../pdfSessionOwner'

type Deferred<T> = Readonly<{
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}>

type TestLoadingTask = Pick<PDFDocumentLoadingTask, 'destroy'>
type DestroyMock = ReturnType<typeof jest.fn<() => Promise<void>>>

const createDeferred = <T>(): Deferred<T> => {
  let rejectPromise: (reason?: unknown) => void = () => undefined
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject
    resolvePromise = resolve
  })
  return { promise, reject: rejectPromise, resolve: resolvePromise }
}

const createSession = (
  overrides: object = {},
  destroy: DestroyMock = jest.fn(async (): Promise<void> => undefined)
) => {
  const pdf = {
    numPages: 2,
    fingerprints: ['fingerprint', null],
    getMetadata: jest.fn(async () => ({ info: {}, metadata: undefined })),
    getPage: jest.fn(async (pageNumber: number) => ({ pageNumber })),
    getOutline: jest.fn(async () => []),
    getDestination: jest.fn(async (id: string) => [id]),
    getPageIndex: jest.fn(async () => 0),
    cleanup: jest.fn(),
    destroy: jest.fn(),
    transport: { hidden: true },
    _transport: { hidden: true },
    _pdfInfo: { hidden: true },
    ...overrides
  } as unknown as PDFDocumentProxy

  return {
    destroy,
    pdf,
    session: {
      loadingTask: { destroy } as TestLoadingTask as PDFDocumentLoadingTask,
      pdf
    }
  }
}

type OwnerInternals = Readonly<{
  activeLeases: number
  destroyAttempted: boolean
  destroyErrors: readonly unknown[]
  loader: PdfSessionLoader | undefined
  pendingAcquires: number
  state: 'open' | 'closing' | 'disposed'
}>

const snapshot = (owner: PdfSessionOwner) => {
  const internals = owner as unknown as OwnerInternals
  return {
    activeLeases: internals.activeLeases,
    destroyAttempted: internals.destroyAttempted,
    destroyError: internals.destroyErrors[0],
    hasLoader: internals.loader !== undefined,
    pendingAcquires: internals.pendingAcquires,
    state: internals.state
  }
}

describe('PdfSessionOwner', () => {
  it('reuses one loaded session across multiple acquires', async () => {
    const fixture = createSession()
    const loader = jest.fn(async () => fixture.session)
    const owner = new PdfSessionOwner(loader)

    const first = await owner.acquire()
    const second = await owner.acquire()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(first.pdf).toBe(second.pdf)
    owner.release(first)
    owner.release(second)
    await owner.dispose()
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('rejects new acquires immediately after disposal starts', async () => {
    const fixture = createSession()
    const owner = new PdfSessionOwner(async () => fixture.session)
    const lease = await owner.acquire()

    const disposal = owner.dispose()

    await expect(owner.acquire()).rejects.toThrow('document disposed')
    expect(snapshot(owner).state).toBe('closing')
    owner.release(lease)
    await disposal
    await expect(owner.acquire()).rejects.toThrow('document disposed')
  })

  it('waits for an in-flight lease before destroying exactly once', async () => {
    const fixture = createSession()
    const owner = new PdfSessionOwner(async () => fixture.session)
    const lease = await owner.acquire()
    let disposed = false

    const disposal = owner.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()

    expect(disposed).toBe(false)
    expect(fixture.destroy).not.toHaveBeenCalled()
    owner.release(lease)
    await disposal
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('returns the same promise for repeated dispose calls', async () => {
    const fixture = createSession()
    const owner = new PdfSessionOwner(async () => fixture.session)

    const first = owner.dispose()
    const second = owner.dispose()

    expect(first).toBe(second)
    await Promise.all([first, second])
    expect(fixture.destroy).not.toHaveBeenCalled()
  })

  it('lets mixed content and thumbnail operations finish before disposal', async () => {
    const fixture = createSession()
    const content = createDeferred<string>()
    const thumbnail = createDeferred<string>()
    const owner = new PdfSessionOwner(async () => fixture.session)
    const contentLease = await owner.acquire()
    const thumbnailLease = await owner.acquire()

    const contentOperation = content.promise.finally(() =>
      owner.release(contentLease)
    )
    const thumbnailOperation = thumbnail.promise.finally(() =>
      owner.release(thumbnailLease)
    )
    const disposal = owner.dispose()
    content.resolve('page text')
    thumbnail.resolve('data:image/png;base64,ok')

    await expect(contentOperation).resolves.toBe('page text')
    await expect(thumbnailOperation).resolves.toBe('data:image/png;base64,ok')
    await disposal
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('rolls back a rejected load and permits one shared retry', async () => {
    const firstAttempt =
      createDeferred<ReturnType<typeof createSession>['session']>()
    const retryFixture = createSession()
    const loader = jest
      .fn<PdfSessionLoader>()
      .mockImplementationOnce(() => firstAttempt.promise)
      .mockResolvedValue(retryFixture.session)
    const owner = new PdfSessionOwner(loader)

    const first = owner.acquire()
    const second = owner.acquire()
    expect(snapshot(owner)).toMatchObject({
      pendingAcquires: 2,
      activeLeases: 0
    })
    firstAttempt.reject(new Error('load failed'))

    await expect(first).rejects.toThrow('load failed')
    await expect(second).rejects.toThrow('load failed')
    expect(snapshot(owner)).toMatchObject({
      pendingAcquires: 0,
      activeLeases: 0
    })
    const retryOne = owner.acquire()
    const retryTwo = owner.acquire()
    const [leaseOne, leaseTwo] = await Promise.all([retryOne, retryTwo])
    expect(loader).toHaveBeenCalledTimes(2)
    expect(snapshot(owner)).toMatchObject({
      pendingAcquires: 0,
      activeLeases: 2
    })
    owner.release(leaseOne)
    owner.release(leaseTwo)
    await owner.dispose()
    expect(retryFixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('passes loader arguments through a call-time PdfParser property lookup', async () => {
    const fixture = createSession()
    const data = new ArrayBuffer(4)
    const overrides: Partial<DocumentInitParameters> = {
      disableAutoFetch: true
    }
    const parser = PdfParser as unknown as {
      loadPdfSession: (
        source: ArrayBuffer,
        options?: Partial<DocumentInitParameters>
      ) => Promise<typeof fixture.session>
    }
    const originalLoader = parser.loadPdfSession
    const firstLoader = jest.fn<typeof parser.loadPdfSession>(
      async () => fixture.session
    )
    const secondLoader = jest.fn<typeof parser.loadPdfSession>(
      async () => fixture.session
    )
    parser.loadPdfSession = firstLoader
    const owner = new PdfSessionOwner(() =>
      parser.loadPdfSession(data, overrides)
    )
    parser.loadPdfSession = secondLoader

    try {
      const lease = await owner.acquire()
      expect(firstLoader).not.toHaveBeenCalled()
      expect(secondLoader.mock.calls).toEqual([[data, overrides]])
      owner.release(lease)
      await owner.dispose()
    } finally {
      parser.loadPdfSession = originalLoader
    }
  })

  it('drops the loader reference after a successful load', async () => {
    const fixture = createSession()
    const owner = new PdfSessionOwner(async () => fixture.session)

    const lease = await owner.acquire()

    expect(snapshot(owner).hasLoader).toBe(false)
    owner.release(lease)
    await owner.dispose()
  })

  it('exposes exactly the seven delegated PDF members', async () => {
    const page = { pageNumber: 2 } as PDFPageProxy
    const reference = { num: 7, gen: 0 } as RefProxy
    const getMetadata = jest.fn(function (this: PDFDocumentProxy) {
      return Promise.resolve({ info: { owner: this }, metadata: undefined })
    })
    const getPage = jest.fn(function (
      this: PDFDocumentProxy,
      pageNumber: number
    ) {
      return Promise.resolve(pageNumber === 2 ? page : (undefined as never))
    })
    const getOutline = jest.fn(function (this: PDFDocumentProxy) {
      return Promise.resolve([{ owner: this }])
    })
    const getDestination = jest.fn(function (
      this: PDFDocumentProxy,
      id: string
    ) {
      return Promise.resolve([this, id])
    })
    const getPageIndex = jest.fn(function (
      this: PDFDocumentProxy,
      ref: RefProxy
    ) {
      return Promise.resolve(ref === reference ? 6 : -1)
    })
    const fixture = createSession({
      getMetadata,
      getPage,
      getOutline,
      getDestination,
      getPageIndex
    })
    const owner = new PdfSessionOwner(async () => fixture.session)
    const lease = await owner.acquire()

    expect(Object.keys(lease.pdf)).toEqual([
      'numPages',
      'fingerprints',
      'getMetadata',
      'getPage',
      'getOutline',
      'getDestination',
      'getPageIndex'
    ])
    expect('cleanup' in lease.pdf).toBe(false)
    expect('destroy' in lease.pdf).toBe(false)
    expect('transport' in lease.pdf).toBe(false)
    expect('_transport' in lease.pdf).toBe(false)
    expect('_pdfInfo' in lease.pdf).toBe(false)
    await expect(lease.pdf.getMetadata()).resolves.toMatchObject({
      info: { owner: fixture.pdf }
    })
    await expect(lease.pdf.getPage(2)).resolves.toBe(page)
    await expect(lease.pdf.getOutline()).resolves.toEqual([
      { owner: fixture.pdf }
    ])
    await expect(lease.pdf.getDestination('chapter')).resolves.toEqual([
      fixture.pdf,
      'chapter'
    ])
    await expect(lease.pdf.getPageIndex(reference)).resolves.toBe(6)
    expect(getMetadata.mock.contexts[0]).toBe(fixture.pdf)
    expect(getPage).toHaveBeenCalledWith(2)
    expect(getOutline.mock.contexts[0]).toBe(fixture.pdf)
    expect(getDestination).toHaveBeenCalledWith('chapter')
    expect(getPageIndex).toHaveBeenCalledWith(reference)
    owner.release(lease)
    await owner.dispose()
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys a session that resolves after disposal starts', async () => {
    const deferredSession =
      createDeferred<ReturnType<typeof createSession>['session']>()
    const fixture = createSession()
    const owner = new PdfSessionOwner(() => deferredSession.promise)
    const acquisition = owner.acquire()

    const disposal = owner.dispose()
    expect(snapshot(owner)).toMatchObject({
      state: 'closing',
      pendingAcquires: 1
    })
    deferredSession.resolve(fixture.session)

    await expect(acquisition).rejects.toThrow('document disposed')
    await disposal
    expect(snapshot(owner)).toMatchObject({
      state: 'disposed',
      pendingAcquires: 0,
      activeLeases: 0
    })
    expect(fixture.destroy).toHaveBeenCalledTimes(1)
  })

  it('never decrements pending acquires below zero on success, failure, or closing', async () => {
    const successFixture = createSession()
    const successful = new PdfSessionOwner(async () => successFixture.session)
    const successfulLease = await successful.acquire()
    expect(snapshot(successful).pendingAcquires).toBe(0)
    successful.release(successfulLease)
    await successful.dispose()

    const failed = new PdfSessionOwner(async () => {
      throw new Error('failure')
    })
    await expect(failed.acquire()).rejects.toThrow('failure')
    expect(snapshot(failed)).toMatchObject({
      pendingAcquires: 0
    })
    await failed.dispose()

    const deferredSession =
      createDeferred<ReturnType<typeof createSession>['session']>()
    const closingFixture = createSession()
    const closing = new PdfSessionOwner(() => deferredSession.promise)
    const acquisition = closing.acquire()
    const disposal = closing.dispose()
    deferredSession.resolve(closingFixture.session)
    await expect(acquisition).rejects.toThrow('document disposed')
    await disposal
    expect(snapshot(closing)).toMatchObject({
      pendingAcquires: 0
    })
  })

  it('reaches disposed when destroy rejects and settles repeated dispose calls', async () => {
    const destroy = createDeferred<void>()
    const destroyMock = jest.fn(() => destroy.promise)
    const fixture = createSession({}, destroyMock)
    const owner = new PdfSessionOwner(async () => fixture.session)
    const lease = await owner.acquire()
    owner.release(lease)

    const first = owner.dispose()
    const second = owner.dispose()
    destroy.reject(new Error('destroy failed'))

    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(first).toBe(second)
    expect(destroyMock).toHaveBeenCalledTimes(1)
    expect(snapshot(owner)).toMatchObject({
      state: 'disposed',
      destroyAttempted: true,
      destroyError: expect.any(Error)
    })
  })

  it('rejects random bytes, remains retryable, and disposes without hanging', async () => {
    const parser = PdfParser as unknown as {
      loadPdfSession: (
        source: ArrayBuffer
      ) => Promise<ReturnType<typeof createSession>['session']>
    }
    const loader = jest.fn(() =>
      parser.loadPdfSession(Uint8Array.from([4, 8, 15, 16, 23, 42]).buffer)
    )
    const owner = new PdfSessionOwner(loader)

    await expect(owner.acquire()).rejects.toBeDefined()
    await expect(owner.acquire()).rejects.toBeDefined()
    expect(loader).toHaveBeenCalledTimes(2)
    await expect(owner.dispose()).resolves.toBeUndefined()
    expect(snapshot(owner)).toMatchObject({
      state: 'disposed',
      pendingAcquires: 0
    })
  }, 30000)
})

describe('PdfParser.loadPdfSession failure cleanup', () => {
  it('awaits loadingTask.destroy before rejecting with the original parse error', async () => {
    const parseError = new Error('parse failed')
    const destroy = createDeferred<void>()
    const loadingTask = {
      promise: Promise.reject(parseError),
      destroy: jest.fn(() => destroy.promise)
    } as unknown as PDFDocumentLoadingTask
    const getDocument = jest.fn(() => loadingTask)
    const parser = PdfParser as unknown as {
      loadPdfSession: (source: ArrayBuffer) => Promise<unknown>
      loadPdfjsModule: () => Promise<{
        getDocument: typeof getDocument
        GlobalWorkerOptions: { workerSrc: string }
      }>
    }
    const moduleSpy = jest.spyOn(parser, 'loadPdfjsModule').mockResolvedValue({
      getDocument,
      GlobalWorkerOptions: { workerSrc: 'mock-worker.mjs' }
    })

    try {
      const loading = parser.loadPdfSession(new ArrayBuffer(8))
      let settled = false
      const settlementProbe = loading.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        }
      )
      await Promise.resolve()
      await Promise.resolve()

      expect(loadingTask.destroy).toHaveBeenCalledTimes(1)
      expect(settled).toBe(false)
      destroy.resolve(undefined)
      await expect(loading).rejects.toBe(parseError)
      await settlementProbe
      expect(settled).toBe(true)
    } finally {
      moduleSpy.mockRestore()
    }
  })
})
