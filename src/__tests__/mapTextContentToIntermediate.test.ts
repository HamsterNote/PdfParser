import { describe, expect, it } from '@jest/globals'
import { PdfParser } from '../index.js'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'
import type { PageViewport } from 'pdfjs-dist'
import { TextDir } from '@hamster-note/types'

/**
 * 辅助函数：创建模拟的 TextItem
 */
function createTextItem(overrides: Partial<TextItem> = {}): TextItem {
  return {
    str: 'Hello',
    dir: 'ltr',
    transform: [12, 0, 0, 12, 50, 700], // [scaleX, skewY, skewX, scaleY, translateX, translateY]
    width: 40,
    height: 12,
    fontName: 'g_d0_f1',
    hasEOL: false,
    ...overrides
  }
}

/**
 * 辅助函数：创建模拟的 TextContent
 */
function createTextContent(
  items: TextItem[],
  styles: TextContent['styles'] = {}
): TextContent {
  return {
    items,
    styles,
    lang: null
  }
}

/**
 * 辅助函数：创建模拟的 viewport
 * PDF 坐标系是左下角原点，需要 transform 转换到左上角原点
 */
function createViewport(
  height: number = 792
): Pick<PageViewport, 'height' | 'transform'> {
  // 标准 PDF viewport transform：[scale, 0, 0, -scale, 0, height * scale]
  // 这会将 Y 轴翻转，使原点从左下角变为左上角
  return {
    height,
    transform: [1, 0, 0, -1, 0, height]
  }
}

// 由于 mapTextContentToIntermediate 是 PdfParser 的私有方法，
// 我们通过 Reflect 或类型断言来访问它进行测试
const mapTextContentToIntermediate = (
  textContent: TextContent,
  pdfId: string,
  pageNumber: number,
  viewport: Pick<PageViewport, 'height' | 'transform'>
) => {
  // 使用类型断言访问私有静态方法
  return (
    PdfParser as unknown as {
      mapTextContentToIntermediate: typeof mapTextContentToIntermediate
    }
  ).mapTextContentToIntermediate(textContent, pdfId, pageNumber, viewport)
}

