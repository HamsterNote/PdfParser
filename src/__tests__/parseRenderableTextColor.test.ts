import { describe, it, expect, jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import {
  IntermediateImage,
  IntermediateText,
  TextDir
} from '@hamster-note/types'

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
 * 私有静态方法测试：parseRenderableTextColor、isRenderableContent、isIntermediateText、isIntermediateImage
 *
 * 通过类型断言访问私有方法，遵循项目中 asTextItem.test.ts 的测试模式。
 */

// 辅助函数：创建 IntermediateText 实例
function createTextInstance(
  overrides: Partial<ConstructorParameters<typeof IntermediateText>[0]> = {}
): IntermediateText {
  return new IntermediateText({
    id: 'text-1',
    content: 'Test text',
    fontSize: 16,
    fontFamily: 'Helvetica',
    fontWeight: 500,
    italic: false,
    color: 'transparent',
    polygon: [
      [0, 0],
      [100, 0],
      [100, 20],
      [0, 20]
    ],
    lineHeight: 20,
    ascent: 0.85,
    descent: -0.15,
    dir: TextDir.LTR,
    skew: 0,
    isEOL: false,
    ...overrides
  })
}

// 辅助函数：创建 IntermediateImage 实例
function createImageInstance(
  overrides: Partial<ConstructorParameters<typeof IntermediateImage>[0]> = {}
): IntermediateImage {
  return new IntermediateImage({
    id: 'image-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    polygon: [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50]
    ],
    opacity: 1,
    ...overrides
  })
}

// 访问私有静态方法的类型断言
const parserStatics = PdfParser as unknown as {
  parseRenderableTextColor: (
    color: IntermediateText['color'] | undefined
  ) => { r: number; g: number; b: number } | undefined
  isRenderableContent: (item: unknown) => boolean
  isIntermediateText: (item: unknown) => boolean
  isIntermediateImage: (item: unknown) => boolean
}

