import { describe, it, expect } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

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

describe('PdfParser asTextItem', () => {
  const asTextItem = (
    PdfParser as unknown as {
      asTextItem: (item: TextContent['items'][number]) => TextItem | undefined
    }
  ).asTextItem.bind(PdfParser)

  describe('有效 TextItem 识别', () => {
    it('应该识别有效的 TextItem', () => {
      const validItem: TextItem = {
        str: 'Hello',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1',
        hasEOL: false
      }

      const result = asTextItem(validItem)

      expect(result).toBeDefined()
      expect(result).toBe(validItem)
    })

    it('应该识别包含空字符串的 TextItem', () => {
      const itemWithEmptyStr: TextItem = {
        str: '',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 0,
        height: 12,
        fontName: 'F1',
        hasEOL: false
      }

      const result = asTextItem(itemWithEmptyStr)

      expect(result).toBeDefined()
      expect(result?.str).toBe('')
    })

    it('应该识别包含特殊字符的 TextItem', () => {
      const itemWithSpecialChars: TextItem = {
        str: 'Hello @#$%',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 80,
        height: 12,
        fontName: 'F1',
        hasEOL: false
      }

      const result = asTextItem(itemWithSpecialChars)

      expect(result).toBeDefined()
      expect(result?.str).toBe('Hello @#$%')
    })

    it('应该识别包含 Unicode 字符的 TextItem', () => {
      const itemWithUnicode: TextItem = {
        str: 'Hello 世界',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 90,
        height: 12,
        fontName: 'F1',
        hasEOL: false
      }

      const result = asTextItem(itemWithUnicode)

      expect(result).toBeDefined()
      expect(result?.str).toBe('Hello 世界')
    })
  })

  describe('无效项过滤', () => {
    it('应该过滤没有 str 属性的项', () => {
      const itemWithoutStr = {
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1'
      }

      const result = asTextItem(itemWithoutStr as never)

      expect(result).toBeUndefined()
    })

    it('应该过滤 str 为非字符串的项', () => {
      const itemWithNonStringStr = {
        str: 123,
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1'
      }

      const result = asTextItem(itemWithNonStringStr as never)

      expect(result).toBeUndefined()
    })

    it('应该过滤 str 为 null 的项', () => {
      const itemWithNullStr = {
        str: null,
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1'
      }

      const result = asTextItem(itemWithNullStr as never)

      expect(result).toBeUndefined()
    })

    it('应该过滤 str 为 undefined 的项', () => {
      const itemWithUndefinedStr = {
        str: undefined,
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1'
      }

      const result = asTextItem(itemWithUndefinedStr as never)

      expect(result).toBeUndefined()
    })

    it('应该过滤空对象', () => {
      const result = asTextItem({} as TextItem)

      expect(result).toBeUndefined()
    })

    it('应该过滤 null', () => {
      const result = asTextItem(null as never)

      expect(result).toBeUndefined()
    })

    it('应该过滤 undefined', () => {
      const result = asTextItem(undefined as never)

      expect(result).toBeUndefined()
    })
  })

  describe('边界情况', () => {
    it('应该处理只有 str 属性的最小 TextItem', () => {
      const minimalItem: TextItem = {
        str: 'A'
      } as unknown as TextItem

      const result = asTextItem(minimalItem)

      expect(result).toBeDefined()
      expect(result?.str).toBe('A')
    })

    it('应该处理数字字符串', () => {
      const numericStringItem: TextItem = {
        str: '12345',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1',
        hasEOL: false
      }

      const result = asTextItem(numericStringItem)

      expect(result).toBeDefined()
      expect(result?.str).toBe('12345')
    })

    it('应该处理包含换行符的字符串', () => {
      const itemWithNewline: TextItem = {
        str: 'Hello\nWorld',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1',
        hasEOL: false
      }

      const result = asTextItem(itemWithNewline)

      expect(result).toBeDefined()
      expect(result?.str).toBe('Hello\nWorld')
    })

    it('应该处理包含标签的字符串', () => {
      const itemWithTabs: TextItem = {
        str: 'Hello\tWorld',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        width: 50,
        height: 12,
        fontName: 'F1',
        hasEOL: false
      }

      const result = asTextItem(itemWithTabs)

      expect(result).toBeDefined()
      expect(result?.str).toBe('Hello\tWorld')
    })
  })

  describe('类型检查行为', () => {
    it('应该正确使用 typeof 检查', () => {
      const withString: TextItem = {
        str: 'test',
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        fontName: 'F1',
        width: 50,
        height: 12,
        hasEOL: false
      }

      // 验证 str 属性的类型
      expect(typeof withString.str === 'string').toBe(true)
      expect(asTextItem(withString)).toBeDefined()
    })

    it('应该拒绝对象形式的 str', () => {
      const itemWithObjectStr = {
        str: { value: 'test' },
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        fontName: 'F1'
      }

      const result = asTextItem(itemWithObjectStr as never)

      expect(result).toBeUndefined()
    })

    it('应该拒绝数组形式的 str', () => {
      const itemWithArrayStr = {
        str: ['t', 'e', 's', 't'],
        dir: 'ltr',
        transform: [12, 0, 0, 12, 100, 100],
        fontName: 'F1'
      }

      const result = asTextItem(itemWithArrayStr as never)

      expect(result).toBeUndefined()
    })
  })
})
