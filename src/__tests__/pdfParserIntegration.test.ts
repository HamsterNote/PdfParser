import { describe, it, expect, beforeAll } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import {
  IntermediateDocument,
  IntermediatePage,
  IntermediatePageMap,
  IntermediateText,
  TextDir
} from '@hamster-note/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * PDF 解析集成测试 - test_github.pdf
 * 测试文件: 4 页 GitHub 用户主页 PDF，包含 Z.X/wszxdhr 用户信息
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function createPolygon(x: number, y: number, width: number, height: number) {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height]
  ] as const
}

function getPolygonBounds(polygon: IntermediateText['polygon']) {
  const xValues = polygon.map(([x]) => x)
  const yValues = polygon.map(([, y]) => y)

  return {
    minX: Math.min(...xValues),
    maxX: Math.max(...xValues),
    minY: Math.min(...yValues),
    maxY: Math.max(...yValues)
  }
}

function createRenderableText(
  overrides: Partial<ConstructorParameters<typeof IntermediateText>[0]> = {}
) {
  return new IntermediateText({
    id: 'text-1',
    content: 'Structured text',
    fontSize: 16,
    fontFamily: 'Helvetica',
    fontWeight: 500,
    italic: false,
    color: 'transparent',
    polygon: createPolygon(24, 40, 120, 16),
    lineHeight: 16,
    ascent: 0.85,
    descent: -0.15,
    dir: TextDir.LTR,
    skew: 0,
    isEOL: false,
    ...overrides
  })
}

function createStructuredDocument(texts: IntermediateText[]) {
  return new IntermediateDocument({
    id: 'structured-doc',
    title: 'Structured',
    pagesMap: IntermediatePageMap.makeByInfoList([
      {
        id: 'structured-page-1',
        pageNumber: 1,
        size: { x: 200, y: 300 },
        getData: async () =>
          new IntermediatePage({
            id: 'structured-page-1',
            number: 1,
            width: 200,
            height: 300,
            texts,
            thumbnail: undefined
          })
      }
    ])
  })
}

function createStructuredDocumentWithPage(
  pageOverrides: Partial<ConstructorParameters<typeof IntermediatePage>[0]> = {}
) {
  return new IntermediateDocument({
    id: 'structured-doc',
    title: 'Structured',
    pagesMap: IntermediatePageMap.makeByInfoList([
      {
        id: 'structured-page-1',
        pageNumber: 1,
        size: { x: 200, y: 300 },
        getData: async () =>
          new IntermediatePage({
            id: 'structured-page-1',
            number: 1,
            width: 200,
            height: 300,
            texts: [],
            thumbnail: undefined,
            ...pageOverrides
          })
      }
    ])
  })
}

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9n7n0AAAAASUVORK5CYII='

