import { PdfParser } from '@PdfParser'
import { describe, expect, it, jest } from '@jest/globals'
import type {
  PDFDocumentProxy,
  PDFPageProxy
} from 'pdfjs-dist/types/src/display/api'

function getPageDelay(pageNumber: number, baseDelay: number): number {
  if (pageNumber === 3) return baseDelay * 3
  if (pageNumber === 1) return baseDelay
  return baseDelay / 2
}

function createProgressTracker() {
  const progressEvents: number[] = []
  return {
    progressEvents,
    onProgress: (info: { stage: string; current: number; total: number }) => {
      if (info.stage === 'encode:page') {
        progressEvents.push(info.current)
      }
    }
  }
}

function createProgressTrackerWithDetails() {
  const progressEvents: { current: number; total: number }[] = []
  return {
    progressEvents,
    onProgress: (info: { stage: string; current: number; total: number }) => {
      if (info.stage === 'encode:page') {
        progressEvents.push({ current: info.current, total: info.total })
      }
    }
  }
}

function createEmptyTextContent() {
  return {
    items: [],
    styles: Object.create(null)
  }
}

function createConcurrentGetPageMock(
  pageDelayMs: number,
  maxConcurrentRef: { value: number },
  maxConcurrentList: number[]
) {
  return jest.fn(async (pageNumber: number): Promise<PDFPageProxy> => {
    maxConcurrentRef.value++
    maxConcurrentList.push(maxConcurrentRef.value)
    await new Promise((resolve) => setTimeout(resolve, pageDelayMs))
    maxConcurrentRef.value--
    return {
      getViewport: () => ({
        width: 100 + pageNumber,
        height: 200 + pageNumber
      }),
      getTextContent: async () => createEmptyTextContent(),
      cleanup: jest.fn()
    } as unknown as PDFPageProxy
  })
}

function createDelayedGetPageMock(pageDelayMs: number) {
  return jest.fn(async (pageNumber: number): Promise<PDFPageProxy> => {
    const delay = getPageDelay(pageNumber, pageDelayMs)
    await new Promise((resolve) => setTimeout(resolve, delay))
    return {
      getViewport: () => ({
        width: 100 + pageNumber,
        height: 200 + pageNumber
      }),
      getTextContent: async () => createEmptyTextContent(),
      cleanup: jest.fn()
    } as unknown as PDFPageProxy
  })
}

function createSimpleGetPageMock() {
  return jest.fn(async (_pageNumber: number): Promise<PDFPageProxy> => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return {
      getViewport: () => ({
        width: 100,
        height: 200
      }),
      getTextContent: async () => createEmptyTextContent(),
      cleanup: jest.fn()
    } as unknown as PDFPageProxy
  })
}

function createVariableDelayGetPageMock() {
  return jest.fn(async (pageNumber: number): Promise<PDFPageProxy> => {
    const delay = pageNumber === 2 ? 50 : 10
    await new Promise((resolve) => setTimeout(resolve, delay))
    return {
      getViewport: () => ({
        width: 100 * pageNumber,
        height: 200 * pageNumber
      }),
      getTextContent: async () => createEmptyTextContent(),
      cleanup: jest.fn()
    } as unknown as PDFPageProxy
  })
}

function createLazyGetPageMock() {
  return jest.fn(async (_pageNumber: number): Promise<PDFPageProxy> => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    return {
      getViewport: () => ({
        width: 100,
        height: 200
      }),
      getTextContent: jest.fn().mockResolvedValue(createEmptyTextContent()),
      cleanup: jest.fn()
    } as unknown as PDFPageProxy
  })
}

function createMaxPagesGetPageMock() {
  return jest.fn(async (_pageNumber: number): Promise<PDFPageProxy> => {
    return {
      getViewport: () => ({
        width: 100,
        height: 200
      }),
      getTextContent: async () => createEmptyTextContent(),
      cleanup: jest.fn()
    } as unknown as PDFPageProxy
  })
}

