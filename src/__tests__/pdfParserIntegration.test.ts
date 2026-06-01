import { PdfParser } from '@PdfParser'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IntermediateDocument,
  IntermediateImage,
  IntermediatePage,
  IntermediatePageMap,
  IntermediateText,
  TextDir
} from '@hamster-note/types'
import { beforeAll, describe, expect, it, jest } from '@jest/globals'
import {
  decodePDFRawStream,
  PDFArray,
  PDFRawStream,
  PDFDocument as PdfLibDocument
} from 'pdf-lib'
import { OPS } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api'

/**
 * PDF 解析集成测试 - test_github.pdf
 * 测试文件: 4 页 GitHub 用户主页 PDF，包含 Z.X/wszxdhr 用户信息
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function createPolygon(
  x: number,
  y: number,
  width: number,
  height: number
): IntermediateText['polygon'] {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height]
  ]
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

function createRenderableImage(
  overrides: Partial<ConstructorParameters<typeof IntermediateImage>[0]> = {}
) {
  return new IntermediateImage({
    id: 'image-1',
    src: PNG_DATA_URL,
    polygon: createPolygon(48, 80, 32, 32),
    opacity: 0.75,
    ...overrides
  })
}

type PdfObjectGetter = (
  objectId: string,
  callback: (value: unknown) => void
) => unknown

type MockPdfPage = PDFPageProxy & {
  objs: {
    get: jest.MockedFunction<PdfObjectGetter>
  }
}

type ImageExtractionRecord = {
  id: string
  width: number
  height: number
  polygon: IntermediateImage['polygon']
  opacity: number
  src?: string
  warnings: Array<{
    type: 'unsupported'
    operator: string
    page: number
    objectId?: string
    message: string
  }>
}

function createMockPdfPage(
  fnArray: number[],
  argsArray: unknown[],
  objects: Record<string, unknown> = {}
): MockPdfPage {
  const objectGetter = jest.fn<PdfObjectGetter>((objectId, callback) => {
    callback(objects[objectId])
    return undefined
  })

  return {
    getOperatorList: jest.fn(async () => ({ fnArray, argsArray })),
    getViewport: jest.fn(() => ({
      width: 100,
      height: 100,
      transform: [1, 0, 0, 1, 0, 0]
    })),
    objs: {
      get: objectGetter
    }
  } as unknown as MockPdfPage
}

async function extractImagesFromMockPage(
  page: PDFPageProxy,
  pdfId = 'pdf-id',
  pageNumber = 1,
  timeoutMs = 100
): Promise<ImageExtractionRecord[]> {
  return (
    PdfParser as unknown as {
      extractImagesFromPage: (
        page: PDFPageProxy,
        pdfId: string,
        pageNumber: number,
        timeoutMs?: number
      ) => Promise<ImageExtractionRecord[]>
    }
  ).extractImagesFromPage(page, pdfId, pageNumber, timeoutMs)
}

function isIntermediateTextItem(item: unknown): item is IntermediateText {
  return (
    item instanceof IntermediateText ||
    (typeof item === 'object' && item !== null && 'content' in item)
  )
}

function getPageTexts(page: IntermediatePage | undefined) {
  return (page?.content ?? []).filter(isIntermediateTextItem)
}

function isIntermediateImageItem(item: unknown): item is IntermediateImage {
  return (
    item instanceof IntermediateImage ||
    (typeof item === 'object' && item !== null && 'src' in item)
  )
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
            content: texts,
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
            content: [],
            thumbnail: undefined,
            ...pageOverrides
          })
      }
    ])
  })
}

async function snapshotStructuredDocument(document: IntermediateDocument) {
  const pages: Array<{
    id: string
    number: number
    width: number
    height: number
    content: Array<Record<string, unknown>>
  }> = []

  for (const pageNumber of document.pageNumbers) {
    const page = await document.getPageByPageNumber(pageNumber)
    const content = (await page?.getContent()) ?? []

    pages.push({
      id: page?.id ?? `page-${pageNumber}`,
      number: page?.number ?? pageNumber,
      width: page?.width ?? 0,
      height: page?.height ?? 0,
      content: content.map((item) => {
        if (item instanceof IntermediateText) {
          return {
            kind: 'text',
            id: item.id,
            content: item.content,
            fontSize: item.fontSize,
            lineHeight: item.lineHeight,
            opacity: item.opacity,
            color: item.color,
            polygon: item.polygon.map(([x, y]) => [x, y]),
            ascent: item.ascent,
            descent: item.descent,
            skew: item.skew
          }
        }

        if (item instanceof IntermediateImage) {
          return {
            kind: 'image',
            id: item.id,
            src: item.src,
            opacity: item.opacity,
            polygon: item.polygon.map(([x, y]) => [x, y])
          }
        }

        return {
          kind: 'unknown'
        }
      })
    })
  }

  return {
    id: document.id,
    title: document.title,
    pageCount: document.pageCount,
    pageNumbers: [...document.pageNumbers],
    pages
  }
}

async function snapshotDecodedTextLayout(buffer: ArrayBuffer) {
  const reparsed = await PdfParser.encode(buffer)
  if (!reparsed) {
    return undefined
  }

  const pages: Array<{
    pageNumber: number
    size: { x: number; y: number }
    texts: Array<{
      content: string
      fontSize: number
      lineHeight: number
      opacity: number
    }>
  }> = []

  for (const pageNumber of reparsed.pageNumbers) {
    const page = await reparsed.getPageByPageNumber(pageNumber)
    const texts = getPageTexts(page)

    pages.push({
      pageNumber,
      size: { x: page?.width ?? 0, y: page?.height ?? 0 },
      texts: texts.map((text) => ({
        content: text.content,
        fontSize: text.fontSize,
        lineHeight: text.lineHeight,
        opacity: text.opacity
      }))
    })
  }

  return {
    pageCount: reparsed.pageCount,
    pages
  }
}

async function getDecodedPageContentStreamText(buffer: ArrayBuffer) {
  const pdfDocument = await PdfLibDocument.load(buffer)
  const page = pdfDocument.getPages()[0]
  const contents = page?.node.Contents()

  if (!contents) {
    return ''
  }

  const decodeRawStream = (stream: PDFRawStream) =>
    Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')

  if (contents instanceof PDFRawStream) {
    return decodeRawStream(contents)
  }

  if (contents instanceof PDFArray) {
    const decodedStreams: string[] = []
    for (let index = 0; index < contents.size(); index++) {
      const stream = contents.lookupMaybe(index, PDFRawStream)
      if (stream) {
        decodedStreams.push(decodeRawStream(stream))
      }
    }

    return decodedStreams.join('\n')
  }

  return contents.getContentsString()
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
      expect(page?.content).toBeDefined()
    })

    it('第一页应该包含用户名 "Z.X" 或 "wszxdhr"', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = getPageTexts(page)
        .map((t) => t.content)
        .join('')

      const hasZX = allText.includes('Z.X')
      const hasWszxdhr = allText.includes('wszxdhr')
      expect(hasZX || hasWszxdhr).toBe(true)
    })

    it('第一页应该包含邮箱 "job@z-x.vip"', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = getPageTexts(page)
        .map((t) => t.content)
        .join('')
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()
      const hasEmail = normalizedText.includes('job@z-x.vip')
      expect(hasEmail).toBe(true)
    })

    it('应该包含 "followers" 和 "following" 统计信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = getPageTexts(page)
        .map((t) => t.content)
        .join('')
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      expect(
        normalizedText.includes('followers') ||
          normalizedText.includes('follower')
      ).toBe(true)
      expect(normalizedText.includes('following')).toBe(true)
    })

    it('应该包含 "Repositories" 信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = getPageTexts(page)
        .map((t) => t.content)
        .join('')
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      expect(
        normalizedText.includes('repositories') ||
          normalizedText.includes('repository')
      ).toBe(true)
    })

    it('getContent 应返回混合内容，且文本默认透明度为 1', async () => {
      const page = await document?.getPageByPageNumber(1)
      const content = await page?.getContent()
      const texts = (content ?? []).filter(isIntermediateTextItem)
      const images = (content ?? []).filter(isIntermediateImageItem)

      expect(Array.isArray(content)).toBe(true)
      expect(texts.length).toBeGreaterThan(0)
      expect(texts.every((text) => text.opacity === 1)).toBe(true)
      expect(images.length).toBeGreaterThan(0)
      for (const image of images) {
        expect(image.id).toBeDefined()
        expect(typeof image.src).toBe('string')
        expect(image.polygon).toHaveLength(4)
        expect(typeof image.opacity).toBe('number')
      }
    })

    it('图片内容项应带有有效 type/src/polygon/opacity 字段', async () => {
      const structuredDocument = createStructuredDocumentWithPage({
        content: [createRenderableText(), createRenderableImage()]
      })
      const page = await structuredDocument.getPageByPageNumber(1)
      const content = await page?.getContent()
      const image = (content ?? []).find(isIntermediateImageItem)

      expect(image).toBeDefined()
      expect(image).toBeInstanceOf(IntermediateImage)
      expect(image?.src).toMatch(/^data:image\//)
      expect(image?.polygon).toHaveLength(4)
      image?.polygon.forEach((point) => {
        expect(point).toHaveLength(2)
        expect(Number.isFinite(point[0])).toBe(true)
        expect(Number.isFinite(point[1])).toBe(true)
      })
      expect(typeof image?.opacity).toBe('number')
    })

    it('延迟 getContent 多次调用应幂等且返回相同混合内容', async () => {
      const page = await document?.getPageByPageNumber(1)
      const firstContent = await page?.getContent()
      const secondContent = await page?.getContent()

      expect(firstContent).toEqual(secondContent)
      expect(firstContent).toBe(secondContent)
      expect((firstContent ?? []).some(isIntermediateTextItem)).toBe(true)
      expect((firstContent ?? []).some(isIntermediateImageItem)).toBe(true)
    })
  })

  describe('文本属性验证', () => {
    it('文本元素应该有有效的 ID', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = getPageTexts(page)
      expect(texts.length).toBeGreaterThan(0)

      for (let i = 0; i < Math.min(5, texts.length); i++) {
        expect(texts[i].id).toBeDefined()
        expect(texts[i].id).toContain('page-1-text-')
      }
    })

    it('文本元素应该有 polygon 位置信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = getPageTexts(page)
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        expect(text.polygon).toHaveLength(4)
        expect(Number.isFinite(text.polygon[0][0])).toBe(true)
        expect(Number.isFinite(text.polygon[0][1])).toBe(true)
      }
    })

    it('文本元素应该通过 polygon 保留尺寸信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = getPageTexts(page)
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        const bounds = getPolygonBounds(text.polygon)
        expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(0)
        expect(bounds.maxY - bounds.minY).toBeGreaterThanOrEqual(0)
      }
    })

    it('文本元素应该有字体大小信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = getPageTexts(page)
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
      const allText = getPageTexts(page)
        .map((t) => t.content)
        .join('')
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
      const allText = getPageTexts(page)
        .map((t) => t.content)
        .join('')
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
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

      const decodedBytes = new Uint8Array(decoded as ArrayBuffer)
      expect(Array.from(decodedBytes.subarray(0, 4))).toEqual([
        0x25, 0x50, 0x44, 0x46
      ])

      const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
      expect(reparsed?.pageCount).toBe(document?.pageCount)
    }, 30000)

    it('对符合新版文本契约的结构化中间文档应该返回 ArrayBuffer', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText()
      ])

      const decoded = await PdfParser.decode(structuredDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
    })

    it('text override 应全局合并且保留原始文本字段', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          id: 'text-a',
          content: 'Alpha',
          fontSize: 12,
          lineHeight: 18,
          opacity: 0.25,
          polygon: createPolygon(20, 36, 72, 12)
        }),
        createRenderableText({
          id: 'text-b',
          content: 'Beta',
          fontSize: 14,
          lineHeight: 22,
          opacity: 0.75,
          polygon: createPolygon(20, 72, 64, 14)
        })
      ])
      const textOverride = { fontSize: 24 }
      const parserStatics = PdfParser as unknown as {
        applyTextOverride: (
          text: IntermediateText,
          override: typeof textOverride | undefined
        ) => IntermediateText
      }
      const originalApplyTextOverride =
        parserStatics.applyTextOverride.bind(PdfParser)
      const appliedTexts: IntermediateText[] = []
      const applyTextOverrideSpy = jest
        .spyOn(parserStatics, 'applyTextOverride')
        .mockImplementation((text, override) => {
          const resolvedText = originalApplyTextOverride(text, override)
          appliedTexts.push(resolvedText)
          return resolvedText
        })

      let decoded: Awaited<ReturnType<typeof PdfParser.decode>> | undefined
      try {
        decoded = await PdfParser.decode(structuredDocument, {
          text: textOverride
        })
      } finally {
        applyTextOverrideSpy.mockRestore()
      }

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect(appliedTexts).toHaveLength(2)
      expect(
        appliedTexts.map((text) => ({
          content: text.content,
          fontSize: text.fontSize,
          lineHeight: text.lineHeight,
          opacity: text.opacity
        }))
      ).toEqual([
        {
          content: 'Alpha',
          fontSize: 24,
          lineHeight: 18,
          opacity: 0.25
        },
        {
          content: 'Beta',
          fontSize: 24,
          lineHeight: 22,
          opacity: 0.75
        }
      ])

      const layout = await snapshotDecodedTextLayout(decoded as ArrayBuffer)
      expect(layout).toBeDefined()
      expect(layout?.pageCount).toBe(1)

      const renderedTexts = layout?.pages.flatMap((page) => page.texts) ?? []
      expect(renderedTexts.length).toBeGreaterThan(0)

      const renderedContent = renderedTexts.map((text) => text.content).join('')
      expect(renderedContent).toContain('Alpha')
      expect(renderedContent).toContain('Beta')
      expect(textOverride).toEqual({ fontSize: 24 })
    })

    it('color override 应改变生成的 PDF 内容流', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          id: 'color-text',
          content: 'Color check',
          polygon: createPolygon(24, 52, 112, 16)
        })
      ])

      const baselineDecoded = (await PdfParser.decode(
        structuredDocument
      )) as ArrayBuffer
      const coloredDecoded = (await PdfParser.decode(structuredDocument, {
        text: { color: '#ff0000' }
      })) as ArrayBuffer

      const baselineContentStream =
        await getDecodedPageContentStreamText(baselineDecoded)
      const coloredContentStream =
        await getDecodedPageContentStreamText(coloredDecoded)

      expect(coloredContentStream).toContain('1 0 0 rg')
      expect(baselineContentStream).not.toContain('1 0 0 rg')
      expect(coloredContentStream).not.toEqual(baselineContentStream)
    })

    it('skew override 应映射到 pdf-lib 绘制选项且不抛错', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          id: 'skew-text',
          content: 'Skew check',
          polygon: createPolygon(24, 84, 120, 16)
        })
      ])

      const decoded = await PdfParser.decode(structuredDocument, {
        text: { skew: 12 }
      })

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
    })

    it('polygon/ascent/descent override 应参与文本合并和绘制度量', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          id: 'metric-text',
          content: 'Metric check',
          polygon: createPolygon(24, 40, 96, 16),
          ascent: 0.8,
          descent: -0.2
        })
      ])
      const textOverride = {
        polygon: createPolygon(48, 96, 104, 24),
        ascent: 0.6,
        descent: -0.4
      }
      const parserStatics = PdfParser as unknown as {
        applyTextOverride: (
          text: IntermediateText,
          override: typeof textOverride | undefined
        ) => IntermediateText
      }
      const originalApplyTextOverride =
        parserStatics.applyTextOverride.bind(PdfParser)
      const appliedTexts: IntermediateText[] = []
      const applyTextOverrideSpy = jest
        .spyOn(parserStatics, 'applyTextOverride')
        .mockImplementation((text, override) => {
          const resolvedText = originalApplyTextOverride(text, override)
          appliedTexts.push(resolvedText)
          return resolvedText
        })

      let decoded: Awaited<ReturnType<typeof PdfParser.decode>> | undefined
      try {
        decoded = await PdfParser.decode(structuredDocument, {
          text: textOverride
        })
      } finally {
        applyTextOverrideSpy.mockRestore()
      }

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
      expect(appliedTexts).toHaveLength(1)
      expect(appliedTexts[0]).toMatchObject({
        polygon: textOverride.polygon,
        ascent: textOverride.ascent,
        descent: textOverride.descent
      })
      expect(textOverride).toEqual({
        polygon: createPolygon(48, 96, 104, 24),
        ascent: 0.6,
        descent: -0.4
      })
    })

    it('text override 存在时，非法文档仍应返回 undefined', async () => {
      const invalidDocument = createStructuredDocument([
        createRenderableText({
          lineHeight: 0
        })
      ])

      const decoded = await PdfParser.decode(invalidDocument, {
        text: { content: 'override still invalid' }
      })

      expect(decoded).toBeUndefined()
    })

    it('{ fonts, text } 组合应同时保留字体行为和进度回调', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          content: '组合字体文本',
          polygon: createPolygon(20, 44, 120, 16)
        })
      ])
      const reporter = jest.fn()

      const decoded = await PdfParser.decode(
        structuredDocument,
        {
          fonts: { data: cjkFontBuffer },
          text: {
            content: '组合字体文本',
            fontSize: 20,
            lineHeight: 24
          }
        },
        reporter
      )

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect(reporter).toHaveBeenCalled()

      const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
      const reparsedPage = await reparsed?.getPageByPageNumber(1)
      const reparsedText = getPageTexts(reparsedPage)
        .map((text) => text.content)
        .join('')

      expect(reparsedText).toContain('组合字体文本')
    })

    it('decode 前后输入文档快照应保持不变', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          id: 'snapshot-text',
          content: 'Snapshot',
          fontSize: 15,
          lineHeight: 21,
          opacity: 0.55,
          polygon: createPolygon(18, 48, 88, 15)
        })
      ])
      const before = await snapshotStructuredDocument(structuredDocument)
      const textOverride = { content: '', fontSize: 20, opacity: undefined }

      const decoded = await PdfParser.decode(structuredDocument, {
        text: textOverride
      })

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect(await snapshotStructuredDocument(structuredDocument)).toEqual(
        before
      )
      expect(textOverride).toEqual({
        content: '',
        fontSize: 20,
        opacity: undefined
      })
    })

    it('text: undefined 应与不传 text 保持一致', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          id: 'undefined-text',
          content: 'Undefined option',
          polygon: createPolygon(24, 48, 108, 16)
        })
      ])
      const reporter = jest.fn()

      const baselineDecoded = await PdfParser.decode(structuredDocument)
      const undefinedDecoded = await PdfParser.decode(
        structuredDocument,
        { text: undefined },
        reporter
      )

      expect(undefinedDecoded).toBeInstanceOf(ArrayBuffer)
      expect(reporter).toHaveBeenCalled()

      const baselineLayout = await snapshotDecodedTextLayout(
        baselineDecoded as ArrayBuffer
      )
      const undefinedLayout = await snapshotDecodedTextLayout(
        undefinedDecoded as ArrayBuffer
      )

      expect(undefinedLayout).toEqual(baselineLayout)
    })

    it('{ content: "" } 应生成有效 PDF', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({
          id: 'blank-text',
          content: 'Visible before override',
          polygon: createPolygon(20, 42, 126, 16)
        })
      ])

      const decoded = await PdfParser.decode(structuredDocument, {
        text: { content: '' }
      })

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

      const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
      expect(reparsed?.pageCount).toBe(1)

      const page = await reparsed?.getPageByPageNumber(1)
      const textContent = getPageTexts(page)
        .map((text) => text.content)
        .join('')

      expect(textContent).toBe('')
    })

    it('应按 IntermediatePage.content 支持文本、图片、文本混合 decode', async () => {
      const structuredDocument = createStructuredDocumentWithPage({
        content: [
          createRenderableText({ id: 'text-before', content: 'Before' }),
          createRenderableImage(),
          createRenderableText({
            id: 'text-after',
            content: 'After',
            polygon: createPolygon(24, 132, 120, 16),
            opacity: 0.5
          })
        ]
      })

      const decoded = await PdfParser.decode(structuredDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
      expect(Buffer.from(decoded as ArrayBuffer).toString('latin1')).toContain(
        '/Subtype /Image'
      )
    })

    it('IntermediateImage 序列化往返后仍可保留图片字段并 decode', async () => {
      const structuredDocument = createStructuredDocumentWithPage({
        content: [
          createRenderableText({
            id: 'serialized-text',
            content: 'Serialized'
          }),
          createRenderableImage({ id: 'serialized-image', opacity: 0.5 })
        ]
      })
      const serialized =
        await IntermediateDocument.serialize(structuredDocument)
      const reparsed = IntermediateDocument.parse(serialized)
      const reparsedPage = await reparsed.getPageByPageNumber(1)
      const reparsedContent = await reparsedPage?.getContent()
      const reparsedImage = reparsedContent?.find(isIntermediateImageItem)

      expect(reparsedImage).toBeInstanceOf(IntermediateImage)
      expect(reparsedImage).toMatchObject({
        id: 'serialized-image',
        src: PNG_DATA_URL,
        opacity: 0.5
      })
      expect(reparsedImage?.polygon).toEqual(createPolygon(48, 80, 32, 32))

      const decoded = await PdfParser.decode(reparsed)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
    })

    it('遇到不支持的图片 src 应跳过，但仍生成 PDF', async () => {
      const structuredDocument = createStructuredDocumentWithPage({
        content: [
          createRenderableImage({
            id: 'unsupported-image',
            src: 'https://example.invalid/image.webp'
          })
        ]
      })

      const decoded = await PdfParser.decode(structuredDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
    })

    it('不含图片的 PDF encode 后内容应仅包含带默认 opacity 的文本', async () => {
      const decoded = await PdfParser.decode(
        createStructuredDocument([createRenderableText()])
      )
      const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
      const page = await reparsed?.getPageByPageNumber(1)
      const content = await page?.getContent()

      expect(Array.isArray(content)).toBe(true)
      expect((content ?? []).filter(isIntermediateImageItem)).toHaveLength(0)
      expect((content ?? []).filter(isIntermediateTextItem)).not.toHaveLength(0)
      expect(
        (content ?? [])
          .filter(isIntermediateTextItem)
          .every((text) => text.opacity === 1)
      ).toBe(true)
    })

    it('不含图片的 PDF getContent 应只返回文本且不会崩溃', async () => {
      const decoded = await PdfParser.decode(
        createStructuredDocument([
          createRenderableText({ content: 'Only text' })
        ])
      )
      const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
      const page = await reparsed?.getPageByPageNumber(1)

      await expect(page?.getContent()).resolves.toBeDefined()

      const content = await page?.getContent()
      expect(
        (content ?? []).filter(isIntermediateTextItem).length
      ).toBeGreaterThan(0)
      expect((content ?? []).filter(isIntermediateImageItem)).toHaveLength(0)
    })

    it('不支持的 mask/pattern/soft-mask 操作应返回 warning 且不抛错', async () => {
      const page = createMockPdfPage(
        [OPS.paintImageMaskXObject, OPS.setFillColorN, OPS.setGState],
        [['mask1'], ['pattern-name'], [['SMask', 'soft-mask']]]
      )

      await expect(extractImagesFromMockPage(page)).resolves.toHaveLength(3)

      const records = await extractImagesFromMockPage(page)
      const warnings = records.flatMap((record) => record.warnings)

      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ operator: 'paintImageMaskXObject' }),
          expect.objectContaining({ operator: 'setFillColorN' }),
          expect.objectContaining({ operator: 'setGState' })
        ])
      )
      expect(
        warnings.every(
          (warning) =>
            warning.type === 'unsupported' &&
            warning.page === 1 &&
            warning.message.length > 0
        )
      ).toBe(true)
      expect(page.objs.get).not.toHaveBeenCalled()
    })

    it('应把 `IntermediatePage.getThumbnail()` 返回的背景写入生成的 PDF', async () => {
      const structuredDocument = createStructuredDocumentWithPage({
        getThumbnailFn: async () =>
          new IntermediateImage({
            id: 'thumbnail-bg',
            src: PNG_DATA_URL,
            polygon: [
              [0, 0],
              [200, 0],
              [200, 300],
              [0, 300]
            ],
            opacity: 1
          })
      })

      const decoded = await PdfParser.decode(structuredDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

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
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
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
        expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

        const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
        const reparsedPage = await reparsed?.getPageByPageNumber(1)
        const reparsedText = getPageTexts(reparsedPage)
          .map((t) => t.content)
          .join('')

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
        expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

        const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
        const reparsedPage = await reparsed?.getPageByPageNumber(1)
        const reparsedText = getPageTexts(reparsedPage)
          .map((t) => t.content)
          .join('')

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
        expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

        const reparsed = await PdfParser.encode(decoded as ArrayBuffer)
        const reparsedPage = await reparsed?.getPageByPageNumber(1)
        const reparsedText = getPageTexts(reparsedPage)
          .map((t) => t.content)
          .join('')

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
                content: [],
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

    it('默认单参数 decode(doc) 应返回 ArrayBuffer', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({ content: '默认参数测试' })
      ])

      const decoded = await PdfParser.decode(structuredDocument)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

      const decodedBytes = new Uint8Array(decoded as ArrayBuffer)
      expect(Array.from(decodedBytes.subarray(0, 4))).toEqual([
        0x25, 0x50, 0x44, 0x46
      ])
    })

    it('decode(doc, {}, reporter) 应触发 progress 事件', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({ content: '进度事件测试' })
      ])

      const events: Array<{
        stage: 'decode:start' | 'decode:page' | 'decode:complete'
        current: number
        total: number
        message?: string
      }> = []

      const reporter = (event: (typeof events)[0]) => {
        events.push(event)
      }

      const decoded = await PdfParser.decode(structuredDocument, {}, reporter)

      expect(decoded).toBeInstanceOf(ArrayBuffer)
      expect((decoded as ArrayBuffer).byteLength).toBeGreaterThan(0)

      expect(events.length).toBeGreaterThan(0)
      expect(events[0].stage).toBe('decode:start')
      expect(events[0].current).toBe(0)
      expect(events[0].total).toBe(1)

      const pageEvents = events.filter((e) => e.stage === 'decode:page')
      expect(pageEvents.length).toBeGreaterThan(0)
      expect(pageEvents[0].current).toBe(1)

      const completeEvents = events.filter((e) => e.stage === 'decode:complete')
      expect(completeEvents.length).toBe(1)
      expect(completeEvents[0].current).toBe(1)
      expect(completeEvents[0].total).toBe(1)
    })

    it('无效输入不应触发 decode:complete 事件', async () => {
      const invalidDocument = createStructuredDocument([
        createRenderableText({
          lineHeight: 0
        })
      ])

      const events: Array<{
        stage: 'decode:start' | 'decode:page' | 'decode:complete'
        current: number
        total: number
        message?: string
      }> = []
      const reporter = (event: (typeof events)[0]) => {
        events.push(event)
      }

      const decoded = await PdfParser.decode(invalidDocument, {}, reporter)

      expect(decoded).toBeUndefined()

      const completeEvents = events.filter((e) => e.stage === 'decode:complete')
      expect(completeEvents.length).toBe(0)
    })

    it('per-call options.fonts 应替换静态字体配置', async () => {
      const staticFontDocument = createStructuredDocument([
        createRenderableText({ content: '静态字体文本' })
      ])
      const perCallFontDocument = createStructuredDocument([
        createRenderableText({ content: 'per-call 字体文本' })
      ])

      PdfParser.configureDecodeFont({
        data: cjkFontBuffer
      })

      try {
        const staticDecoded = await PdfParser.decode(staticFontDocument)
        expect(staticDecoded).toBeInstanceOf(ArrayBuffer)

        const perCallDecoded = await PdfParser.decode(perCallFontDocument, {
          fonts: { data: cjkFontBuffer }
        })
        expect(perCallDecoded).toBeInstanceOf(ArrayBuffer)
        expect((perCallDecoded as ArrayBuffer).byteLength).toBeGreaterThan(0)
      } finally {
        PdfParser.configureDecodeFont()
      }
    })

    it('两次 decode 调用使用不同 per-call fonts 不应互相泄漏', async () => {
      const doc1 = createStructuredDocument([
        createRenderableText({ content: '文档一中文本' })
      ])

      PdfParser.configureDecodeFont({
        data: cjkFontBuffer
      })

      try {
        const decoded1 = await PdfParser.decode(doc1)
        expect(decoded1).toBeInstanceOf(ArrayBuffer)

        const reparsed1 = await PdfParser.encode(decoded1 as ArrayBuffer)
        const reparsedPage1 = await reparsed1?.getPageByPageNumber(1)
        const reparsedText1 = getPageTexts(reparsedPage1)
          .map((t) => t.content)
          .join('')
        expect(reparsedText1).toContain('文档一中文本')

        const decoded2 = await PdfParser.decode(doc1, {
          fonts: undefined
        })
        expect(decoded2).toBeInstanceOf(ArrayBuffer)

        const reparsed2 = await PdfParser.encode(decoded2 as ArrayBuffer)
        const reparsedPage2 = await reparsed2?.getPageByPageNumber(1)
        const reparsedText2 = getPageTexts(reparsedPage2)
          .map((t) => t.content)
          .join('')
        expect(reparsedText2).not.toContain('文档一中文本')

        const decoded3 = await PdfParser.decode(doc1, {
          fonts: { data: cjkFontBuffer }
        })
        expect(decoded3).toBeInstanceOf(ArrayBuffer)

        const reparsed3 = await PdfParser.encode(decoded3 as ArrayBuffer)
        const reparsedPage3 = await reparsed3?.getPageByPageNumber(1)
        const reparsedText3 = getPageTexts(reparsedPage3)
          .map((t) => t.content)
          .join('')
        expect(reparsedText3).toContain('文档一中文本')
      } finally {
        PdfParser.configureDecodeFont()
      }
    })

    it('将 reporter 作为第二个参数应抛出 TypeError', async () => {
      const structuredDocument = createStructuredDocument([
        createRenderableText({ content: '参数位置测试' })
      ])

      const reporter = () => {}

      await expect(
        PdfParser.decode(
          structuredDocument,
          reporter as unknown as Record<string, unknown>
        )
      ).rejects.toThrow(
        'PdfParser.decode() no longer accepts a progress function as the second argument'
      )
    })
  })

  describe('encode 进度事件', () => {
    it('应发出完整的 encode 进度事件序列 (4 页 PDF)', async () => {
      const events: Array<{
        stage: 'encode:start' | 'encode:page' | 'encode:complete'
        current: number
        total: number
        message?: string
      }> = []

      const reporter = (event: (typeof events)[0]) => {
        events.push(event)
      }

      await PdfParser.encode(pdfBuffer, {}, reporter)

      expect(events.length).toBe(6)
      expect(events[0].stage).toBe('encode:start')
      expect(events[0].current).toBe(0)
      expect(events[0].total).toBe(4)

      const pageEvents = events.filter((e) => e.stage === 'encode:page')
      expect(pageEvents.length).toBe(4)
      expect(pageEvents[0].current).toBe(1)
      expect(pageEvents[1].current).toBe(2)
      expect(pageEvents[2].current).toBe(3)
      expect(pageEvents[3].current).toBe(4)
      pageEvents.forEach((e) => {
        expect(e.total).toBe(4)
      })

      const completeEvents = events.filter((e) => e.stage === 'encode:complete')
      expect(completeEvents.length).toBe(1)
      expect(completeEvents[0].current).toBe(4)
      expect(completeEvents[0].total).toBe(4)
    })

    it('maxPages: 2 应使 total 反映有效限制而非原始 PDF 大小', async () => {
      const events: Array<{
        stage: 'encode:start' | 'encode:page' | 'encode:complete'
        current: number
        total: number
        message?: string
      }> = []

      const reporter = (event: (typeof events)[0]) => {
        events.push(event)
      }

      await PdfParser.encode(pdfBuffer, { maxPages: 2 }, reporter)

      expect(events[0].stage).toBe('encode:start')
      expect(events[0].total).toBe(2)

      const pageEvents = events.filter((e) => e.stage === 'encode:page')
      expect(pageEvents.length).toBe(2)
      expect(pageEvents[0].current).toBe(1)
      expect(pageEvents[1].current).toBe(2)
      pageEvents.forEach((e) => {
        expect(e.total).toBe(2)
      })

      const completeEvents = events.filter((e) => e.stage === 'encode:complete')
      expect(completeEvents.length).toBe(1)
      expect(completeEvents[0].current).toBe(2)
      expect(completeEvents[0].total).toBe(2)
    })
  })
})
