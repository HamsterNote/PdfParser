import { describe, it, expect, jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import type { TextItem, TextStyle } from 'pdfjs-dist/types/src/display/api'

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

/**
 * 辅助函数：创建 TextItem，自动填充必需的默认值
 */
function createTextItem(overrides: Partial<TextItem> = {}): TextItem {
  return {
    str: 'Hello',
    dir: 'ltr',
    transform: [12, 0, 0, 12, 100, 100],
    width: 50,
    height: 12,
    fontName: 'F1',
    hasEOL: false,
    ...overrides
  }
}

describe('PdfParser collectMetrics', () => {
  const collectMetrics = (
    PdfParser as unknown as {
      collectMetrics: (
        textItem: TextItem,
        style: Partial<TextStyle>
      ) => {
        width: number
        height: number
        ascent: number
        descent: number
        fontFamily: string
        vertical?: boolean
        fontSize: number
        lineHeight: number
      }
    }
  ).collectMetrics.bind(PdfParser)

  describe('基础指标计算', () => {
    it('应该正确计算宽度和高度', () => {
      const textItem = createTextItem({
        width: 50,
        height: 12
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.width).toBe(50)
      expect(result.height).toBe(12)
    })

    it('应该处理负数的宽度和高度', () => {
      const textItem = createTextItem({
        str: 'Test',
        width: -50,
        height: -12
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      // Math.abs 应该处理负数
      expect(result.width).toBe(50)
      expect(result.height).toBe(12)
    })

    it('应该处理零宽度和高度', () => {
      const textItem = createTextItem({
        str: '',
        width: 0,
        height: 0
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.width).toBe(0)
      expect(result.height).toBe(0)
    })
  })

  describe('ascent 和 descent 处理', () => {
    it('应该正确提取 ascent 和 descent', () => {
      const textItem = createTextItem()
      const style: Partial<TextStyle> = {
        ascent: 0.8,
        descent: -0.2
      }

      const result = collectMetrics(textItem, style)

      expect(result.ascent).toBe(0.8)
      expect(result.descent).toBe(-0.2)
    })

    it('当缺少 style 时应该使用默认值', () => {
      const textItem = createTextItem()
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.ascent).toBe(0)
      expect(result.descent).toBe(0)
    })

    it('当 ascent/descent 为 undefined 时应该使用默认值', () => {
      const textItem = createTextItem()
      const style: Partial<TextStyle> = {
        ascent: undefined,
        descent: undefined
      }

      const result = collectMetrics(textItem, style)

      expect(result.ascent).toBe(0)
      expect(result.descent).toBe(0)
    })
  })

  describe('字体家族处理', () => {
    it('应该正确提取字体家族', () => {
      const textItem = createTextItem()
      const style: Partial<TextStyle> = {
        fontFamily: 'Helvetica'
      }

      const result = collectMetrics(textItem, style)

      expect(result.fontFamily).toBe('Helvetica')
    })

    it('当缺少 fontFamily 时应该返回空字符串', () => {
      const textItem = createTextItem()
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.fontFamily).toBe('')
    })

    it('应该处理包含中文的字体名称', () => {
      const textItem = createTextItem({ str: '你好' })
      const style: Partial<TextStyle> = {
        fontFamily: '宋体'
      }

      const result = collectMetrics(textItem, style)

      expect(result.fontFamily).toBe('宋体')
    })
  })

  describe('垂直文本模式', () => {
    it('应该正确识别垂直文本', () => {
      const textItem = createTextItem({ dir: 'ttb' })
      const style: Partial<TextStyle> = {
        vertical: true
      }

      const result = collectMetrics(textItem, style)

      expect(result.vertical).toBe(true)
    })

    it('当 vertical 为 false 时应该返回 undefined', () => {
      const textItem = createTextItem()
      const style: Partial<TextStyle> = {
        vertical: false
      }

      const result = collectMetrics(textItem, style)

      expect(result.vertical).toBeUndefined()
    })

    it('当缺少 vertical 时应该返回 undefined', () => {
      const textItem = createTextItem()
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.vertical).toBeUndefined()
    })
  })

  describe('fontSize 计算', () => {
    it('应该使用 height 作为 fontSize', () => {
      const textItem = createTextItem({
        width: 50,
        height: 14
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.fontSize).toBe(14)
    })

    it('当 height 为 0 时应该使用 |ascent - descent|', () => {
      const textItem = createTextItem({
        width: 50,
        height: 0
      })
      const style: Partial<TextStyle> = {
        ascent: 0.8,
        descent: -0.2
      }

      const result = collectMetrics(textItem, style)

      expect(result.fontSize).toBeCloseTo(1, 5)
    })

    it('当 height 和 ascent/descent 都为 0 时应该返回 0', () => {
      const textItem = createTextItem({
        str: '',
        width: 0,
        height: 0
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.fontSize).toBe(0)
    })
  })

  describe('lineHeight 计算', () => {
    it('应该使用 fontSize 作为 lineHeight', () => {
      const textItem = createTextItem({
        width: 50,
        height: 14
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.lineHeight).toBe(14)
    })

    it('当 fontSize 为 0 时应该使用 height', () => {
      const textItem = createTextItem({
        width: 50,
        height: 16
      })
      const style: Partial<TextStyle> = {
        ascent: 0,
        descent: 0
      }

      const result = collectMetrics(textItem, style)

      expect(result.lineHeight).toBe(16)
    })

    it('当所有值都为 0 时应该返回 0', () => {
      const textItem = createTextItem({
        str: '',
        width: 0,
        height: 0
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.lineHeight).toBe(0)
    })
  })

  describe('边界情况', () => {
    it('应该处理非常小的数值', () => {
      const textItem = createTextItem({
        transform: [0.001, 0, 0, 0.001, 100, 100],
        width: 0.0001,
        height: 0.001
      })
      const style: Partial<TextStyle> = {
        ascent: 0.001,
        descent: -0.001
      }

      const result = collectMetrics(textItem, style)

      expect(result.width).toBeCloseTo(0.0001, 10)
      expect(result.height).toBeCloseTo(0.001, 10)
    })

    it('应该处理非常大的数值', () => {
      const textItem = createTextItem({
        transform: [1000, 0, 0, 1000, 100, 100],
        width: 5000,
        height: 1000
      })
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      expect(result.width).toBe(5000)
      expect(result.height).toBe(1000)
    })

    it('应该处理 null 或 undefined 的 width/height', () => {
      const textItem: TextItem = {
        str: 'Hello',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        // @ts-expect-error 测试 null/undefined 处理
        width: null,
        // @ts-expect-error 测试 null/undefined 处理
        height: undefined,
        fontName: 'F1',
        hasEOL: false
      }
      const style: Partial<TextStyle> = {}

      const result = collectMetrics(textItem, style)

      // Number(null or undefined) => NaN, Math.abs(NaN) => NaN, Number(NaN || 0) => 0
      expect(result.width).toBe(0)
    })
  })

  describe('综合场景', () => {
    it('应该正确处理完整的有样式文本', () => {
      const textItem = createTextItem({
        str: 'Hello World',
        transform: [16, 0, 0, 16, 100, 100],
        width: 120,
        height: 16
      })
      const style: Partial<TextStyle> = {
        fontFamily: 'Arial',
        ascent: 0.85,
        descent: -0.15,
        vertical: false
      }

      const result = collectMetrics(textItem, style)

      expect(result.width).toBe(120)
      expect(result.height).toBe(16)
      expect(result.ascent).toBe(0.85)
      expect(result.descent).toBe(-0.15)
      expect(result.fontFamily).toBe('Arial')
      expect(result.vertical).toBeUndefined()
      expect(result.fontSize).toBe(16)
      expect(result.lineHeight).toBe(16)
    })

    it('应该正确处理垂直文本', () => {
      const textItem = createTextItem({
        str: 'vertical',
        dir: 'ttb',
        transform: [14, 0, 0, 14, 100, 100],
        width: 14,
        height: 80,
        fontName: 'F2'
      })
      const style: Partial<TextStyle> = {
        fontFamily: 'VerticalFont',
        ascent: 0.9,
        descent: -0.1,
        vertical: true
      }

      const result = collectMetrics(textItem, style)

      expect(result.width).toBe(14)
      expect(result.height).toBe(80)
      expect(result.vertical).toBe(true)
      expect(result.fontFamily).toBe('VerticalFont')
    })
  })
})