describe('buildPageInfoList', () => {
  const buildPageInfoList = (
    PdfParser as unknown as {
      buildPageInfoList: (
        pdf: PDFDocumentProxy,
        pdfId: string,
        options: { maxPages: number; pageLoadTimeoutMs: number },
        onProgress?: (info: {
          stage: string
          current: number
          total: number
        }) => void
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

  const encodeYield = (
    PdfParser as unknown as {
      encodeYield: () => Promise<void>
    }
  ).encodeYield.bind(PdfParser)

  const resolvePageScanBatchSize = (
    PdfParser as unknown as {
      resolvePageScanBatchSize: (totalPages: number) => number
    }
  ).resolvePageScanBatchSize.bind(PdfParser)

  describe('encodeYield scheduler', () => {
    type SchedulerGlobal = {
      scheduler?: { yield?: () => Promise<void> }
    }

    it('uses scheduler.yield when available', async () => {
      const schedulerGlobal = globalThis as unknown as SchedulerGlobal
      const originalScheduler = schedulerGlobal.scheduler
      const yieldMock = jest.fn(async () => undefined)

      schedulerGlobal.scheduler = { yield: yieldMock }

      try {
        await encodeYield()

        expect(yieldMock).toHaveBeenCalledTimes(1)
      } finally {
        if (originalScheduler === undefined) {
          delete schedulerGlobal.scheduler
        } else {
          schedulerGlobal.scheduler = originalScheduler
        }
      }
    })

    it('falls back to a timer when scheduler is unavailable', async () => {
      const schedulerGlobal = globalThis as unknown as SchedulerGlobal
      const originalScheduler = schedulerGlobal.scheduler

      delete schedulerGlobal.scheduler

      try {
        await expect(encodeYield()).resolves.toBeUndefined()
      } finally {
        if (originalScheduler !== undefined) {
          schedulerGlobal.scheduler = originalScheduler
        }
      }
    })
  })

  describe('edge cases', () => {
    it('returns empty array when total is 0', async () => {
      const getPage = jest.fn()

      const pdf = {
        numPages: 0,
        getPage
      } as unknown as PDFDocumentProxy

      const result = await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 0,
        pageLoadTimeoutMs: 5000
      })

      expect(result).toEqual([])
      expect(getPage).not.toHaveBeenCalled()
    })

    it('rejects when getPage fails', async () => {
      const getPage = jest.fn(
        async (_pageNumber: number): Promise<PDFPageProxy> => {
          throw new Error('Failed to load page')
        }
      )

      const pdf = {
        numPages: 5,
        getPage
      } as unknown as PDFDocumentProxy

      await expect(
        buildPageInfoList(pdf, 'pdf-id', {
          maxPages: 5,
          pageLoadTimeoutMs: 5000
        })
      ).rejects.toThrow('Failed to load page')
    })
  })

  describe('bounded concurrency', () => {
    it('reduces in-flight getPage calls for larger documents', async () => {
      const pageDelayMs = 50
      const maxConcurrentRef = { value: 0 }
      const maxConcurrentList: number[] = []

      const getPage = createConcurrentGetPageMock(
        pageDelayMs,
        maxConcurrentRef,
        maxConcurrentList
      )

      const pdf = {
        numPages: 10,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 10,
        pageLoadTimeoutMs: 5000
      })

      expect(getPage).toHaveBeenCalledTimes(10)
      expect(Math.max(...maxConcurrentList)).toBeLessThanOrEqual(2)
    })

    it('keeps wider concurrency for small documents', async () => {
      const pageDelayMs = 50
      const maxConcurrentRef = { value: 0 }
      const maxConcurrentList: number[] = []

      const getPage = createConcurrentGetPageMock(
        pageDelayMs,
        maxConcurrentRef,
        maxConcurrentList
      )

      const pdf = {
        numPages: 4,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 4,
        pageLoadTimeoutMs: 5000
      })

      expect(getPage).toHaveBeenCalledTimes(4)
      expect(Math.max(...maxConcurrentList)).toBeLessThanOrEqual(4)
    })

    it('falls back to sequential page loading for large documents', async () => {
      const pageDelayMs = 50
      const maxConcurrentRef = { value: 0 }
      const maxConcurrentList: number[] = []

      const getPage = createConcurrentGetPageMock(
        pageDelayMs,
        maxConcurrentRef,
        maxConcurrentList
      )

      const pdf = {
        numPages: 20,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 20,
        pageLoadTimeoutMs: 5000
      })

      expect(getPage).toHaveBeenCalledTimes(20)
      expect(Math.max(...maxConcurrentList)).toBeLessThanOrEqual(1)
    })
  })

  describe('batch sizing', () => {
    it('keeps single-session scanning for documents up to 12 pages', () => {
      expect(resolvePageScanBatchSize(4)).toBe(4)
      expect(resolvePageScanBatchSize(12)).toBe(12)
    })

    it('uses 8-page batches for larger documents', () => {
      expect(resolvePageScanBatchSize(13)).toBe(8)
      expect(resolvePageScanBatchSize(20)).toBe(8)
    })
  })

  describe('monotonic progress events', () => {
    it('emits encode:page events in strict ascending order even when pages complete out of order', async () => {
      const pageDelayMs = 30
      const tracker = createProgressTracker()

      const getPage = createDelayedGetPageMock(pageDelayMs)

      const pdf = {
        numPages: 4,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(
        pdf,
        'pdf-id',
        {
          maxPages: 4,
          pageLoadTimeoutMs: 5000
        },
        tracker.onProgress
      )

      expect(tracker.progressEvents).toEqual([1, 2, 3, 4])
    })

    it('emits progress events for all pages in order', async () => {
      const tracker = createProgressTrackerWithDetails()

      const getPage = createSimpleGetPageMock()

      const pdf = {
        numPages: 5,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(
        pdf,
        'pdf-id',
        {
          maxPages: 5,
          pageLoadTimeoutMs: 5000
        },
        tracker.onProgress
      )

      expect(tracker.progressEvents.map((e) => e.current)).toEqual([
        1, 2, 3, 4, 5
      ])
      expect(tracker.progressEvents.every((e) => e.total === 5)).toBe(true)
    })
  })

  describe('order preservation and laziness', () => {
    it('returns pages in ascending page-number order regardless of fetch completion order', async () => {
      const getPage = createVariableDelayGetPageMock()

      const pdf = {
        numPages: 4,
        getPage
      } as unknown as PDFDocumentProxy

      const result = await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 4,
        pageLoadTimeoutMs: 5000
      })

      expect(result.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4])
      expect(result[0].id).toBe('pdf-id-page-1')
      expect(result[3].id).toBe('pdf-id-page-4')
    })

    it('getData closures reuse the preloaded page data', async () => {
      const getPage = createLazyGetPageMock()

      const pdf = {
        numPages: 2,
        getPage
      } as unknown as PDFDocumentProxy

      const result = await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 2,
        pageLoadTimeoutMs: 5000
      })

      const getPageCallsBefore = getPage.mock.calls.length

      await result[0].getData()

      expect(getPage.mock.calls.length).toBe(getPageCallsBefore)
    })

    it('maxPages limits the number of pages processed', async () => {
      const getPage = createMaxPagesGetPageMock()

      const pdf = {
        numPages: 20,
        getPage
      } as unknown as PDFDocumentProxy

      const result = await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 5,
        pageLoadTimeoutMs: 5000
      })

      expect(result).toHaveLength(5)
      expect(getPage).toHaveBeenCalledTimes(5)
      expect(result[4].pageNumber).toBe(5)
    })
  })

  describe('responsiveness scheduling', () => {
    const yieldHook = jest.fn()

    beforeEach(() => {
      yieldHook.mockClear()
      const exposed = PdfParser as unknown as {
        __yieldHook: typeof yieldHook
      }
      exposed.__yieldHook = yieldHook
    })

    afterEach(() => {
      const exposed = PdfParser as unknown as {
        __yieldHook?: typeof yieldHook
      }
      delete exposed.__yieldHook
    })

    it('calls yield hook on replenishment for multi-page work (5 pages)', async () => {
      const pageDelayMs = 30
      const tracker = createProgressTracker()

      const getPage = createDelayedGetPageMock(pageDelayMs)

      const pdf = {
        numPages: 5,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(
        pdf,
        'pdf-id',
        {
          maxPages: 5,
          pageLoadTimeoutMs: 5000
        },
        tracker.onProgress
      )

      expect(yieldHook.mock.calls.length).toBeGreaterThanOrEqual(1)

      expect(tracker.progressEvents).toEqual([1, 2, 3, 4, 5])

      // All 5 pages should be processed
      expect(getPage).toHaveBeenCalledTimes(5)
    })

    it('does NOT call yield hook for single-page work', async () => {
      const tracker = createProgressTracker()

      const getPage = createSimpleGetPageMock()

      const pdf = {
        numPages: 1,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(
        pdf,
        'pdf-id',
        {
          maxPages: 1,
          pageLoadTimeoutMs: 5000
        },
        tracker.onProgress
      )

      expect(yieldHook).not.toHaveBeenCalled()

      expect(tracker.progressEvents).toEqual([1])
    })

    it('bounds getPage concurrency to <= 2 for medium documents', async () => {
      const pageDelayMs = 50
      const maxConcurrentRef = { value: 0 }
      const maxConcurrentList: number[] = []

      const getPage = createConcurrentGetPageMock(
        pageDelayMs,
        maxConcurrentRef,
        maxConcurrentList
      )

      const pdf = {
        numPages: 8,
        getPage
      } as unknown as PDFDocumentProxy

      await buildPageInfoList(pdf, 'pdf-id', {
        maxPages: 8,
        pageLoadTimeoutMs: 5000
      })

      expect(getPage).toHaveBeenCalledTimes(8)

      expect(Math.max(...maxConcurrentList)).toBeLessThanOrEqual(2)
    })
  })
})
