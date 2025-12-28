import { describe, it, expect } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import { TextDir } from '@hamster-note/types'
import type { IntermediateText } from '@hamster-note/types'
import type { PageViewport } from 'pdfjs-dist'
import { Util } from 'pdfjs-dist'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

jest.mock(
  'pdfjs-dist',
  () => ({
    __esModule: true,
    Util: {
      transform: (m1: number[], m2: number[]) => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ]
    },
    getDocument: jest.fn(() => ({
      promise: Promise.reject(new Error('getDocument is mocked for tests'))
    }))
  }),
  { virtual: true }
)

describe('PdfParser mapTextContentToIntermediate', () => {
  const mapTextContentToIntermediate = (
    PdfParser as unknown as {
      mapTextContentToIntermediate: (
        textContent: TextContent,
        pdfId: string,
        pageNumber: number,
        viewport: Pick<PageViewport, 'height' | 'transform'>
      ) => IntermediateText[]
    }
  ).mapTextContentToIntermediate.bind(PdfParser)

  const createViewport = (
    height: number
  ): Pick<PageViewport, 'height' | 'transform'> => ({
    height,
    transform: [1, 0, 0, -1, 0, height]
  })

  const createTextItem = (overrides: Partial<TextItem> = {}): TextItem => ({
    str: 'Hello',
    dir: 'ltr',
    transform: [10, 0, 0, -10, 50, 380],
    width: 30,
    height: 10,
    fontName: 'F1',
    hasEOL: true,
    ...overrides
  })

  const createTextContent = (
    items: TextItem[],
    styles: Record<string, unknown> = {}
  ): TextContent => ({
    items,
    styles: {
      F1: {
        ascent: 0.8,
        descent: 0.2,
        vertical: false,
        fontFamily: 'Helvetica'
      },
      ...styles
    },
    lang: 'en'
  })

  describe('坐标转换', () => {
    it('应该将 Y 坐标翻转为左上角原点', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({
        transform: [10, 0, 0, -10, 50, 380]
      })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )
      const expectedMatrix = Util.transform(
        viewport.transform,
        textItem.transform
      )

      expect(result).toHaveLength(1)
      expect(result[0].x).toBeCloseTo(expectedMatrix[4])
      expect(result[0].y).toBeCloseTo(expectedMatrix[5])
      expect(result[0].y).not.toBeCloseTo(textItem.transform[5])
    })

    it('应该正确处理不同页面的坐标', () => {
      const viewport = createViewport(800)
      const textItem = createTextItem({
        transform: [12, 0, 0, 12, 100, 600]
      })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-2',
        5,
        viewport
      )

      expect(result[0].id).toBe('pdf-2-page-5-text-0')
      expect(result[0].x).toBe(100)
      // viewport.transform = [1, 0, 0, -1, 0, 800]
      // transform = [12, 0, 0, 12, 100, 600]
      // x = 1*100 + 0 = 100
      // y = -1*600 + 800 = 200
      expect(result[0].y).toBe(200)
    })
  })

  describe('内容处理', () => {
    it('应该正确提取文本内容', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ str: 'Hello World' })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].content).toBe('Hello World')
    })

    it('应该处理空字符串', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ str: '' })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('')
    })

    it('应该处理 Unicode 字符', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ str: 'Hello 世界' })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].content).toBe('Hello 世界')
    })

    it('应该处理特殊字符', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ str: 'Hello@#$%^&*()' })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].content).toBe('Hello@#$%^&*()')
    })
  })

  describe('ID 生成', () => {
    it('应该为每个文本项生成唯一 ID', () => {
      const viewport = createViewport(400)
      const textItems = [
        createTextItem({ str: 'First' }),
        createTextItem({ str: 'Second' }),
        createTextItem({ str: 'Third' })
      ]
      const textContent = createTextContent(textItems)

      const result = mapTextContentToIntermediate(
        textContent,
        'test-pdf',
        2,
        viewport
      )

      expect(result[0].id).toBe('test-pdf-page-2-text-0')
      expect(result[1].id).toBe('test-pdf-page-2-text-1')
      expect(result[2].id).toBe('test-pdf-page-2-text-2')
    })

    it('应该正确处理不同的 PDF ID', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem()
      const textContent = createTextContent([textItem])

      const result1 = mapTextContentToIntermediate(
        textContent,
        'pdf-A',
        1,
        viewport
      )
      const result2 = mapTextContentToIntermediate(
        textContent,
        'pdf-B',
        1,
        viewport
      )

      expect(result1[0].id).toBe('pdf-A-page-1-text-0')
      expect(result2[0].id).toBe('pdf-B-page-1-text-0')
    })
  })

  describe('文本方向映射', () => {
    it('应该正确映射 LTR 方向', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ dir: 'ltr' })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].dir).toBe(TextDir.LTR)
    })

    it('应该正确映射 RTL 方向', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ dir: 'rtl' })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].dir).toBe(TextDir.RTL)
    })

    it('应该正确映射 TTB 方向', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ dir: 'ttb' })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].dir).toBe(TextDir.TTB)
    })
  })

  describe('样式处理', () => {
    it('应该正确提取字体大小', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ height: 14, width: 50 })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].fontSize).toBe(14)
    })

    it('应该正确提取字体系列', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ fontName: 'F1' })
      const textContent = createTextContent([textItem], {
        F1: { fontFamily: 'Arial' }
      })

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].fontFamily).toBe('Arial')
    })

    it('当缺少样式时应该使用默认字体家族', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ fontName: 'F2' })
      const textContent = createTextContent([textItem], {}) // F2 不在样式中

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].fontFamily).toBe('')
    })

    it('应该正确处理垂直文本模式', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ fontName: 'F1' })
      const textContent = createTextContent([textItem], {
        F1: { vertical: true }
      })

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].vertical).toBe(true)
    })

    it('应该正确计算行高', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ height: 16 })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].lineHeight).toBe(16)
    })

    it('应该正确计算 ascent 和 descent', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ fontName: 'F1' })
      const textContent = createTextContent([textItem], {
        F1: { ascent: 0.85, descent: -0.15 }
      })

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].ascent).toBe(0.85)
      expect(result[0].descent).toBe(-0.15)
    })
  })

  describe('EOL 处理', () => {
    it('应该正确处理 hasEOL 标志', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ hasEOL: true })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].isEOL).toBe(true)
    })

    it('当 hasEOL 为 false 时应该正确处理', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({ hasEOL: false })
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].isEOL).toBe(false)
    })

    it('当缺少 hasEOL 时应该默认为 false', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem({})
      delete (textItem as Partial<TextItem>).hasEOL
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].isEOL).toBe(false)
    })
  })

  describe('无效项过滤', () => {
    it('应该过滤掉没有 str 属性的项', () => {
      const viewport = createViewport(400)
      const textItems = [
        createTextItem({ str: 'Valid' }),
        { width: 10, height: 10 } as unknown as TextItem, // 无效项
        createTextItem({ str: 'Also Valid' })
      ]
      const textContent = createTextContent(textItems)

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('Valid')
      expect(result[1].content).toBe('Also Valid')
    })

    it('应该过滤掉 str 不是字符串的项', () => {
      const viewport = createViewport(400)
      const textItems = [
        createTextItem({ str: 'Valid' }),
        { str: 123, width: 10, height: 10 } as unknown as TextItem, // 无效项
        createTextItem({ str: 'Also Valid' })
      ]
      const textContent = createTextContent(textItems)

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result).toHaveLength(2)
    })

    it('应该处理完全空的项目列表', () => {
      const viewport = createViewport(400)
      const textContent = createTextContent([])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result).toHaveLength(0)
    })
  })

  describe('多个文本项', () => {
    it('应该按顺序处理多个文本项', () => {
      const viewport = createViewport(400)
      const textItems = [
        createTextItem({ str: 'First', transform: [10, 0, 0, 10, 50, 100] }),
        createTextItem({ str: 'Second', transform: [10, 0, 0, 10, 50, 120] }),
        createTextItem({ str: 'Third', transform: [10, 0, 0, 10, 50, 140] })
      ]
      const textContent = createTextContent(textItems)

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result).toHaveLength(3)
      expect(result[0].content).toBe('First')
      expect(result[1].content).toBe('Second')
      expect(result[2].content).toBe('Third')
    })

    it('应该为每个文本项递增索引', () => {
      const viewport = createViewport(400)
      const textItems = Array.from({ length: 5 }, (_, i) =>
        createTextItem({ str: `Text ${i}` })
      )
      const textContent = createTextContent(textItems)

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      for (let i = 0; i < 5; i++) {
        expect(result[i].id).toContain(`text-${i}`)
      }
    })
  })

  describe('固定属性', () => {
    it('应该设置固定的 fontWeight', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem()
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].fontWeight).toBe(500)
    })

    it('应该设置固定的 italic', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem()
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].italic).toBe(false)
    })

    it('应该设置固定的颜色为 transparent', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem()
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].color).toBe('transparent')
    })

    it('应该设置固定的 rotate 和 skew', () => {
      const viewport = createViewport(400)
      const textItem = createTextItem()
      const textContent = createTextContent([textItem])

      const result = mapTextContentToIntermediate(
        textContent,
        'pdf-1',
        1,
        viewport
      )

      expect(result[0].rotate).toBe(0)
      expect(result[0].skew).toBe(0)
    })
  })
})