describe('PdfParser 私有静态方法', () => {
  describe('parseRenderableTextColor', () => {
    const parseColor = parserStatics.parseRenderableTextColor.bind(PdfParser)

    it('应该解析有效的 #RRGGBB 格式', () => {
      const result = parseColor('#FF0000')
      expect(result).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('应该解析小写十六进制', () => {
      const result = parseColor('#ff0000')
      expect(result).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('应该解析混合大小写十六进制', () => {
      const result = parseColor('#aAbBcC')
      expect(result).toEqual({ r: 170, g: 187, b: 204 })
    })

    it('应该解析黑色 (#000000)', () => {
      const result = parseColor('#000000')
      expect(result).toEqual({ r: 0, g: 0, b: 0 })
    })

    it('应该解析白色 (#FFFFFF)', () => {
      const result = parseColor('#FFFFFF')
      expect(result).toEqual({ r: 255, g: 255, b: 255 })
    })

    it('应该处理带前后空格的颜色值', () => {
      const result = parseColor('  #FF0000  ')
      expect(result).toEqual({ r: 255, g: 0, b: 0 })
    })

    it('应该返回 undefined 对于 transparent', () => {
      expect(parseColor('transparent')).toBeUndefined()
    })

    it('应该返回 undefined 对于 TRANSPARENT (大小写不敏感)', () => {
      expect(parseColor('TRANSPARENT')).toBeUndefined()
    })

    it('应该返回 undefined 对于空字符串', () => {
      expect(parseColor('')).toBeUndefined()
    })

    it('应该返回 undefined 对于仅空格的字符串', () => {
      expect(parseColor('   ')).toBeUndefined()
    })

    it('应该返回 undefined 对于 undefined', () => {
      expect(parseColor(undefined)).toBeUndefined()
    })

    it('应该返回 undefined 对于非字符串类型 (number)', () => {
      expect(parseColor(123 as unknown as string)).toBeUndefined()
    })

    it('应该返回 undefined 对于非字符串类型 (object)', () => {
      expect(parseColor({} as unknown as string)).toBeUndefined()
    })

    it('应该拒绝 #RGB 格式 (3位)', () => {
      expect(parseColor('#F00')).toBeUndefined()
    })

    it('应该拒绝 #RRGGBBAA 格式 (8位)', () => {
      expect(parseColor('#FF0000FF')).toBeUndefined()
    })

    it('应该拒绝 #RGB 格式 (4位)', () => {
      expect(parseColor('#F00F')).toBeUndefined()
    })

    it('应该拒绝命名颜色 (red)', () => {
      expect(parseColor('red')).toBeUndefined()
    })

    it('应该拒绝 rgb() 函数格式', () => {
      expect(parseColor('rgb(255, 0, 0)')).toBeUndefined()
    })

    it('应该拒绝 rgba() 函数格式', () => {
      expect(parseColor('rgba(255, 0, 0, 1)')).toBeUndefined()
    })

    it('应该拒绝 hsl() 函数格式', () => {
      expect(parseColor('hsl(0, 100%, 50%)')).toBeUndefined()
    })

    it('应该拒绝不含 # 前缀的十六进制', () => {
      expect(parseColor('FF0000')).toBeUndefined()
    })

    it('应该拒绝超过6位的十六进制 (无#前缀)', () => {
      expect(parseColor('#FF0000FF')).toBeUndefined()
    })

    it('应该拒绝包含非十六进制字符的颜色', () => {
      expect(parseColor('#GGHHII')).toBeUndefined()
    })
  })

  describe('isIntermediateText', () => {
    const isText = parserStatics.isIntermediateText.bind(PdfParser)

    it('应该识别 IntermediateText 实例', () => {
      const text = createTextInstance()
      expect(isText(text)).toBe(true)
    })

    it('应该识别包含 content 属性的对象 (鸭子类型)', () => {
      const duckText = { content: 'Hello', id: 'test' }
      expect(isText(duckText)).toBe(true)
    })

    it('应该拒绝 IntermediateImage 实例', () => {
      const image = createImageInstance()
      expect(isText(image)).toBe(false)
    })

    it('应该拒绝不包含 content 属性的对象', () => {
      const invalid = { id: 'test', src: 'test.png' }
      expect(isText(invalid)).toBe(false)
    })

    it('应该拒绝 null', () => {
      expect(isText(null)).toBe(false)
    })

    it('应该拒绝 undefined', () => {
      expect(isText(undefined)).toBe(false)
    })

    it('应该拒绝原始类型 (string)', () => {
      expect(isText('text')).toBe(false)
    })

    it('应该拒绝原始类型 (number)', () => {
      expect(isText(123)).toBe(false)
    })
  })

  describe('isIntermediateImage', () => {
    const isImage = parserStatics.isIntermediateImage.bind(PdfParser)

    it('应该识别 IntermediateImage 实例', () => {
      const image = createImageInstance()
      expect(isImage(image)).toBe(true)
    })

    it('应该识别包含 src 属性的对象 (鸭子类型)', () => {
      const duckImage = { src: 'test.png', id: 'test' }
      expect(isImage(duckImage)).toBe(true)
    })

    it('应该拒绝 IntermediateText 实例', () => {
      const text = createTextInstance()
      expect(isImage(text)).toBe(false)
    })

    it('应该拒绝不包含 src 属性的对象', () => {
      const invalid = { id: 'test', content: 'Hello' }
      expect(isImage(invalid)).toBe(false)
    })

    it('应该拒绝 null', () => {
      expect(isImage(null)).toBe(false)
    })

    it('应该拒绝 undefined', () => {
      expect(isImage(undefined)).toBe(false)
    })

    it('应该拒绝原始类型 (string)', () => {
      expect(isImage('image')).toBe(false)
    })

    it('应该拒绝原始类型 (number)', () => {
      expect(isImage(123)).toBe(false)
    })
  })

  describe('isRenderableContent', () => {
    const isRenderable = parserStatics.isRenderableContent.bind(PdfParser)

    it('应该识别 IntermediateText 实例', () => {
      const text = createTextInstance()
      expect(isRenderable(text)).toBe(true)
    })

    it('应该识别 IntermediateImage 实例', () => {
      const image = createImageInstance()
      expect(isRenderable(image)).toBe(true)
    })

    it('应该识别包含 content 属性的鸭子类型对象', () => {
      const duckText = { content: 'Hello', id: 'test' }
      expect(isRenderable(duckText)).toBe(true)
    })

    it('应该识别包含 src 属性的鸭子类型对象', () => {
      const duckImage = { src: 'test.png', id: 'test' }
      expect(isRenderable(duckImage)).toBe(true)
    })

    it('应该拒绝既不是 text 也不是 image 的对象', () => {
      const invalid = { id: 'test', type: 'unknown' }
      expect(isRenderable(invalid)).toBe(false)
    })

    it('应该拒绝 null', () => {
      expect(isRenderable(null)).toBe(false)
    })

    it('应该拒绝 undefined', () => {
      expect(isRenderable(undefined)).toBe(false)
    })

    it('应该拒绝原始类型 (string)', () => {
      expect(isRenderable('content')).toBe(false)
    })

    it('应该拒绝原始类型 (number)', () => {
      expect(isRenderable(123)).toBe(false)
    })

    it('应该拒绝空对象', () => {
      expect(isRenderable({})).toBe(false)
    })
  })
})