describe('mapTextContentToIntermediate', () => {
  describe('基本功能', () => {
    it('maps textContent to intermediate format', () => {
      const textItem = createTextItem({
        str: 'Hello World',
        width: 80,
        height: 14,
        fontName: 'Arial'
      })
      const textContent = createTextContent([textItem], {
        Arial: {
          fontFamily: 'Arial',
          ascent: 0.9,
          descent: -0.1,
          vertical: false
        }
      })
      const viewport = createViewport(792)

      const result = mapTextContentToIntermediate(
        textContent,
        'test-pdf-id',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      const text = result[0]
      expect(text.content).toBe('Hello World')
      expect(text.id).toBe('test-pdf-id-page-1-text-0')
      expect(text.fontFamily).toBe('Arial')
      expect(text.width).toBe(80)
      expect(typeof text.x).toBe('number')
      expect(typeof text.y).toBe('number')
      expect(text.dir).toBe(TextDir.LTR)
    })

    it('handles multiple text items', () => {
      const items = [
        createTextItem({ str: 'First', fontName: 'f1' }),
        createTextItem({ str: 'Second', fontName: 'f2' }),
        createTextItem({ str: 'Third', fontName: 'f3' })
      ]
      const textContent = createTextContent(items)
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'multi-pdf',
        2,
        viewport
      )

      expect(result).toHaveLength(3)
      expect(result[0].content).toBe('First')
      expect(result[0].id).toBe('multi-pdf-page-2-text-0')
      expect(result[1].content).toBe('Second')
      expect(result[1].id).toBe('multi-pdf-page-2-text-1')
      expect(result[2].content).toBe('Third')
      expect(result[2].id).toBe('multi-pdf-page-2-text-2')
    })
  })

  describe('空内容处理', () => {
    it('returns empty array for empty items', () => {
      const textContent = createTextContent([])
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'empty-pdf',
        1,
        viewport
      )

      expect(result).toEqual([])
    })

    it('handles empty string content', () => {
      const textItem = createTextItem({ str: '' })
      const textContent = createTextContent([textItem])
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'empty-str-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('')
    })
  })

  describe('RTL 文本处理', () => {
    it('handles RTL text direction', () => {
      const textItem = createTextItem({
        str: 'مرحبا', // 阿拉伯语 "你好"
        dir: 'rtl'
      })
      const textContent = createTextContent([textItem])
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'rtl-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].dir).toBe(TextDir.RTL)
      expect(result[0].content).toBe('مرحبا')
    })

    it('handles TTB (top-to-bottom) text direction', () => {
      const textItem = createTextItem({
        str: '縦書き', // 日语 "竖排"
        dir: 'ttb'
      })
      const textContent = createTextContent([textItem])
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'ttb-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].dir).toBe(TextDir.TTB)
    })
  })

  describe('坐标变换处理', () => {
    it('handles rotated transforms', () => {
      // 90度旋转的 transform 矩阵: [0, 1, -1, 0, x, y]
      const textItem = createTextItem({
        str: 'Rotated',
        transform: [0, 12, -12, 0, 100, 500]
      })
      const textContent = createTextContent([textItem])
      const viewport = createViewport(792)

      const result = mapTextContentToIntermediate(
        textContent,
        'rotated-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Rotated')
      // 确保坐标被正确计算（具体值取决于 transform 逻辑）
      expect(typeof result[0].x).toBe('number')
      expect(typeof result[0].y).toBe('number')
      expect(Number.isFinite(result[0].x)).toBe(true)
      expect(Number.isFinite(result[0].y)).toBe(true)
    })

    it('handles scaled transforms', () => {
      // 2倍缩放的 transform: [24, 0, 0, 24, 100, 600]
      const textItem = createTextItem({
        str: 'Scaled',
        transform: [24, 0, 0, 24, 100, 600],
        height: 24
      })
      const textContent = createTextContent([textItem])
      const viewport = createViewport(792)

      const result = mapTextContentToIntermediate(
        textContent,
        'scaled-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Scaled')
      expect(result[0].height).toBe(24)
    })

    it('handles negative transform values gracefully', () => {
      // 包含负值的 transform（镜像效果）
      const textItem = createTextItem({
        str: 'Mirrored',
        transform: [-12, 0, 0, 12, 200, 400]
      })
      const textContent = createTextContent([textItem])
      const viewport = createViewport(792)

      const result = mapTextContentToIntermediate(
        textContent,
        'mirrored-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(Number.isFinite(result[0].x)).toBe(true)
      expect(Number.isFinite(result[0].y)).toBe(true)
    })
  })

  describe('字体样式处理', () => {
    it('extracts font metrics from styles', () => {
      const textItem = createTextItem({
        str: 'Styled',
        fontName: 'CustomFont',
        height: 16
      })
      const textContent = createTextContent([textItem], {
        CustomFont: {
          fontFamily: 'Helvetica Neue',
          ascent: 0.85,
          descent: -0.15,
          vertical: false
        }
      })
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'styled-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].fontFamily).toBe('Helvetica Neue')
      expect(result[0].ascent).toBe(0.85)
      expect(result[0].descent).toBe(-0.15)
    })

    it('handles missing style gracefully', () => {
      const textItem = createTextItem({
        str: 'No Style',
        fontName: 'UnknownFont'
      })
      // 不提供对应的 style
      const textContent = createTextContent([textItem], {})
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'nostyle-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('No Style')
      expect(result[0].fontFamily).toBe('')
    })

    it('handles vertical text style', () => {
      const textItem = createTextItem({
        str: '縦',
        fontName: 'VerticalFont'
      })
      const textContent = createTextContent([textItem], {
        VerticalFont: {
          fontFamily: 'MS Mincho',
          ascent: 0.88,
          descent: -0.12,
          vertical: true
        }
      })
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'vertical-pdf',
        1,
        viewport
      )

      expect(result).toHaveLength(1)
      expect(result[0].vertical).toBe(true)
    })
  })

  describe('EOL 标记处理', () => {
    it('preserves hasEOL flag', () => {
      const items = [
        createTextItem({ str: 'Line 1', hasEOL: true }),
        createTextItem({ str: 'Line 2', hasEOL: false })
      ]
      const textContent = createTextContent(items)
      const viewport = createViewport()

      const result = mapTextContentToIntermediate(
        textContent,
        'eol-pdf',
        1,
        viewport
      )

      expect(result[0].isEOL).toBe(true)
      expect(result[1].isEOL).toBe(false)
    })
  })
})
