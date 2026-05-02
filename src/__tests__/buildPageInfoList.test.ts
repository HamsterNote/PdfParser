import { describe, expect, it, jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
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
      getTextContent: jest.fn().mockResolvedValue({ items: [] }),
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
    it('respects max 4 in-flight getPage calls at any time', async () => {
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
      expect(Math.max(...maxConcurrentList)).toBeLessThanOrEqual(4)
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

    it('getData closures remain lazy - do not call buildIntermediatePage until invoked', async () => {
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

      expect(getPage.mock.calls.length).toBeGreaterThan(getPageCallsBefore)
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
})
