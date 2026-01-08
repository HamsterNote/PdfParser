import { describe, it, expect, jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import { IntermediateOutlineDestType } from '@hamster-note/types'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// Mock pdfjs-dist
jest.mock(
  'pdfjs-dist',
  () => ({
    __esModule: true,
    getDocument: jest.fn(() => ({
      promise: Promise.reject(new Error('getDocument is mocked for tests'))
    }))
  }),
  { virtual: true }
)

describe('PdfParser outline mapping methods', () => {
  describe('buildUrlDest', () => {
    const buildUrlDest = (
      PdfParser as unknown as {
        buildUrlDest: (
          node: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]
        ) =>
          | {
              targetType: IntermediateOutlineDestType
              url: string
              unsafeUrl: string | undefined
              newWindow: boolean
            }
          | undefined
      }
    ).buildUrlDest.bind(PdfParser)

    it('应该构建有效的 URL 目标', () => {
      const node = {
        title: 'External Link',
        url: 'https://example.com',
        unsafeUrl: 'https://example.com',
        newWindow: true,
        bold: true,
        italic: false
      }

      const result = buildUrlDest(node as never)

      expect(result).toBeDefined()
      expect(result?.targetType).toBe(IntermediateOutlineDestType.URL)
      expect(result?.url).toBe('https://example.com')
      expect(result?.unsafeUrl).toBe('https://example.com')
      expect(result?.newWindow).toBe(true)
    })

    it('当没有 url 时应该返回 undefined', () => {
      const node = {
        title: 'Internal Link',
        bold: false,
        italic: false
      }

      const result = buildUrlDest(node as never)

      expect(result).toBeUndefined()
    })

    it('应该处理相对 URL', () => {
      const node = {
        title: 'Relative Link',
        url: '/path/to/page',
        unsafeUrl: undefined,
        newWindow: false,
        bold: false,
        italic: false
      }

      const result = buildUrlDest(node as never)

      expect(result).toBeDefined()
      expect(result?.targetType).toBe(IntermediateOutlineDestType.URL)
      expect(result?.url).toBe('/path/to/page')
      expect(result?.unsafeUrl).toBeUndefined()
      expect(result?.newWindow).toBe(false)
    })

    it('应该将空字符串 url 视为无效并返回 undefined', () => {
      const node = {
        title: 'Empty URL',
        url: '',
        unsafeUrl: undefined,
        newWindow: false,
        bold: false,
        italic: false
      }

      const result = buildUrlDest(node as never)

      // 空字符串是 falsy 值，所以返回 undefined
      expect(result).toBeUndefined()
    })

    it('应该将 newWindow 转换为布尔值', () => {
      const nodeWithTrue = {
        title: 'Link',
        url: 'https://example.com',
        newWindow: 1,
        bold: false,
        italic: false
      }

      const result = buildUrlDest(nodeWithTrue as never)

      expect(result?.newWindow).toBe(true)

      const nodeWithFalse = {
        title: 'Link',
        url: 'https://example.com',
        newWindow: 0,
        bold: false,
        italic: false
      }

      const result2 = buildUrlDest(nodeWithFalse as never)

      expect(result2?.newWindow).toBe(false)
    })
  })

  describe('resolveDestArray', () => {
    const resolveDestArray = (
      PdfParser as unknown as {
        resolveDestArray: (
          pdf: PDFDocumentProxy,
          rawDest: Awaited<
            ReturnType<PDFDocumentProxy['getOutline']>
          >[number]['dest']
        ) => Promise<unknown[]>
      }
    ).resolveDestArray.bind(PdfParser)

    it('当 rawDest 为字符串时应该调用 getDestination', async () => {
      const mockPdf = {
        getDestination: jest
          .fn<PDFDocumentProxy['getDestination']>()
          .mockResolvedValue([1, { num: 0 }, { name: 'XYZ' }, 0, 800, null])
      } as unknown as PDFDocumentProxy

      const result = await resolveDestArray(mockPdf, 'named_dest')

      expect(mockPdf.getDestination).toHaveBeenCalledWith('named_dest')
      expect(Array.isArray(result)).toBe(true)
    })

    it('当 getDestination 返回 undefined 时应该返回空数组', async () => {
      const mockPdf = {
        getDestination: jest
          .fn<PDFDocumentProxy['getDestination']>()
          .mockResolvedValue(null)
      } as unknown as PDFDocumentProxy

      const result = await resolveDestArray(mockPdf, 'named_dest')

      expect(result).toEqual([])
    })

    it('当 getDestination 抛出错误时应该返回空数组', async () => {
      const mockPdf = {
        getDestination: jest
          .fn<PDFDocumentProxy['getDestination']>()
          .mockRejectedValue(new Error('Destination not found'))
      } as unknown as PDFDocumentProxy

      const result = await resolveDestArray(mockPdf, 'invalid_dest')

      expect(result).toEqual([])
    })

    it('当 rawDest 为数组时应该直接返回', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy
      const destArray = [1, { num: 0 }, { name: 'XYZ' }, 0, 800, null]

      const result = await resolveDestArray(mockPdf, destArray as never)

      expect(result).toBe(destArray)
    })

    it('当 rawDest 为 undefined 时应该返回空数组', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy

      const result = await resolveDestArray(
        mockPdf,
        undefined as unknown as string | null
      )

      expect(result).toEqual([])
    })

    it('当 rawDest 为 null 时应该返回空数组', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy

      const result = await resolveDestArray(mockPdf, null as never)

      expect(result).toEqual([])
    })
  })

  describe('buildPageDest', () => {
    const buildPageDest = (
      PdfParser as unknown as {
        buildPageDest: (
          pdf: PDFDocumentProxy,
          destArray: unknown[],
          pdfId: string,
          items: unknown
        ) => Promise<
          | {
              targetType: IntermediateOutlineDestType
              pageId: string
              items?: unknown[]
            }
          | undefined
        >
      }
    ).buildPageDest.bind(PdfParser)

    it('应该构建有效的页面目标', async () => {
      const mockPdf = {
        getPageIndex: jest
          .fn<PDFDocumentProxy['getPageIndex']>()
          .mockResolvedValue(2)
      } as unknown as PDFDocumentProxy

      const destArray = [{ num: 2, gen: 0 }, { name: 'XYZ' }, 0, 800, null]
      const items = undefined

      const result = await buildPageDest(mockPdf, destArray, 'pdf-123', items)

      expect(result).toBeDefined()
      expect(result?.targetType).toBe(IntermediateOutlineDestType.PAGE)
      expect(result?.pageId).toBe('pdf-123-page-3')
    })

    it('应该正确计算页码 (从 0 开始的索引)', async () => {
      const mockPdf = {
        getPageIndex: jest
          .fn<PDFDocumentProxy['getPageIndex']>()
          .mockResolvedValue(0)
      } as unknown as PDFDocumentProxy

      const destArray = [{ num: 1, gen: 0 }, { name: 'Fit' }]
      const items = undefined

      const result = await buildPageDest(mockPdf, destArray, 'pdf-123', items)

      expect(result?.pageId).toBe('pdf-123-page-1')
    })

    it('当 destArray 为空时应该返回 undefined', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy

      const result = await buildPageDest(mockPdf, [], 'pdf-123', undefined)

      expect(result).toBeUndefined()
    })

    it('当 destArray 为 undefined 时应该返回 undefined', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy

      const result = await buildPageDest(
        mockPdf,
        undefined as unknown as unknown[],
        'pdf-123',
        undefined
      )

      expect(result).toBeUndefined()
    })

    it('当 destArray 第一个元素无效时应该返回 undefined', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy

      const destArray = [null, { name: 'XYZ' }, 0, 800, null]

      const result = await buildPageDest(
        mockPdf,
        destArray,
        'pdf-123',
        undefined
      )

      expect(result).toBeUndefined()
    })

    it('当第一个元素不是对象时应该返回 undefined', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy

      const destArray = ['string_ref', { name: 'XYZ' }, 0, 800, null] as never

      const result = await buildPageDest(
        mockPdf,
        destArray,
        'pdf-123',
        undefined
      )

      expect(result).toBeUndefined()
    })

    it('当第一个元素缺少 num 属性时应该返回 undefined', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy

      const destArray = [{ gen: 0 }, { name: 'XYZ' }, 0, 800, null] as never

      const result = await buildPageDest(
        mockPdf,
        destArray,
        'pdf-123',
        undefined
      )

      expect(result).toBeUndefined()
    })

    it('当 getPageIndex 抛出错误时应该返回 undefined', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const mockPdf = {
        getPageIndex: jest
          .fn<PDFDocumentProxy['getPageIndex']>()
          .mockRejectedValue(new Error('Page not found'))
      } as unknown as PDFDocumentProxy

      const destArray = [{ num: 999, gen: 0 }, { name: 'XYZ' }, 0, 800, null]

      const result = await buildPageDest(
        mockPdf,
        destArray,
        'pdf-123',
        undefined
      )

      expect(result).toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error))

      consoleErrorSpy.mockRestore()
    })
  })

  describe('appendOutlineChildren', () => {
    it('应该将子项附加到目标', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy
      const dest: {
        targetType: IntermediateOutlineDestType
        pageId: string
        items?: unknown[]
      } = {
        targetType: IntermediateOutlineDestType.PAGE,
        pageId: 'pdf-123-page-1'
      }

      const mockChildren = [
        {
          targetType: IntermediateOutlineDestType.PAGE,
          pageId: 'pdf-123-page-2'
        },
        {
          targetType: IntermediateOutlineDestType.PAGE,
          pageId: 'pdf-123-page-3'
        }
      ]

      const mockMapChildOutlineDest = jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .fn<any>()
        .mockResolvedValue(mockChildren)

      const PdfParserWithMock = PdfParser as unknown as {
        mapChildOutlineDest: typeof mockMapChildOutlineDest
        appendOutlineChildren: (
          pdf: PDFDocumentProxy,
          items: unknown,
          pdfId: string,
          dest: {
            targetType: IntermediateOutlineDestType
            pageId: string
            items?: unknown[]
          }
        ) => Promise<{
          targetType: IntermediateOutlineDestType
          pageId: string
          items?: unknown[]
        }>
      }
      PdfParserWithMock.mapChildOutlineDest = mockMapChildOutlineDest

      const result = await PdfParserWithMock.appendOutlineChildren(
        mockPdf,
        [{ title: 'Child' }] as never,
        'pdf-123',
        dest
      )

      expect(PdfParserWithMock.mapChildOutlineDest).toHaveBeenCalledWith(
        mockPdf,
        [{ title: 'Child' }],
        'pdf-123'
      )
      expect(result).toBe(dest)
      expect(result.items).toEqual(mockChildren)
    })

    it('当没有子项时应该不添加 items 属性', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy
      const dest: {
        targetType: IntermediateOutlineDestType
        items?: unknown[]
      } = {
        targetType: IntermediateOutlineDestType.POSITION
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockMapChildOutlineDest2 = jest.fn<any>().mockResolvedValue([])

      const PdfParserWithMock = PdfParser as unknown as {
        mapChildOutlineDest: typeof mockMapChildOutlineDest2
        appendOutlineChildren: <
          T extends {
            targetType: IntermediateOutlineDestType
            items?: unknown[]
          }
        >(
          pdf: PDFDocumentProxy,
          items: unknown,
          pdfId: string,
          dest: T
        ) => Promise<T>
      }
      PdfParserWithMock.mapChildOutlineDest = mockMapChildOutlineDest2

      const result = await PdfParserWithMock.appendOutlineChildren(
        mockPdf,
        undefined,
        'pdf-123',
        dest
      )

      expect(result).toBe(dest)
      expect(result.items).toBeUndefined()
    })

    it('应该处理 undefined 的 items', async () => {
      const mockPdf = {} as unknown as PDFDocumentProxy
      const dest: {
        targetType: IntermediateOutlineDestType
        items?: unknown[]
      } = {
        targetType: IntermediateOutlineDestType.POSITION
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockMapChildOutlineDest3 = jest.fn<any>().mockResolvedValue([])

      const PdfParserWithMock = PdfParser as unknown as {
        mapChildOutlineDest: typeof mockMapChildOutlineDest3
        appendOutlineChildren: <
          T extends {
            targetType: IntermediateOutlineDestType
            items?: unknown[]
          }
        >(
          pdf: PDFDocumentProxy,
          items: unknown,
          pdfId: string,
          dest: T
        ) => Promise<T>
      }
      PdfParserWithMock.mapChildOutlineDest = mockMapChildOutlineDest3

      const result = await PdfParserWithMock.appendOutlineChildren(
        mockPdf,
        undefined,
        'pdf-123',
        dest
      )

      expect(PdfParserWithMock.mapChildOutlineDest).toHaveBeenCalledWith(
        mockPdf,
        undefined,
        'pdf-123'
      )
      expect(result).toBe(dest)
      expect(result.items).toBeUndefined()
    })
  })
})
