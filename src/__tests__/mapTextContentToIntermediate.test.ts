import { describe, it, expect } from '@jest/globals'
import { PdfParser } from '../index.js'
import { TextDir } from '@hamster-note/types'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'
import type { PageViewport } from 'pdfjs-dist'
import { Util } from 'pdfjs-dist'

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