describe('PdfParser Integration Tests - test_github.pdf', () => {
  let pdfBuffer: ArrayBuffer
  let document: Awaited<ReturnType<typeof PdfParser.encode>>
  let cjkFontBuffer: ArrayBuffer

  beforeAll(async () => {
    const pdfPath = path.resolve(__dirname, 'test_github.pdf')
    const buffer = await readFile(pdfPath)
    pdfBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
    const cjkFontPath = path.resolve(
      __dirname,
      '../../demo/assets/NotoSansSC-Regular.otf'
    )
    const cjkFont = await readFile(cjkFontPath)
    cjkFontBuffer = cjkFont.buffer.slice(
      cjkFont.byteOffset,
      cjkFont.byteOffset + cjkFont.byteLength
    )
    document = await PdfParser.encode(pdfBuffer)
  }, 30000)

  describe('PDF 文件加载', () => {
    it('应该成功加载 test_github.pdf 文件', () => {
      expect(pdfBuffer).toBeDefined()
      expect(pdfBuffer.byteLength).toBeGreaterThan(0)
    })
  })

  describe('PDF 解析结果', () => {
    it('应该成功解析 PDF 并返回 IntermediateDocument', () => {
      expect(document).toBeDefined()
      expect(document).not.toBeNull()
    })

    it('应该包含有效的文档 ID', () => {
      expect(document?.id).toBeDefined()
      expect(typeof document?.id).toBe('string')
      expect(document?.id.length).toBeGreaterThan(0)
    })

    it('应该包含文档标题', () => {
      expect(document?.title).toBeDefined()
      expect(typeof document?.title).toBe('string')
    })
  })

  describe('页面结构验证', () => {
    it('应该包含正确的页数 (4 页)', () => {
      expect(document?.pageCount).toBe(4)
    })

    it('每页都应该有有效的 ID', async () => {
      for (let i = 1; i <= 4; i++) {
        const page = await document?.getPageByPageNumber(i)
        expect(page).toBeDefined()
        expect(page?.id).toBeDefined()
        expect(page?.id).toContain(`page-${i}`)
      }
    })

    it('每页都应该有合理的尺寸', () => {
      for (let i = 1; i <= 4; i++) {
        const size = document?.getPageSizeByPageNumber(i)
        expect(size).toBeDefined()
        expect(size?.x).toBeGreaterThan(0)
        expect(size?.y).toBeGreaterThan(0)
      }
    })
  })

  describe('文本内容提取验证', () => {
    it('应该能获取第一页的数据', async () => {
      const page = await document?.getPageByPageNumber(1)
      expect(page).toBeDefined()
      expect(page?.texts).toBeDefined()
    })

    it('第一页应该包含用户名 "Z.X" 或 "wszxdhr"', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''

      const hasZX = allText.includes('Z.X')
      const hasWszxdhr = allText.includes('wszxdhr')
      expect(hasZX || hasWszxdhr).toBe(true)
    })

    it('第一页应该包含邮箱 "job@z-x.vip"', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()
      const hasEmail = normalizedText.includes('job@z-x.vip')
      expect(hasEmail).toBe(true)
    })

    it('应该包含 "followers" 和 "following" 统计信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      expect(
        normalizedText.includes('followers') ||
          normalizedText.includes('follower')
      ).toBe(true)
      expect(normalizedText.includes('following')).toBe(true)
    })

    it('应该包含 "Repositories" 信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      expect(
        normalizedText.includes('repositories') ||
          normalizedText.includes('repository')
      ).toBe(true)
    })
  })

  describe('文本属性验证', () => {
    it('文本元素应该有有效的 ID', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (let i = 0; i < Math.min(5, texts.length); i++) {
        expect(texts[i].id).toBeDefined()
        expect(texts[i].id).toContain('page-1-text-')
      }
    })

    it('文本元素应该有 polygon 位置信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        expect(text.polygon).toHaveLength(4)
        expect(Number.isFinite(text.polygon[0][0])).toBe(true)
        expect(Number.isFinite(text.polygon[0][1])).toBe(true)
      }
    })

    it('文本元素应该通过 polygon 保留尺寸信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        const bounds = getPolygonBounds(text.polygon)
        expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(0)
        expect(bounds.maxY - bounds.minY).toBeGreaterThanOrEqual(0)
      }
    })

    it('文本元素应该有字体大小信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        expect(typeof text.fontSize).toBe('number')
        expect(text.fontSize).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('多页解析验证', () => {
    it('应该能解析所有 4 页的数据', async () => {
      for (let pageNum = 1; pageNum <= 4; pageNum++) {
        const page = await document?.getPageByPageNumber(pageNum)
        expect(page).toBeDefined()
        expect(page?.number).toBe(pageNum)
      }
    })

    it('第二页应该包含活动统计信息', async () => {
      const page = await document?.getPageByPageNumber(2)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      const hasRelevantContent =
        normalizedText.includes('activity') ||
        normalizedText.includes('commits') ||
        normalizedText.includes('repositories') ||
        normalizedText.includes('pinned')

      expect(hasRelevantContent).toBe(true)
    })

    it('第三页应该包含贡献日历或项目信息', async () => {
      const page = await document?.getPageByPageNumber(3)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      const hasRelevantContent =
        normalizedText.includes('contribution') ||
        normalizedText.includes('homepage') ||
        normalizedText.includes('public') ||
        normalizedText.includes('javascript') ||
        normalizedText.includes('vue')

      expect(hasRelevantContent).toBe(true)
    })
  })

  describe('边界情况处理', () => {
    it('获取不存在的页面应该返回 undefined', async () => {
      const page = await document?.getPageByPageNumber(999)
      expect(page).toBeUndefined()
    })

    it('获取页码为 0 的页面应该返回 undefined', async () => {
      const page = await document?.getPageByPageNumber(0)
      expect(page).toBeUndefined()
    })

    it('获取负数页码的页面应该返回 undefined', async () => {
      const page = await document?.getPageByPageNumber(-1)
      expect(page).toBeUndefined()
    })
  })

  describe('decode 二进制恢复', () => {
    it('应该返回可重建 PDF 的 ArrayBuffer', async () => {
      expect(document).toBeDefined()

      const decoded = await PdfParser.decode(document as IntermediateDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect(decoded?.byteLength).toBeGreaterThan(0)

      const decodedBytes = new Uint8Array(decoded as ArrayBuffer)
      expect(Array.from(decodedBytes.subarray(0, 4))).toEqual([
        0x25, 0x50, 0x44, 0x46
      ])

      const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
      expect(reparsed?.pageCount).toBe(document?.pageCount)
    })

    it('对符合新版文本契约的结构化中间文档应该返回 ArrayBuffer', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText()
      ])

      const decoded = await PdfParser.decode(structuredDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect(decoded?.byteLength).toBeGreaterThan(0)
    })

    it('应把 `IntermediatePage.getThumbnail()` 返回的背景写入生成的 PDF', async () => {
      const structuredDocument = createStructuredDocumentWithPage({
        getThumbnailFn: async () => PNG_DATA_URL
      })

      const decoded = await PdfParser.decode(structuredDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect(decoded?.byteLength).toBeGreaterThan(0)

      const pdfSource = Buffer.from(decoded as ArrayBuffer).toString('latin1')
      expect(pdfSource).toContain('/Subtype /Image')
    })

    it('新版类型序列化往返后仍应可 decode', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText()
      ])
      const serialized =
        await IntermediateDocument.serialize(structuredDocument)
      const reparsed = IntermediateDocument.parse(serialized)

      const decoded = await PdfParser.decode(reparsed)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect(decoded?.byteLength).toBeGreaterThan(0)
    })

    it('配置中文字体后 decode 应保留中文文本', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          content: '中文测试'
        })
      ])

      PdfParser.configureDecodeFont({
        data: cjkFontBuffer
      })

      try {
        const decoded = await PdfParser.decode(structuredDocument)

        expect(decoded).toBeInstanceOf(ArrayBuffer)
        expect(decoded?.byteLength).toBeGreaterThan(0)

        const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
        const reparsedPage = await reparsed?.getPageByPageNumber(1)
        const reparsedText =
          reparsedPage?.texts?.map((t) => t.content).join('') ?? ''

        expect(reparsedText).toContain('中文测试')
      } finally {
        PdfParser.configureDecodeFont()
      }
    })

    it('配置中文字体后 decode 应保留中英混排文本', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          content: 'Hello 世界 PDF'
        })
      ])

      PdfParser.configureDecodeFont({
        data: cjkFontBuffer
      })

      try {
        const decoded = await PdfParser.decode(structuredDocument)

        expect(decoded).toBeInstanceOf(ArrayBuffer)
        expect(decoded?.byteLength).toBeGreaterThan(0)

        const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
        const reparsedPage = await reparsed?.getPageByPageNumber(1)
        const reparsedText =
          reparsedPage?.texts?.map((t) => t.content).join('') ?? ''

        expect(reparsedText).toContain('Hello')
        expect(reparsedText).toContain('世界')
        expect(reparsedText).toContain('PDF')
      } finally {
        PdfParser.configureDecodeFont()
      }
    })

    it('配置中文字体后 decode 应保留“个人主页”文本', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          content: '个人主页'
        })
      ])

      PdfParser.configureDecodeFont({
        data: cjkFontBuffer
      })

      try {
        const decoded = await PdfParser.decode(structuredDocument)

        expect(decoded).toBeInstanceOf(ArrayBuffer)
        expect(decoded?.byteLength).toBeGreaterThan(0)

        const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
        const reparsedPage = await reparsed?.getPageByPageNumber(1)
        const reparsedText =
          reparsedPage?.texts?.map((t) => t.content).join('') ?? ''

        expect(reparsedText).toContain('个人主页')
      } finally {
        PdfParser.configureDecodeFont()
      }
    })

    it('对缺少可用页面内容的文档应该返回 undefined', async () => {
      const detachedDocument = new IntermediateDocument({
        id: 'detached-doc',
        title: 'Detached',
        pagesMap: IntermediatePageMap.makeByInfoList([
          {
            id: 'detached-page-1',
            pageNumber: 1,
            size: { x: 200, y: 300 },
            getData: async () =>
              new IntermediatePage({
                id: 'detached-page-1',
                number: 1,
                width: 200,
                height: 300,
                texts: [],
                thumbnail: undefined
              })
          }
        ])
      })

      const decoded = await PdfParser.decode(detachedDocument)

      expect(decoded).toBeUndefined()
    })

    it('对缺少渲染关键字段的新版文档应该返回 undefined', async () => {
      const invalidDocument = createStructuredDocument([
        createRenderableText({
          lineHeight: 0
        })
      ])

      const decoded = await PdfParser.decode(invalidDocument)

      expect(decoded).toBeUndefined()
    })

    it('多次 decode 的结果应该互不污染', async () => {
      expect(document).toBeDefined()

      const firstDecoded = (await PdfParser.decode(
        document as IntermediateDocument
      )) as ArrayBuffer
      const secondDecoded = (await PdfParser.decode(
        document as IntermediateDocument
      )) as ArrayBuffer

      expect(firstDecoded).not.toBe(secondDecoded)

      const firstView = new Uint8Array(firstDecoded)
      const secondView = new Uint8Array(secondDecoded)
      const originalFirstByte = secondView[0]

      firstView[0] = originalFirstByte === 0 ? 1 : 0

      expect(secondView[0]).toBe(originalFirstByte)

      const thirdDecoded = (await PdfParser.decode(
        document as IntermediateDocument
      )) as ArrayBuffer
      const thirdView = new Uint8Array(thirdDecoded)

      expect(thirdView[0]).toBe(0x25)
      expect(Array.from(thirdView.subarray(0, 4))).toEqual([
        0x25, 0x50, 0x44, 0x46
      ])
    })
  })
})
