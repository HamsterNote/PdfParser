import { DocumentParser, type ParserInput } from '@hamster-note/document-parser'
import type {
  IntermediateContent,
  IntermediateOutlineDest,
  IntermediateOutlineDestPage,
  IntermediateOutlineDestPosition,
  IntermediateOutlineDestUrl,
  IntermediateTextPolygon,
  Number2
} from '@hamster-note/types'
import {
  IntermediateDocument,
  IntermediateImage,
  IntermediateOutline,
  IntermediateOutlineDestType,
  IntermediatePage,
  IntermediatePageMap,
  IntermediateText,
  TextDir
} from '@hamster-note/types'
import fontkit from '@pdf-lib/fontkit'
import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts
} from 'pdf-lib'
import type {
  DocumentInitParameters,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
  TextItem,
  TextStyle
} from 'pdfjs-dist/types/src/display/api'
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils'
import {
  ensurePdfjsStandardFontDataUrlConfigured,
  ensurePdfjsWorkerConfigured
} from './pdfjsWorker'
import './polyfills/dom-matrix.polyfill'
import './polyfills/promise-withresolvers.polyfill'

type RenderableText = {
  color?: { r: number; g: number; b: number }
  content: string
  font: PDFFont
  fontSize: number
  lineHeight: number
  opacity: number
  skew?: number
  x: number
  y: number
}

type PdfPagePlan = {
  background?: string
  content: IntermediateContent[]
  height: number
  pageNumber: number
  width: number
}

type DecodeFontConfig = {
  data?: ArrayBuffer | Uint8Array
  url?: string
}

type DecodeFontInput = DecodeFontConfig | DecodeFontConfig[]

type ResolvedDecodeFont = {
  font: PDFFont
  role: 'custom' | 'standard'
  supportedCodePoints: Set<number>
}

type DecodeFontSet = {
  fonts: ResolvedDecodeFont[]
  replacementCharacter: string
}

/**
 * 允许在 decode 阶段覆盖 IntermediateText 渲染属性的子集。
 * 仅包含可渲染属性；排版元数据（fontFamily、fontWeight、italic 等）不在此处，
 * 因为它们在 PDF 输出路径中没有对应语义。
 *
 * 注意：color 字段当前仅支持 6 位十六进制格式（如 #RRGGBB），
 * 不支持 #RGB、#RRGGBBAA、命名颜色或 rgb() 函数格式。
 * 不支持的格式会被静默忽略（视为未设置颜色）。
 */
export type DecodeTextOverride = Partial<
  Pick<
    IntermediateText,
    | 'content'
    | 'fontSize'
    | 'lineHeight'
    | 'opacity'
    | 'color'
    | 'polygon'
    | 'ascent'
    | 'descent'
    | 'skew'
  >
>

export type DecodeOptions = {
  fonts?: DecodeFontInput
  text?: DecodeTextOverride
}

export type EncodeOptions = {
  maxPages?: number
  pages?: number[]
  pageLoadTimeoutMs?: number
}

export type DecodeProgressEvent = {
  stage: 'decode:start' | 'decode:page' | 'decode:complete'
  current: number
  total: number
  message?: string
}

export type DecodeProgressReporter = (progress: DecodeProgressEvent) => void

export type EncodeProgressEvent = {
  stage: 'encode:start' | 'encode:page' | 'encode:complete'
  current: number
  total: number
  message?: string
}

export type EncodeProgressReporter = (progress: EncodeProgressEvent) => void

type TextMetrics = {
  width: number
  height: number
  ascent: number
  descent: number
  fontFamily: string
  vertical?: boolean
  fontSize: number
  lineHeight: number
}

type LoadedPdfSession = {
  loadingTask: PDFDocumentLoadingTask
  pdf: PDFDocumentProxy
}

type AffineTransform = [number, number, number, number, number, number]

type ImagePolygon = [
  [number, number],
  [number, number],
  [number, number],
  [number, number]
]

type PdfjsOps = (typeof import('pdfjs-dist'))['OPS']

export type RawImageData = {
  data: Uint8Array
  width: number
  height: number
  kind: number
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_COLOR_TYPE_RGBA = 6
const PNG_BIT_DEPTH_8 = 8
const PNG_FILTER_NONE = 0
const ZLIB_COMPRESSION_METHOD_DEFLATE = 0x78
const ZLIB_FASTEST_COMPRESSION_FLAGS = 0x01
const DEFLATE_FINAL_BLOCK = 0x01

interface GraphicsState {
  ctm: AffineTransform
}

export type ImageUnsupportedWarning = {
  type: 'unsupported'
  operator: string
  page: number
  objectId?: string
  message: string
}

type ImageConversionWarning = {
  type: 'image-conversion'
  message: string
}

type PdfParserWarning = ImageUnsupportedWarning | ImageConversionWarning

interface ImageExtractionRecord {
  id: string
  width: number
  height: number
  polygon: ImagePolygon
  opacity: number
  src?: string
  rawImageData?: RawImageData
  warnings: ImageUnsupportedWarning[]
}

type ImageExtractionLoopContext = {
  OPS: PdfjsOps
  page: PDFPageProxy
  pdfId: string
  pageNumber: number
  imageObjectTimeoutMs: number
  operatorNames: Map<number, string>
  unsupportedOperators: Map<number, string>
  viewportTransform: AffineTransform
  records: ImageExtractionRecord[]
}

type PdfPageObjectStore = {
  get: (objectId: string, callback: (value: unknown) => void) => unknown
}

type PageInfo = {
  id: string
  pageNumber: number
  size: Number2
  getData: () => Promise<IntermediatePage>
}

export class PdfParser extends DocumentParser {
  private static readonly defaultEncodeOptions: Required<EncodeOptions> = {
    maxPages: Number.POSITIVE_INFINITY,
    pages: [],
    pageLoadTimeoutMs: 30000
  }

  private static pdfjsModulePromise:
    | Promise<
        Pick<
          typeof import('pdfjs-dist'),
          'getDocument' | 'GlobalWorkerOptions' | 'OPS'
        >
      >
    | undefined

  private static decodeFontConfigs: DecodeFontConfig[] | undefined

  private static decodeFontBytesPromise:
    | Promise<Uint8Array[] | undefined>
    | undefined

  private static warnings: PdfParserWarning[] = []

  private static __yieldHook: (() => Promise<void>) | undefined = undefined

  static configureDecodeFont(config?: DecodeFontInput): void {
    const normalizedConfigs = PdfParser.normalizeDecodeFontConfigs(config)
    if (!normalizedConfigs || normalizedConfigs.length === 0) {
      PdfParser.decodeFontConfigs = undefined
      PdfParser.decodeFontBytesPromise = undefined
      return
    }

    PdfParser.decodeFontConfigs = normalizedConfigs
    PdfParser.decodeFontBytesPromise = undefined
  }

  async encode(_input: ParserInput): Promise<IntermediateDocument> {
    const arrayBuffer = await DocumentParser.toArrayBuffer(_input)
    const doc = await PdfParser.encode(arrayBuffer)
    if (!doc) throw new Error('Failed to parse PDF')
    return doc
  }

  static readonly exts = ['pdf'] as const

  static async encode(
    fileOrBuffer: File | ArrayBuffer,
    options: EncodeOptions = {},
    onProgress?: EncodeProgressReporter
  ): Promise<IntermediateDocument | undefined> {
    const buffer = await PdfParser.toArrayBuffer(fileOrBuffer).catch(
      () => undefined
    )
    if (!buffer) return undefined

    if (typeof options === 'function') {
      throw new TypeError(
        'PdfParser.encode() no longer accepts a progress function as the second argument. ' +
          'Use PdfParser.encode(input, options, reporter) instead.'
      )
    }

    const primarySession = await PdfParser.loadPdfSession(buffer)

    try {
      const pdf = primarySession.pdf

      let title = 'Untitled PDF'
      try {
        const meta = await pdf.getMetadata()
        title = (meta?.info as { Title: string })?.Title || title
      } catch {
        title = 'Untitled PDF'
      }
      const id = (pdf.fingerprints?.[0] ?? `pdf-${Date.now()}`) as string

      const encodeOptions = PdfParser.resolveEncodeOptions(
        options,
        pdf.numPages
      )
      const total =
        encodeOptions.pages.length > 0
          ? encodeOptions.pages.length
          : Math.min(pdf.numPages, encodeOptions.maxPages)
      if (onProgress) {
        onProgress({ stage: 'encode:start', current: 0, total })
      }
      const infoList = await PdfParser.buildPageInfoListWithSessions(
        buffer,
        pdf,
        id,
        encodeOptions,
        onProgress
      )
      const pagesMap = IntermediatePageMap.makeByInfoList(infoList)
      const outline = await PdfParser.buildOutline(pdf, id).catch(
        () => undefined
      )
      const result = new IntermediateDocument({ id, title, pagesMap, outline })
      if (onProgress) {
        onProgress({ stage: 'encode:complete', current: total, total })
      }
      return result
    } finally {
      await PdfParser.destroyLoadedPdfSession(primarySession)
    }
  }

  private static resolveEncodeOptions(
    options: EncodeOptions,
    totalPages: number
  ): Required<EncodeOptions> {
    const maxPages = Number.isFinite(options.maxPages)
      ? Math.floor(options.maxPages as number)
      : PdfParser.defaultEncodeOptions.maxPages
    const pageLoadTimeoutMs = Number.isFinite(options.pageLoadTimeoutMs)
      ? Math.floor(options.pageLoadTimeoutMs as number)
      : PdfParser.defaultEncodeOptions.pageLoadTimeoutMs
    const pages = Array.isArray(options.pages)
      ? options.pages.filter(
          (pageNumber) =>
            Number.isInteger(pageNumber) &&
            pageNumber >= 1 &&
            pageNumber <= totalPages
        )
      : PdfParser.defaultEncodeOptions.pages

    if (
      Array.isArray(options.pages) &&
      options.pages.length > 0 &&
      pages.length === 0
    ) {
      throw new RangeError('No valid pages specified for PDF encode')
    }

    return {
      maxPages: Number.isFinite(maxPages)
        ? PdfParser.clamp(maxPages, 1, Math.max(1, totalPages))
        : Math.max(1, totalPages),
      pages,
      pageLoadTimeoutMs: Math.max(1, pageLoadTimeoutMs)
    }
  }

  static async decode(
    intermediateDocument: IntermediateDocument,
    options: DecodeOptions = {},
    onProgress?: DecodeProgressReporter
  ): Promise<File | ArrayBuffer | undefined> {
    if (typeof options === 'function') {
      throw new TypeError(
        'PdfParser.decode() no longer accepts a progress function as the second argument. ' +
          'Use PdfParser.decode(document, options, reporter) instead.'
      )
    }

    const pages = await PdfParser.resolveIntermediatePages(intermediateDocument)
    if (pages.length === 0) return undefined
    const hasFontOverride = Object.hasOwn(options, 'fonts')

    const pageCount = pages.length

    if (onProgress) {
      onProgress({ stage: 'decode:start', current: 0, total: pageCount })
    }

    const pdfDocument = await PDFDocument.create()
    const decodeFontSet = await PdfParser.resolveDecodeFonts(
      pdfDocument,
      options.fonts,
      hasFontOverride
    )
    const pagePlans: PdfPagePlan[] = []
    let hasRenderableContent = false

    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]
      const pageWidth = PdfParser.normalizeDimension(page.width)
      const pageHeight = PdfParser.normalizeDimension(page.height)
      if (!pageWidth || !pageHeight) continue

      const background = await PdfParser.resolvePageBackground(page)

      const content = await PdfParser.resolvePageContent(page)
      if (content.length > 0 || background) hasRenderableContent = true
      pagePlans.push({
        width: pageWidth,
        height: pageHeight,
        content,
        background,
        pageNumber: page.number
      })

      if (onProgress) {
        onProgress({
          stage: 'decode:page',
          current: index + 1,
          total: pageCount
        })
      }
    }

    if (!hasRenderableContent || pagePlans.length === 0) return undefined

    for (const pagePlan of pagePlans) {
      const pdfPage = pdfDocument.addPage([pagePlan.width, pagePlan.height])
      await PdfParser.drawBackgroundToPdfPage(pdfDocument, pdfPage, pagePlan)
      const didDrawContent = await PdfParser.drawContentToPdfPage(
        pdfDocument,
        pdfPage,
        pagePlan,
        decodeFontSet,
        options.text
      )
      if (!didDrawContent) return undefined
    }

    const pdfBytes = await pdfDocument.save()

    if (onProgress) {
      onProgress({
        stage: 'decode:complete',
        current: pageCount,
        total: pageCount
      })
    }

    return Uint8Array.from(pdfBytes).buffer
  }

  private static async resolveIntermediatePages(
    intermediateDocument: IntermediateDocument
  ): Promise<IntermediatePage[]> {
    try {
      const pages = await intermediateDocument.pages
      if (Array.isArray(pages)) {
        return pages
      }
    } catch {
      // Ignore and fall back to page number based resolution.
    }

    const pages: IntermediatePage[] = []
    for (const pageNumber of intermediateDocument.pageNumbers) {
      const page = await intermediateDocument.getPageByPageNumber(pageNumber)
      if (page) pages.push(page)
    }
    return pages
  }

  private static async resolvePageContent(
    page: IntermediatePage
  ): Promise<IntermediateContent[]> {
    const content = await PdfParser.loadPageContent(page)
    return content.filter(PdfParser.isRenderableContent)
  }

  private static async loadPageContent(
    page: IntermediatePage
  ): Promise<IntermediateContent[]> {
    if (page.hasLoadedContent && Array.isArray(page.content)) {
      return page.content
    }

    try {
      return (await page.getContent()) ?? []
    } catch {
      return []
    }
  }

  /**
   * 检查内容项是否为可渲染的文本或图像。
   *
   * 使用鸭子类型（duck typing）进行判断：
   * - IntermediateText 实例或包含 'content' 属性的对象被视为文本
   * - IntermediateImage 实例或包含 'src' 属性的对象被视为图像
   *
   * 安全处理 null、undefined 和原始类型（返回 false）。
   */
  private static isRenderableContent(
    item: IntermediateContent
  ): item is IntermediateText | IntermediateImage {
    return (
      PdfParser.isIntermediateText(item) || PdfParser.isIntermediateImage(item)
    )
  }

  /**
   * 检查内容项是否为 IntermediateText。
   *
   * 判断逻辑：
   * 1. 如果是 IntermediateText 实例 → true
   * 2. 如果是对象且包含 'content' 属性 → true（鸭子类型）
   *
   * 安全处理 null、undefined 和原始类型（返回 false）。
   */
  private static isIntermediateText(
    item: IntermediateContent
  ): item is IntermediateText {
    return (
      item instanceof IntermediateText ||
      (typeof item === 'object' && item !== null && 'content' in item)
    )
  }

  /**
   * 检查内容项是否为 IntermediateImage。
   *
   * 判断逻辑：
   * 1. 如果是 IntermediateImage 实例 → true
   * 2. 如果是对象且包含 'src' 属性 → true（鸭子类型）
   *
   * 安全处理 null、undefined 和原始类型（返回 false）。
   */
  private static isIntermediateImage(
    item: IntermediateContent
  ): item is IntermediateImage {
    return (
      item instanceof IntermediateImage ||
      (typeof item === 'object' && item !== null && 'src' in item)
    )
  }

  private static async resolvePageBackground(
    page: IntermediatePage
  ): Promise<string | undefined> {
    try {
      const thumbnail = await page.getThumbnail()
      if (thumbnail && typeof thumbnail === 'object' && 'src' in thumbnail) {
        const src = thumbnail.src
        return typeof src === 'string' && src.trim() ? src : undefined
      }
      return undefined
    } catch {
      return undefined
    }
  }

  private static buildRenderableTexts(
    texts: IntermediateText[],
    decodeFontSet: DecodeFontSet,
    pageWidth: number,
    pageHeight: number
  ): RenderableText[] | undefined {
    const renderableTexts: RenderableText[] = []

    for (const text of texts) {
      const runs = PdfParser.normalizeTextRuns(
        String(text.content ?? ''),
        decodeFontSet
      )
      if (runs.length === 0) continue

      const normalizedContent = runs.map((run) => run.content).join('')
      if (!/\S/.test(normalizedContent)) continue

      const metrics = PdfParser.resolveRenderableTextMetrics(
        text,
        pageWidth,
        pageHeight
      )
      if (!metrics) return undefined

      const color = PdfParser.parseRenderableTextColor(text.color)
      const skew = PdfParser.normalizeSkew(text.skew)
      let currentX = metrics.x
      for (const run of runs) {
        renderableTexts.push({
          ...metrics,
          ...(color ? { color } : {}),
          content: run.content,
          font: run.font,
          opacity: PdfParser.normalizeOpacity(text.opacity),
          ...(skew !== undefined ? { skew } : {}),
          x: currentX
        })

        currentX += PdfParser.measureTextWidth(
          run.font,
          run.content,
          metrics.fontSize
        )
      }
    }

    return renderableTexts
  }

  private static parseRenderableTextColor(
    color: IntermediateText['color'] | undefined
  ): RenderableText['color'] | undefined {
    if (typeof color !== 'string') return undefined

    const normalizedColor = color.trim()
    if (!normalizedColor || normalizedColor.toLowerCase() === 'transparent') {
      return undefined
    }

    const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(normalizedColor)
    if (!hexMatch) return undefined

    const hex = hexMatch[1]
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16)
    }
  }

  private static normalizeSkew(
    skew: IntermediateText['skew']
  ): number | undefined {
    return typeof skew === 'number' && Number.isFinite(skew) ? skew : undefined
  }

  private static applyTextOverride(
    text: IntermediateText,
    override: DecodeTextOverride | undefined
  ): IntermediateText {
    const resolvedText = { ...text }

    if (!override) {
      return resolvedText
    }

    if (override.content !== undefined) {
      resolvedText.content = override.content
    }
    if (override.fontSize !== undefined) {
      resolvedText.fontSize = override.fontSize
    }
    if (override.lineHeight !== undefined) {
      resolvedText.lineHeight = override.lineHeight
    }
    if (override.opacity !== undefined) resolvedText.opacity = override.opacity
    if (override.color !== undefined) resolvedText.color = override.color
    if (override.polygon !== undefined) resolvedText.polygon = override.polygon
    if (override.ascent !== undefined) resolvedText.ascent = override.ascent
    if (override.descent !== undefined) resolvedText.descent = override.descent
    if (override.skew !== undefined) resolvedText.skew = override.skew

    return resolvedText
  }

  private static resolveRenderableTextMetrics(
    text: IntermediateText,
    pageWidth: number,
    pageHeight: number
  ): Pick<RenderableText, 'fontSize' | 'lineHeight' | 'x' | 'y'> | undefined {
    const fontSize = PdfParser.normalizeDimension(text.fontSize)
    const lineHeight = PdfParser.normalizeDimension(text.lineHeight)
    const bounds = PdfParser.getPolygonBounds(text.polygon)
    const textHeight = bounds
      ? PdfParser.normalizeDimension(bounds.maxY - bounds.minY)
      : undefined

    if (!fontSize || !lineHeight || !bounds || !textHeight) return undefined

    const verticalExtents = PdfParser.resolveTextVerticalExtents(
      text.ascent,
      text.descent,
      textHeight
    )

    return {
      fontSize,
      lineHeight,
      x: PdfParser.clamp(bounds.minX, 0, pageWidth),
      y: PdfParser.mapTextYToPdf(
        bounds.minY,
        verticalExtents.ascentHeight,
        fontSize,
        pageHeight
      )
    }
  }

  private static getPolygonBounds(
    polygon: IntermediateTextPolygon | undefined
  ):
    | {
        minX: number
        maxX: number
        minY: number
        maxY: number
      }
    | undefined {
    if (!Array.isArray(polygon) || polygon.length !== 4) return undefined

    const xValues: number[] = []
    const yValues: number[] = []

    for (const point of polygon) {
      if (!Array.isArray(point) || point.length !== 2) return undefined

      const [x, y] = point
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined

      xValues.push(x)
      yValues.push(y)
    }

    return {
      minX: Math.min(...xValues),
      maxX: Math.max(...xValues),
      minY: Math.min(...yValues),
      maxY: Math.max(...yValues)
    }
  }

  private static drawTextsToPdfPage(
    pdfPage: PDFPage,
    texts: RenderableText[]
  ): void {
    for (const text of texts) {
      pdfPage.drawText(text.content, {
        x: text.x,
        y: text.y,
        size: text.fontSize,
        lineHeight: text.lineHeight,
        font: text.font,
        opacity: text.opacity,
        ...(text.color
          ? {
              color: rgb(
                text.color.r / 255,
                text.color.g / 255,
                text.color.b / 255
              )
            }
          : {}),
        ...(text.skew !== undefined && Number.isFinite(text.skew)
          ? { xSkew: degrees(text.skew) }
          : {})
      })
    }
  }

  private static async drawContentToPdfPage(
    pdfDocument: PDFDocument,
    pdfPage: PDFPage,
    pagePlan: PdfPagePlan,
    decodeFontSet: DecodeFontSet,
    textOverride?: DecodeTextOverride
  ): Promise<boolean> {
    for (const item of pagePlan.content) {
      if (PdfParser.isIntermediateText(item)) {
        const resolvedText = PdfParser.applyTextOverride(item, textOverride)
        const renderableTexts = PdfParser.buildRenderableTexts(
          [resolvedText],
          decodeFontSet,
          pagePlan.width,
          pagePlan.height
        )
        if (renderableTexts === undefined) return false
        PdfParser.drawTextsToPdfPage(pdfPage, renderableTexts)
        continue
      }

      if (PdfParser.isIntermediateImage(item)) {
        await PdfParser.drawImageToPdfPage(
          pdfDocument,
          pdfPage,
          item,
          pagePlan.pageNumber
        )
      }
    }

    return true
  }

  private static async drawImageToPdfPage(
    pdfDocument: PDFDocument,
    pdfPage: PDFPage,
    image: IntermediateImage,
    pageNumber: number
  ): Promise<void> {
    const embeddedImage = await PdfParser.embedIntermediateImage(
      pdfDocument,
      image.src
    )
    if (!embeddedImage) {
      PdfParser.warnUnsupportedImage({
        type: 'unsupported',
        operator: 'drawImageToPdfPage',
        page: pageNumber,
        objectId: image.id,
        message: `Unsupported intermediate image source skipped: ${image.id}`
      })
      return
    }

    const bounds = PdfParser.getPolygonBounds(image.polygon)
    if (!bounds) {
      PdfParser.warnUnsupportedImage({
        type: 'unsupported',
        operator: 'drawImageToPdfPage',
        page: pageNumber,
        objectId: image.id,
        message: `Intermediate image with invalid polygon skipped: ${image.id}`
      })
      return
    }

    const width = PdfParser.normalizeDimension(bounds.maxX - bounds.minX)
    const height = PdfParser.normalizeDimension(bounds.maxY - bounds.minY)
    if (!width || !height) {
      PdfParser.warnUnsupportedImage({
        type: 'unsupported',
        operator: 'drawImageToPdfPage',
        page: pageNumber,
        objectId: image.id,
        message: `Intermediate image with empty bounds skipped: ${image.id}`
      })
      return
    }

    pdfPage.drawImage(embeddedImage, {
      x: bounds.minX,
      y: bounds.minY,
      width,
      height,
      opacity: PdfParser.normalizeOpacity(image.opacity)
    })
  }

  private static async embedIntermediateImage(
    pdfDocument: PDFDocument,
    src: string
  ) {
    try {
      if (/^data:image\/jpe?g(;base64)?,/i.test(src)) {
        return await pdfDocument.embedJpg(src)
      }

      if (/^data:image\/png(;base64)?,/i.test(src)) {
        return await pdfDocument.embedPng(src)
      }
    } catch {
      return undefined
    }

    return undefined
  }

  private static async drawBackgroundToPdfPage(
    pdfDocument: PDFDocument,
    pdfPage: PDFPage,
    pagePlan: PdfPagePlan
  ): Promise<void> {
    if (!pagePlan.background) return

    const image = await PdfParser.embedPageBackground(
      pdfDocument,
      pagePlan.background
    )
    if (!image) return

    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: pagePlan.width,
      height: pagePlan.height
    })
  }

  private static async embedPageBackground(
    pdfDocument: PDFDocument,
    background: string
  ) {
    try {
      if (/^data:image\/jpe?g(;base64)?,/i.test(background)) {
        return await pdfDocument.embedJpg(background)
      }

      if (/^data:image\/png(;base64)?,/i.test(background)) {
        return await pdfDocument.embedPng(background)
      }
    } catch {
      return undefined
    }

    return undefined
  }

  private static normalizeTextRuns(
    text: string,
    decodeFontSet: DecodeFontSet
  ): Array<{
    content: string
    font: PDFFont
  }> {
    const runs: Array<{
      content: string
      font: PDFFont
    }> = []

    for (const rawCharacter of Array.from(text)) {
      const character =
        rawCharacter === '\n' || rawCharacter === '\r' ? ' ' : rawCharacter
      const selectedRun = PdfParser.selectFontRunForCharacter(
        character,
        decodeFontSet
      )

      if (!selectedRun) {
        continue
      }

      const previousRun = runs.at(-1)
      if (previousRun?.font === selectedRun.font) {
        previousRun.content += selectedRun.content
        continue
      }

      runs.push(selectedRun)
    }

    return runs
  }

  private static selectFontRunForCharacter(
    character: string,
    decodeFontSet: DecodeFontSet
  ):
    | {
        content: string
        font: PDFFont
      }
    | undefined {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined) {
      const matchedFont = PdfParser.findPreferredFontForCodePoint(
        codePoint,
        decodeFontSet.fonts
      )
      if (matchedFont) {
        return {
          content: character,
          font: matchedFont.font
        }
      }
    }

    const replacementCodePoint =
      decodeFontSet.replacementCharacter.codePointAt(0)
    if (replacementCodePoint === undefined) {
      return undefined
    }

    const replacementFont = PdfParser.findPreferredFontForCodePoint(
      replacementCodePoint,
      decodeFontSet.fonts
    )
    if (!replacementFont) {
      return undefined
    }

    return {
      content: decodeFontSet.replacementCharacter,
      font: replacementFont.font
    }
  }

  private static findPreferredFontForCodePoint(
    codePoint: number,
    fonts: ResolvedDecodeFont[]
  ): ResolvedDecodeFont | undefined {
    const preferredRoles = PdfParser.isPrintableAscii(codePoint)
      ? (['standard', 'custom'] as const)
      : (['custom', 'standard'] as const)

    for (const role of preferredRoles) {
      const matchedFont = fonts.find(
        (font) => font.role === role && font.supportedCodePoints.has(codePoint)
      )
      if (matchedFont) {
        return matchedFont
      }
    }

    return undefined
  }

  private static isPrintableAscii(codePoint: number): boolean {
    return codePoint >= 0x20 && codePoint <= 0x7e
  }

  private static measureTextWidth(
    font: PDFFont,
    content: string,
    fontSize: number
  ): number {
    if (!content) {
      return 0
    }

    return font.widthOfTextAtSize(content, fontSize)
  }

  private static async resolveDecodeFonts(
    pdfDocument: PDFDocument,
    fontOverride: DecodeFontInput | undefined,
    hasFontOverride = false
  ): Promise<DecodeFontSet> {
    const fonts: ResolvedDecodeFont[] = []
    const customFontBytesList = hasFontOverride
      ? await PdfParser.loadDecodeFontBytesForConfig(fontOverride)
      : await PdfParser.loadDecodeFontBytes()

    if (customFontBytesList) {
      pdfDocument.registerFontkit(fontkit)
      for (const customFontBytes of customFontBytesList) {
        const font = await pdfDocument.embedFont(customFontBytes, {
          subset: false
        })

        fonts.push({
          font,
          role: 'custom',
          supportedCodePoints: new Set(font.getCharacterSet())
        })
      }
    }

    const font = await pdfDocument.embedFont(StandardFonts.Helvetica)
    fonts.push({
      font,
      role: 'standard',
      supportedCodePoints: new Set(font.getCharacterSet())
    })

    return {
      fonts,
      replacementCharacter: '?'
    }
  }

  private static async loadDecodeFontBytes(): Promise<
    Uint8Array[] | undefined
  > {
    const configs = PdfParser.decodeFontConfigs
    if (!configs || configs.length === 0) {
      return undefined
    }

    if (!PdfParser.decodeFontBytesPromise) {
      PdfParser.decodeFontBytesPromise =
        PdfParser.resolveDecodeFontBytesList(configs)
    }

    return PdfParser.decodeFontBytesPromise
  }

  private static async loadDecodeFontBytesForConfig(
    fontInput?: DecodeFontInput
  ): Promise<Uint8Array[] | undefined> {
    const configs = PdfParser.normalizeDecodeFontConfigs(fontInput)
    if (!configs || configs.length === 0) {
      return undefined
    }

    return PdfParser.resolveDecodeFontBytesList(configs)
  }

  private static async resolveDecodeFontBytesList(
    configs: DecodeFontConfig[]
  ): Promise<Uint8Array[] | undefined> {
    const results = await Promise.all(
      configs.map((config) => PdfParser.resolveDecodeFontBytes(config))
    )
    const validResults = results.filter(
      (result): result is Uint8Array => result instanceof Uint8Array
    )

    return validResults.length > 0 ? validResults : undefined
  }

  private static async resolveDecodeFontBytes(
    config: DecodeFontConfig
  ): Promise<Uint8Array | undefined> {
    if (config.data) {
      return PdfParser.cloneUint8Array(
        PdfParser.normalizeDecodeFontData(config.data)
      )
    }

    if (!config.url) {
      return undefined
    }

    const response = await fetch(config.url)
    if (!response.ok) {
      throw new Error(`Failed to load decode font: ${response.status}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  private static normalizeDecodeFontData(
    data: ArrayBuffer | Uint8Array
  ): Uint8Array {
    if (data instanceof Uint8Array) {
      return data
    }

    return new Uint8Array(data)
  }

  private static cloneUint8Array(data: Uint8Array): Uint8Array {
    return new Uint8Array(data)
  }

  private static normalizeDecodeFontConfigs(
    config?: DecodeFontInput
  ): DecodeFontConfig[] | undefined {
    if (!config) {
      return undefined
    }

    const configList = Array.isArray(config) ? config : [config]
    const normalizedConfigs = configList
      .filter((item) => Boolean(item?.data || item?.url))
      .map((item) => ({
        data: item.data
          ? PdfParser.cloneUint8Array(
              PdfParser.normalizeDecodeFontData(item.data)
            )
          : undefined,
        url: item.url
      }))

    return normalizedConfigs.length > 0 ? normalizedConfigs : undefined
  }

  private static normalizeDimension(value: number): number | undefined {
    return Number.isFinite(value) && value > 0 ? value : undefined
  }

  private static normalizeOpacity(value: number | undefined): number {
    return PdfParser.clamp(value ?? 1, 0, 1)
  }

  private static clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min
    if (value < min) return min
    if (value > max) return max
    return value
  }

  private static mapTextYToPdf(
    topY: number,
    baselineOffset: number,
    fontSize: number,
    pageHeight: number
  ): number {
    const candidateY = pageHeight - topY - baselineOffset
    const maxY = Math.max(0, pageHeight - fontSize)
    return PdfParser.clamp(candidateY, 0, maxY)
  }

  private static async loadPdfSession(
    data: ArrayBuffer,
    overrides?: Partial<DocumentInitParameters>
  ): Promise<LoadedPdfSession> {
    const { getDocument, GlobalWorkerOptions } =
      await PdfParser.loadPdfjsModule()
    ensurePdfjsWorkerConfigured(GlobalWorkerOptions)
    const standardFontDataUrl = ensurePdfjsStandardFontDataUrlConfigured()
    const dataCopy = data.slice(0)
    const loadingTask = getDocument({
      ...(overrides ?? {}),
      data: new Uint8Array(dataCopy),
      standardFontDataUrl
    } as Parameters<typeof getDocument>[0])
    const pdf = await loadingTask.promise

    return {
      loadingTask,
      pdf
    }
  }

  private static async destroyLoadedPdfSession(
    session: LoadedPdfSession | undefined
  ): Promise<void> {
    if (!session) {
      return
    }

    try {
      session.pdf.cleanup()
    } catch {
      // Ignore cleanup errors while tearing down the document session.
    }

    await session.loadingTask.destroy().catch(() => undefined)
  }

  private static loadPdfjsModule(): Promise<
    Pick<
      typeof import('pdfjs-dist'),
      'getDocument' | 'GlobalWorkerOptions' | 'OPS'
    >
  > {
    if (!PdfParser.pdfjsModulePromise) {
      PdfParser.pdfjsModulePromise = import('pdfjs-dist')
    }
    return PdfParser.pdfjsModulePromise
  }

  private static async encodeYield(): Promise<void> {
    if (PdfParser.__yieldHook) {
      return PdfParser.__yieldHook()
    }

    const g = globalThis as unknown as {
      scheduler?: { yield?: () => Promise<void> }
    }
    if (typeof g.scheduler?.yield === 'function') {
      return g.scheduler.yield()
    }

    return new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  private static async buildPageInfoListWithSessions(
    data: ArrayBuffer,
    pdf: PDFDocumentProxy,
    pdfId: string,
    options: Required<EncodeOptions>,
    onProgress?: EncodeProgressReporter
  ): Promise<PageInfo[]> {
    const pageNumbers =
      Array.isArray(options.pages) && options.pages.length > 0
        ? options.pages
        : undefined
    const total = pageNumbers
      ? pageNumbers.length
      : Math.min(pdf.numPages, options.maxPages)
    if (total === 0) {
      return []
    }

    const batchSize = PdfParser.resolvePageScanBatchSize(total)
    if (batchSize >= total) {
      return PdfParser.buildPageInfoList(pdf, pdfId, options, onProgress, data)
    }

    const concurrency = PdfParser.resolvePageScanConcurrency(total)
    const infoList: PageInfo[] = []

    for (let startIndex = 0; startIndex < total; startIndex += batchSize) {
      const batchPageNumbers = pageNumbers?.slice(
        startIndex,
        startIndex + batchSize
      )
      const startPage = batchPageNumbers?.[0] ?? startIndex + 1
      const endPage =
        batchPageNumbers?.[batchPageNumbers.length - 1] ??
        Math.min(total, startPage + batchSize - 1)
      const batchSession = await PdfParser.loadPdfSession(data)

      try {
        await PdfParser.buildPageInfoRange(
          batchSession.pdf,
          pdfId,
          startPage,
          endPage,
          concurrency,
          options.pageLoadTimeoutMs,
          data,
          async (pageInfo) => {
            infoList.push(pageInfo)
            if (onProgress) {
              onProgress({
                stage: 'encode:page',
                current: pageInfo.pageNumber,
                total
              })
            }
          },
          batchPageNumbers
        )
      } finally {
        await PdfParser.destroyLoadedPdfSession(batchSession)
      }
    }

    return infoList
  }

  private static async buildPageInfoList(
    pdf: PDFDocumentProxy,
    pdfId: string,
    options: Required<EncodeOptions>,
    onProgress: EncodeProgressReporter | undefined,
    documentData: ArrayBuffer
  ): Promise<PageInfo[]> {
    const pageNumbers =
      Array.isArray(options.pages) && options.pages.length > 0
        ? options.pages
        : undefined
    const total = pageNumbers
      ? pageNumbers.length
      : Math.min(pdf.numPages, options.maxPages)
    if (total === 0) {
      return []
    }
    const concurrency = PdfParser.resolvePageScanConcurrency(total)
    const infoList: PageInfo[] = []

    await PdfParser.buildPageInfoRange(
      pdf,
      pdfId,
      1,
      total,
      concurrency,
      options.pageLoadTimeoutMs,
      documentData,
      async (pageInfo) => {
        infoList.push(pageInfo)
        if (onProgress) {
          onProgress({
            stage: 'encode:page',
            current: pageInfo.pageNumber,
            total
          })
        }
      },
      pageNumbers
    )

    return infoList
  }

  private static resolvePageScanConcurrency(totalPages: number): number {
    if (totalPages <= 4) {
      return Math.max(1, totalPages)
    }

    if (totalPages <= 12) {
      return 2
    }

    return 1
  }

  private static resolvePageScanBatchSize(totalPages: number): number {
    if (totalPages <= 12) {
      return totalPages
    }

    return 8
  }

  private static async buildPageInfoRange(
    pdf: PDFDocumentProxy,
    pdfId: string,
    startPage: number,
    endPage: number,
    concurrency: number,
    pageLoadTimeoutMs: number,
    documentData: ArrayBuffer,
    onPageReady?: (pageInfo: PageInfo) => Promise<void> | void,
    pageNumbers?: number[]
  ): Promise<PageInfo[]> {
    const pagesToFetch =
      pageNumbers ??
      Array.from(
        { length: endPage - startPage + 1 },
        (_, index) => startPage + index
      )
    const total = pagesToFetch.length
    const slots: Array<PageInfo | undefined> = new Array(total).fill(undefined)
    let nextToEmit = 0
    let nextToFetch = 0
    let inFlight = 0

    return new Promise((resolve, reject) => {
      let settled = false

      async function onPageLoaded(
        intermediatePage: IntermediatePage,
        pageNumber: number,
        slotIndex: number,
        dataPromise: Promise<IntermediatePage>
      ) {
        if (settled) return
        const id = `${pdfId}-page-${pageNumber}`
        const size: Number2 = {
          x: intermediatePage.width,
          y: intermediatePage.height
        }
        const getData = () => dataPromise
        slots[slotIndex] = {
          id,
          pageNumber,
          size,
          getData
        }

        while (nextToEmit < total && slots[nextToEmit] !== undefined) {
          const pageInfo = slots[nextToEmit]
          nextToEmit++
          if (pageInfo) {
            await onPageReady?.(pageInfo)
          }
        }
        inFlight--
        if (nextToEmit >= total && inFlight === 0) {
          settled = true
          resolve(slots.filter((page): page is PageInfo => page !== undefined))
        } else {
          if (nextToFetch < total) {
            await PdfParser.encodeYield().catch(() => undefined)
          }
          tryLaunch()
        }
      }

      function tryLaunch() {
        while (!settled && inFlight < concurrency && nextToFetch < total) {
          const slotIndex = nextToFetch++
          const pageNumber = pagesToFetch[slotIndex]
          inFlight++
          const dataPromise = PdfParser.buildIntermediatePage(
            pdf,
            pageNumber,
            pdfId,
            pageLoadTimeoutMs,
            documentData
          )
          dataPromise
            .then((page) =>
              onPageLoaded(page, pageNumber, slotIndex, dataPromise)
            )
            .catch((err) => {
              inFlight--
              if (!settled) {
                settled = true
                reject(err)
              }
            })
        }
      }

      tryLaunch()
    })
  }

  private static async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, timeoutMs)
    })

    try {
      return await Promise.race([operation, timeoutPromise])
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }
  }

  private static async buildIntermediatePage(
    pdf: PDFDocumentProxy,
    pageNumber: number,
    pdfId: string,
    pageLoadTimeoutMs: number,
    documentData: ArrayBuffer
  ): Promise<IntermediatePage> {
    const page = await PdfParser.withTimeout(
      pdf.getPage(pageNumber),
      pageLoadTimeoutMs,
      `Timed out while loading page ${pageNumber} during PDF encode`
    )
    try {
      const viewport = page.getViewport({ scale: 1 })
      return new IntermediatePage({
        id: `${pdfId}-page-${pageNumber}`,
        number: pageNumber,
        width: viewport.width,
        height: viewport.height,
        content: [],
        thumbnail: undefined,
        getThumbnailFn: async (scale: number) => {
          try {
            return await PdfParser.renderThumbnailFromData(
              documentData,
              pageNumber,
              scale
            )
          } catch {
            return undefined
          }
        },
        getContentFn: () =>
          PdfParser.loadIntermediatePageContent(
            documentData,
            pdfId,
            pageNumber,
            pageLoadTimeoutMs
          )
      })
    } finally {
      page.cleanup?.()
    }
  }

  private static async loadIntermediatePageContent(
    documentData: ArrayBuffer,
    pdfId: string,
    pageNumber: number,
    pageLoadTimeoutMs: number
  ): Promise<IntermediateContent[]> {
    const session = await PdfParser.loadPdfSession(documentData)

    try {
      return await PdfParser.buildIntermediatePageContent(
        session.pdf,
        pdfId,
        pageNumber,
        pageLoadTimeoutMs
      )
    } finally {
      await PdfParser.destroyLoadedPdfSession(session)
    }
  }

  private static async buildIntermediatePageContent(
    pdf: PDFDocumentProxy,
    pdfId: string,
    pageNumber: number,
    pageLoadTimeoutMs: number
  ): Promise<IntermediateContent[]> {
    const page = await PdfParser.withTimeout(
      pdf.getPage(pageNumber),
      pageLoadTimeoutMs,
      `Timed out while loading page ${pageNumber} content during PDF encode`
    )

    try {
      const viewport = page.getViewport({ scale: 1 })
      const textContent = await PdfParser.withTimeout(
        page.getTextContent({
          includeMarkedContent: false
        }),
        pageLoadTimeoutMs,
        `Timed out while extracting text from page ${pageNumber} during PDF encode`
      )
      const textItems = PdfParser.mapTextContentToIntermediate(
        textContent,
        pdfId,
        pageNumber,
        viewport
      )
      for (const text of textItems) {
        text.opacity = text.opacity ?? 1
      }
      const imageRecords = await PdfParser.withTimeout(
        PdfParser.extractImagesFromPage(page, pdfId, pageNumber),
        pageLoadTimeoutMs,
        `Timed out while extracting images from page ${pageNumber} during PDF encode`
      )
      for (const record of imageRecords) {
        for (const warning of record.warnings) {
          PdfParser.warnUnsupportedImage(warning)
        }
      }
      const images = imageRecords.map(
        (record) =>
          new IntermediateImage({
            id: record.id,
            src: record.src ?? '',
            polygon: record.polygon,
            opacity: record.opacity
          })
      )
      return [...textItems, ...images]
    } finally {
      page.cleanup?.()
    }
  }

  /**
   * 有界的 PDF.js 图片操作符提取。
   *
   * 支持的操作符类别：`save`/`restore` 图形状态栈、`transform`/可选
   * `setTransform` CTM 更新，以及 `paintImageXObject` 原始图片对象解析。
   * 不支持的类别会稳定返回 warning 而不中断：图片 mask、inline image、
   * 重复图片、Form XObject、透明 group、pattern/shading、soft mask/SMask。
   *
   * @internal 已通过 buildIntermediatePage 接入 encode 路径，用于保留可解析的页面图片。
   */
  static async extractImagesFromPage(
    page: PDFPageProxy,
    pdfId: string,
    pageNumber: number,
    imageObjectTimeoutMs = 1000
  ): Promise<ImageExtractionRecord[]> {
    if (typeof page.getOperatorList !== 'function') {
      return []
    }

    const { OPS } = await PdfParser.loadPdfjsModule()
    const operatorList = await page.getOperatorList()
    const operatorNames = PdfParser.buildPdfOperatorNameMap(OPS)
    const unsupportedOperators = PdfParser.buildUnsupportedImageOperatorMap(OPS)
    const viewportTransform = PdfParser.resolvePageViewportTransform(page)
    const records: ImageExtractionRecord[] = []
    const stack: GraphicsState[] = []
    let state = PdfParser.createInitialGraphicsState()

    for (
      let operatorIndex = 0;
      operatorIndex < operatorList.fnArray.length;
      operatorIndex++
    ) {
      const operator = operatorList.fnArray[operatorIndex]
      const args = operatorList.argsArray[operatorIndex] as unknown

      const nextState = PdfParser.resolveNextGraphicsState(
        OPS,
        operator,
        args,
        state,
        stack
      )
      if (nextState) {
        state = nextState
        continue
      }

      await PdfParser.handleImageExtractionOperator(
        {
          OPS,
          page,
          pdfId,
          pageNumber,
          imageObjectTimeoutMs,
          operatorNames,
          unsupportedOperators,
          viewportTransform,
          records
        },
        operator,
        args,
        operatorIndex,
        state
      )
    }

    return records
  }

  private static resolveNextGraphicsState(
    OPS: PdfjsOps,
    operator: number,
    args: unknown,
    state: GraphicsState,
    stack: GraphicsState[]
  ): GraphicsState | undefined {
    if (operator === OPS.save) {
      stack.push(PdfParser.cloneGraphicsState(state))
      return state
    }

    if (operator === OPS.restore) {
      return stack.pop() ?? PdfParser.createInitialGraphicsState()
    }

    if (operator === OPS.transform) {
      const transform = PdfParser.asAffineTransform(args)
      return transform
        ? { ctm: PdfParser.multiplyAffineTransforms(state.ctm, transform) }
        : state
    }

    if (PdfParser.isSetTransformOperator(OPS, operator)) {
      const transform = PdfParser.asAffineTransform(args)
      return transform ? { ctm: transform } : state
    }

    return undefined
  }

  private static async handleImageExtractionOperator(
    context: ImageExtractionLoopContext,
    operator: number,
    args: unknown,
    operatorIndex: number,
    state: GraphicsState
  ): Promise<void> {
    const {
      OPS,
      page,
      pdfId,
      pageNumber,
      imageObjectTimeoutMs,
      operatorNames,
      unsupportedOperators,
      viewportTransform,
      records
    } = context

    if (operator === OPS.paintImageXObject) {
      records.push(
        await PdfParser.buildImageExtractionRecord(
          page,
          pdfId,
          pageNumber,
          operatorIndex,
          args,
          state,
          viewportTransform,
          imageObjectTimeoutMs,
          operatorNames
        )
      )
      return
    }

    const unsupportedReason = unsupportedOperators.get(operator)
    if (unsupportedReason) {
      records.push(
        PdfParser.buildUnsupportedImageExtractionRecord(
          pdfId,
          pageNumber,
          operatorIndex,
          state,
          viewportTransform,
          PdfParser.buildUnsupportedImageWarning(
            PdfParser.resolvePdfOperatorName(operatorNames, operator),
            pageNumber,
            unsupportedReason,
            PdfParser.resolveUnsupportedImageObjectId(OPS, operator, args)
          )
        )
      )
      return
    }

    const gStateWarnings = PdfParser.collectGraphicsStateImageWarnings(
      OPS,
      operator,
      args,
      operatorNames,
      pageNumber
    )
    for (const warning of gStateWarnings) {
      records.push(
        PdfParser.buildUnsupportedImageExtractionRecord(
          pdfId,
          pageNumber,
          operatorIndex,
          state,
          viewportTransform,
          warning
        )
      )
    }
  }

  /**
   * 将 pdfjs raw image data 转为 PNG data URL。
   *
   * 这里内联一个最小 PNG 编码器：统一先归一化为 RGBA，再生成带无压缩
   * deflate 数据块的 PNG。这样不需要 canvas/sharp 等原生依赖，也不新增包。
   */
  static convertRawImageToDataUrl(
    rawImageData: RawImageData
  ): string | undefined {
    try {
      const rgbaData = PdfParser.convertRawImageToRgba(rawImageData)
      if (!rgbaData) {
        PdfParser.warnImageConversion(
          `不支持的 raw image data 格式：kind=${rawImageData.kind}, width=${rawImageData.width}, height=${rawImageData.height}, bytes=${rawImageData.data?.length ?? 0}`
        )
        return undefined
      }

      const pngData = PdfParser.encodeRgbaPng(
        rawImageData.width,
        rawImageData.height,
        rgbaData
      )
      return `data:image/png;base64,${PdfParser.bytesToBase64(pngData)}`
    } catch (error) {
      PdfParser.warnImageConversion(
        PdfParser.resolveWarningReason(
          error,
          'raw image data 转换 PNG data URL 失败'
        )
      )
      return undefined
    }
  }

  private static convertRawImageToRgba(
    rawImageData: RawImageData
  ): Uint8Array | undefined {
    const width = PdfParser.normalizeDimension(rawImageData.width)
    const height = PdfParser.normalizeDimension(rawImageData.height)
    if (!width || !height || !(rawImageData.data instanceof Uint8Array)) {
      return undefined
    }

    const pixelCount = width * height
    if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0) return undefined

    if (rawImageData.kind === 3) {
      if (rawImageData.data.length !== pixelCount * 4) return undefined
      return PdfParser.cloneUint8Array(rawImageData.data)
    }

    const rgbaData = new Uint8Array(pixelCount * 4)

    if (rawImageData.kind === 2) {
      if (rawImageData.data.length !== pixelCount * 3) return undefined
      for (
        let sourceIndex = 0, targetIndex = 0;
        sourceIndex < rawImageData.data.length;
        sourceIndex += 3, targetIndex += 4
      ) {
        rgbaData[targetIndex] = rawImageData.data[sourceIndex]
        rgbaData[targetIndex + 1] = rawImageData.data[sourceIndex + 1]
        rgbaData[targetIndex + 2] = rawImageData.data[sourceIndex + 2]
        rgbaData[targetIndex + 3] = 255
      }
      return rgbaData
    }

    if (rawImageData.kind === 1) {
      if (rawImageData.data.length !== pixelCount) return undefined
      for (
        let sourceIndex = 0, targetIndex = 0;
        sourceIndex < rawImageData.data.length;
        sourceIndex += 1, targetIndex += 4
      ) {
        const gray = rawImageData.data[sourceIndex]
        rgbaData[targetIndex] = gray
        rgbaData[targetIndex + 1] = gray
        rgbaData[targetIndex + 2] = gray
        rgbaData[targetIndex + 3] = 255
      }
      return rgbaData
    }

    return undefined
  }

  private static encodeRgbaPng(
    width: number,
    height: number,
    rgbaData: Uint8Array
  ): Uint8Array {
    const scanlineLength = width * 4
    if (rgbaData.length !== scanlineLength * height) {
      throw new Error('RGBA 数据长度与图片尺寸不匹配')
    }

    const filteredData = new Uint8Array((scanlineLength + 1) * height)
    for (let row = 0; row < height; row++) {
      const filteredOffset = row * (scanlineLength + 1)
      filteredData[filteredOffset] = PNG_FILTER_NONE
      filteredData.set(
        rgbaData.subarray(row * scanlineLength, (row + 1) * scanlineLength),
        filteredOffset + 1
      )
    }

    const ihdr = new Uint8Array(13)
    PdfParser.writeUint32BE(ihdr, 0, width)
    PdfParser.writeUint32BE(ihdr, 4, height)
    ihdr[8] = PNG_BIT_DEPTH_8
    ihdr[9] = PNG_COLOR_TYPE_RGBA

    return PdfParser.concatUint8Arrays([
      PNG_SIGNATURE,
      PdfParser.buildPngChunk('IHDR', ihdr),
      PdfParser.buildPngChunk('IDAT', PdfParser.zlibStore(filteredData)),
      PdfParser.buildPngChunk('IEND', new Uint8Array())
    ])
  }

  private static zlibStore(data: Uint8Array): Uint8Array {
    const blocks: Uint8Array[] = [
      new Uint8Array([
        ZLIB_COMPRESSION_METHOD_DEFLATE,
        ZLIB_FASTEST_COMPRESSION_FLAGS
      ])
    ]

    for (let offset = 0; offset < data.length; offset += 0xffff) {
      const block = data.subarray(
        offset,
        Math.min(offset + 0xffff, data.length)
      )
      const header = new Uint8Array(5)
      header[0] = offset + block.length >= data.length ? DEFLATE_FINAL_BLOCK : 0
      header[1] = block.length & 0xff
      header[2] = (block.length >>> 8) & 0xff
      const invertedLength = ~block.length & 0xffff
      header[3] = invertedLength & 0xff
      header[4] = (invertedLength >>> 8) & 0xff
      blocks.push(header, block)
    }

    const checksum = new Uint8Array(4)
    PdfParser.writeUint32BE(checksum, 0, PdfParser.adler32(data))
    blocks.push(checksum)

    return PdfParser.concatUint8Arrays(blocks)
  }

  private static buildPngChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new Uint8Array(
      Array.from(type, (char) => char.charCodeAt(0))
    )
    const chunk = new Uint8Array(12 + data.length)
    PdfParser.writeUint32BE(chunk, 0, data.length)
    chunk.set(typeBytes, 4)
    chunk.set(data, 8)
    PdfParser.writeUint32BE(
      chunk,
      8 + data.length,
      PdfParser.crc32(chunk.subarray(4, 8 + data.length))
    )
    return chunk
  }

  private static writeUint32BE(
    target: Uint8Array,
    offset: number,
    value: number
  ): void {
    target[offset] = (value >>> 24) & 0xff
    target[offset + 1] = (value >>> 16) & 0xff
    target[offset + 2] = (value >>> 8) & 0xff
    target[offset + 3] = value & 0xff
  }

  private static concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }

  private static adler32(data: Uint8Array): number {
    let a = 1
    let b = 0
    for (const byte of data) {
      a = (a + byte) % 65521
      b = (b + a) % 65521
    }
    return ((b << 16) | a) >>> 0
  }

  private static crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (const byte of data) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
      }
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  private static bytesToBase64(data: Uint8Array): string {
    const maybeBuffer = (
      globalThis as unknown as {
        Buffer?: {
          from: (data: Uint8Array) => {
            toString: (encoding: 'base64') => string
          }
        }
      }
    ).Buffer
    if (maybeBuffer) return maybeBuffer.from(data).toString('base64')

    let binary = ''
    for (const byte of data) binary += String.fromCharCode(byte)
    return btoa(binary)
  }

  private static warnImageConversion(reason: string): void {
    PdfParser.warnings.push({
      type: 'image-conversion',
      message: `[PdfParser] ${reason}`
    })
  }

  private static warnUnsupportedImage(warning: ImageUnsupportedWarning): void {
    PdfParser.warnings.push(warning)
  }

  private static async buildImageExtractionRecord(
    page: PDFPageProxy,
    pdfId: string,
    pageNumber: number,
    operatorIndex: number,
    args: unknown,
    state: GraphicsState,
    viewportTransform: AffineTransform,
    imageObjectTimeoutMs: number,
    operatorNames: Map<number, string>
  ): Promise<ImageExtractionRecord> {
    const operator = PdfParser.resolvePdfOperatorName(
      operatorNames,
      (await PdfParser.loadPdfjsModule()).OPS.paintImageXObject
    )
    const warnings: ImageUnsupportedWarning[] = []
    const objectId = PdfParser.resolveImageObjectId(args)
    let rawImageData: RawImageData | undefined

    if (!objectId) {
      warnings.push(
        PdfParser.buildUnsupportedImageWarning(
          operator,
          pageNumber,
          'paintImageXObject 缺少可解析的图片对象 id'
        )
      )
    } else {
      try {
        rawImageData = await PdfParser.resolvePageImageObject(
          page,
          objectId,
          imageObjectTimeoutMs
        )

        if (!rawImageData) {
          warnings.push(
            PdfParser.buildUnsupportedImageWarning(
              operator,
              pageNumber,
              `图片对象 ${objectId} 不是支持的 raw image data 结构`,
              objectId
            )
          )
        }
      } catch (error) {
        warnings.push(
          PdfParser.buildUnsupportedImageWarning(
            operator,
            pageNumber,
            PdfParser.resolveWarningReason(
              error,
              `无法解析图片对象 ${objectId}`
            ),
            objectId
          )
        )
      }
    }

    const record: ImageExtractionRecord = {
      id: PdfParser.buildImageExtractionId(pdfId, pageNumber, operatorIndex),
      width: rawImageData?.width ?? 0,
      height: rawImageData?.height ?? 0,
      polygon: PdfParser.buildImagePolygon(state, viewportTransform),
      opacity: 1,
      warnings
    }

    if (rawImageData) {
      record.rawImageData = rawImageData
      record.src = PdfParser.convertRawImageToDataUrl(rawImageData)
    }

    return record
  }

  private static buildUnsupportedImageWarning(
    operator: string,
    page: number,
    message: string,
    objectId?: string
  ): ImageUnsupportedWarning {
    return {
      type: 'unsupported',
      operator,
      page,
      ...(objectId ? { objectId } : {}),
      message
    }
  }

  private static buildUnsupportedImageExtractionRecord(
    pdfId: string,
    pageNumber: number,
    operatorIndex: number,
    state: GraphicsState,
    viewportTransform: AffineTransform,
    warning: ImageUnsupportedWarning
  ): ImageExtractionRecord {
    return {
      id: PdfParser.buildImageExtractionId(pdfId, pageNumber, operatorIndex),
      width: 0,
      height: 0,
      polygon: PdfParser.buildImagePolygon(state, viewportTransform),
      opacity: 1,
      warnings: [warning]
    }
  }

  private static async resolvePageImageObject(
    page: PDFPageProxy,
    objectId: string,
    timeoutMs: number
  ): Promise<RawImageData | undefined> {
    const imageObject = await PdfParser.withTimeout(
      PdfParser.resolvePdfPageObject(page, objectId),
      timeoutMs,
      `Timed out while resolving image object ${objectId}`
    )

    return PdfParser.normalizeRawImageData(imageObject)
  }

  private static resolvePdfPageObject(
    page: PDFPageProxy,
    objectId: string
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const objectStore = (page as unknown as { objs?: PdfPageObjectStore })
        .objs
      if (!objectStore || typeof objectStore.get !== 'function') {
        resolve(undefined)
        return
      }

      let settled = false
      const resolveOnce = (value: unknown) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      try {
        const maybeValue = objectStore.get(objectId, resolveOnce)
        if (maybeValue !== undefined) {
          resolveOnce(maybeValue)
        }
      } catch (error) {
        if (!settled) {
          settled = true
          reject(error)
        }
      }
    })
  }

  private static normalizeRawImageData(
    value: unknown
  ): RawImageData | undefined {
    if (typeof value !== 'object' || value === null) return undefined
    const record = value as Record<string, unknown>
    const width = Number(record.width)
    const height = Number(record.height)
    const kind = Number(record.kind)

    if (
      !(record.data instanceof Uint8Array) &&
      !(record.data instanceof Uint8ClampedArray)
    ) {
      return undefined
    }

    if (
      !PdfParser.normalizeDimension(width) ||
      !PdfParser.normalizeDimension(height) ||
      !Number.isFinite(kind)
    ) {
      return undefined
    }

    return {
      data: new Uint8Array(record.data),
      width,
      height,
      kind
    }
  }

  private static resolveImageObjectId(args: unknown): string | undefined {
    if (!Array.isArray(args)) return undefined
    const [objectId] = args
    return typeof objectId === 'string' && objectId.trim()
      ? objectId
      : undefined
  }

  private static resolveUnsupportedImageObjectId(
    ops: PdfjsOps,
    operator: number,
    args: unknown
  ): string | undefined {
    if (
      operator === ops.paintXObject ||
      operator === ops.paintImageXObjectRepeat ||
      operator === ops.paintImageMaskXObject ||
      operator === ops.paintImageMaskXObjectRepeat
    ) {
      return PdfParser.resolveImageObjectId(args)
    }

    return undefined
  }

  private static collectGraphicsStateImageWarnings(
    ops: PdfjsOps,
    operator: number,
    args: unknown,
    operatorNames: Map<number, string>,
    pageNumber: number
  ): ImageUnsupportedWarning[] {
    if (operator !== ops.setGState) return []
    if (!PdfParser.graphicsStateArgsContain(args, 'SMask')) return []

    return [
      PdfParser.buildUnsupportedImageWarning(
        PdfParser.resolvePdfOperatorName(operatorNames, operator),
        pageNumber,
        'SMask/soft mask 会影响图片透明度，当前 spike 仅记录警告'
      )
    ]
  }

  private static graphicsStateArgsContain(args: unknown, key: string): boolean {
    if (!Array.isArray(args)) return false

    return args.some((entry) => {
      if (entry === key) return true
      return Array.isArray(entry) && entry[0] === key
    })
  }

  private static buildUnsupportedImageOperatorMap(
    ops: PdfjsOps
  ): Map<number, string> {
    const candidates: Array<[number | undefined, string]> = [
      [
        ops.paintImageMaskXObject,
        '图片 mask XObject 需要专门解码，当前 spike 仅记录警告'
      ],
      [
        ops.paintImageMaskXObjectGroup,
        '图片 mask group 需要专门解码，当前 spike 仅记录警告'
      ],
      [
        ops.paintInlineImageXObject,
        'inline image 解码暂未实现，当前 spike 仅记录警告'
      ],
      [
        ops.paintInlineImageXObjectGroup,
        'inline image group 解码暂未实现，当前 spike 仅记录警告'
      ],
      [
        ops.paintImageXObjectRepeat,
        '重复图片 XObject 需要展开每个 placement，当前 spike 仅记录警告'
      ],
      [
        ops.paintImageMaskXObjectRepeat,
        '重复图片 mask 需要专门展开，当前 spike 仅记录警告'
      ],
      [
        ops.paintSolidColorImageMask,
        'solid color image mask 暂未映射为图片，当前 spike 仅记录警告'
      ],
      [
        ops.paintXObject,
        '通用 XObject/Form XObject 内容暂未递归展开，当前 spike 仅记录警告'
      ],
      [
        ops.paintFormXObjectBegin,
        'Form XObject 内容暂未递归展开，当前 spike 仅记录警告'
      ],
      [ops.beginGroup, '透明 group 会影响图片合成结果，当前 spike 仅记录警告'],
      [
        ops.shadingFill,
        'pattern/shading 填充暂未展开为图片，当前 spike 仅记录警告'
      ],
      [
        ops.setFillColorN,
        'pattern/高级填充颜色空间暂未展开为图片，当前 spike 仅记录警告'
      ],
      [
        ops.setStrokeColorN,
        'pattern/高级描边颜色空间暂未展开为图片，当前 spike 仅记录警告'
      ]
    ]
    const result = new Map<number, string>()

    for (const [operator, reason] of candidates) {
      if (typeof operator === 'number' && Number.isFinite(operator)) {
        result.set(operator, reason)
      }
    }

    return result
  }

  private static buildPdfOperatorNameMap(ops: PdfjsOps): Map<number, string> {
    const result = new Map<number, string>()
    const records = ops as unknown as Record<string, unknown>

    for (const [name, value] of Object.entries(records)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        result.set(value, name)
      }
    }

    return result
  }

  private static resolvePdfOperatorName(
    operatorNames: Map<number, string>,
    operator: number
  ): string {
    return operatorNames.get(operator) ?? `operator:${operator}`
  }

  private static createInitialGraphicsState(): GraphicsState {
    return { ctm: [1, 0, 0, 1, 0, 0] }
  }

  private static cloneGraphicsState(state: GraphicsState): GraphicsState {
    return { ctm: [...state.ctm] }
  }

  private static resolvePageViewportTransform(
    page: PDFPageProxy
  ): AffineTransform {
    try {
      const viewport = page.getViewport({ scale: 1 })
      return (
        PdfParser.asAffineTransform(viewport.transform) ??
        PdfParser.createInitialGraphicsState().ctm
      )
    } catch {
      return PdfParser.createInitialGraphicsState().ctm
    }
  }

  private static isSetTransformOperator(
    ops: PdfjsOps,
    operator: number
  ): boolean {
    const setTransform = (ops as unknown as Record<string, number | undefined>)
      .setTransform
    return typeof setTransform === 'number' && operator === setTransform
  }

  private static asAffineTransform(
    value: unknown
  ): AffineTransform | undefined {
    if (!Array.isArray(value) || value.length < 6) return undefined
    const matrix = value.slice(0, 6).map((item) => Number(item))
    if (matrix.some((item) => !Number.isFinite(item))) return undefined

    return matrix as AffineTransform
  }

  private static buildImagePolygon(
    state: GraphicsState,
    viewportTransform: AffineTransform
  ): ImagePolygon {
    const placement = PdfParser.multiplyAffineTransforms(
      viewportTransform,
      state.ctm
    )
    return [
      PdfParser.transformPoint(placement, 0, 0),
      PdfParser.transformPoint(placement, 1, 0),
      PdfParser.transformPoint(placement, 1, 1),
      PdfParser.transformPoint(placement, 0, 1)
    ]
  }

  private static transformPoint(
    matrix: AffineTransform,
    x: number,
    y: number
  ): [number, number] {
    const [a, b, c, d, e, f] = matrix
    return [a * x + c * y + e, b * x + d * y + f]
  }

  private static buildImageExtractionId(
    pdfId: string,
    pageNumber: number,
    operatorIndex: number
  ): string {
    return `${pdfId}-page-${pageNumber}-image-${operatorIndex}`
  }

  private static resolveWarningReason(
    error: unknown,
    fallback: string
  ): string {
    if (error instanceof Error && error.message) return error.message
    return fallback
  }

  private static async renderThumbnailFromData(
    data: ArrayBuffer,
    pageNumber: number,
    scale: number
  ): Promise<IntermediateImage | undefined> {
    const session = await PdfParser.loadPdfSession(data)

    try {
      const page = await session.pdf.getPage(pageNumber)
      const url = await PdfParser.renderThumbnail(page, scale)
      page.cleanup?.()
      return url
    } finally {
      await PdfParser.destroyLoadedPdfSession(session)
    }
  }

  private static async buildOutline(
    pdf: PDFDocumentProxy,
    pdfId: string
  ): Promise<IntermediateOutline[] | undefined> {
    let nodes: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> = []
    try {
      nodes = await pdf.getOutline()
    } catch {
      nodes = []
    }
    if (!nodes || nodes.length === 0) return undefined

    let idCounter = 0
    const mapNode = async (
      node: (typeof nodes)[number]
    ): Promise<IntermediateOutline | undefined> => {
      const dest = await PdfParser.mapOutlineDest(pdf, node, pdfId).catch(
        () => undefined as IntermediateOutlineDest | undefined
      )
      if (!dest) return undefined
      const outline = new IntermediateOutline({
        id: `${pdfId}-outline-${idCounter++}`,
        content: String(node.title ?? ''),
        fontSize: 14,
        fontFamily: '',
        fontWeight: node.bold ? 700 : 500,
        italic: !!node.italic,
        color: 'transparent',
        polygon: [
          [0, 0],
          [0, 0],
          [0, 14],
          [0, 14]
        ],
        lineHeight: 14,
        ascent: 0,
        descent: 0,
        vertical: false,
        dir: TextDir.LTR,
        skew: 0,
        isEOL: true,
        dest
      })
      return outline
    }

    const results: IntermediateOutline[] = []
    for (const n of nodes) {
      const item = await mapNode(n)
      if (item) results.push(item)
    }
    return results.length ? results : undefined
  }

  private static async mapOutlineDest(
    pdf: PDFDocumentProxy,
    node: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number],
    pdfId: string
  ): Promise<IntermediateOutlineDest> {
    const nodeItems = (node.items ?? []) as Awaited<
      ReturnType<PDFDocumentProxy['getOutline']>
    >
    const urlDest = PdfParser.buildUrlDest(node)
    if (urlDest) {
      return PdfParser.appendOutlineChildren(pdf, nodeItems, pdfId, urlDest)
    }

    const destArray = await PdfParser.resolveDestArray(pdf, node?.dest)
    const pageDest = await PdfParser.buildPageDest(
      pdf,
      destArray,
      pdfId,
      nodeItems
    )
    if (pageDest) return pageDest

    const destPos: IntermediateOutlineDestPosition = {
      targetType: IntermediateOutlineDestType.POSITION
    }
    return PdfParser.appendOutlineChildren(pdf, nodeItems, pdfId, destPos)
  }

  private static async mapChildOutlineDest(
    pdf: PDFDocumentProxy,
    items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined,
    pdfId: string
  ): Promise<IntermediateOutlineDest[]> {
    if (!Array.isArray(items) || items.length === 0) return []
    const result: IntermediateOutlineDest[] = []
    for (const child of items) {
      const d = await PdfParser.mapOutlineDest(pdf, child, pdfId).catch(
        () => undefined
      )
      if (d) result.push(d)
    }
    return result
  }

  private static buildUrlDest(
    node: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]
  ): IntermediateOutlineDestUrl | undefined {
    if (!node?.url) return undefined
    return {
      targetType: IntermediateOutlineDestType.URL,
      url: String(node.url),
      unsafeUrl: node.unsafeUrl,
      newWindow: !!node.newWindow
    }
  }

  private static async resolveDestArray(
    pdf: PDFDocumentProxy,
    rawDest: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]['dest']
  ): Promise<unknown[]> {
    if (typeof rawDest === 'string') {
      try {
        const resolved = await pdf.getDestination(rawDest)
        return Array.isArray(resolved) ? resolved : []
      } catch {
        return []
      }
    }
    if (Array.isArray(rawDest)) {
      return rawDest
    }
    return []
  }

  private static isPageReference(
    value: unknown
  ): value is { num: number; gen: number } {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return typeof record.num === 'number' && typeof record.gen === 'number'
  }

  private static async buildPageDest(
    pdf: PDFDocumentProxy,
    destArray: unknown[],
    pdfId: string,
    items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined
  ): Promise<IntermediateOutlineDestPage | undefined> {
    if (!Array.isArray(destArray) || destArray.length === 0) return undefined
    const ref = destArray[0]

    try {
      let pageNumber: number | undefined

      if (typeof ref === 'number') {
        pageNumber = Number(ref) + 1
      } else if (PdfParser.isPageReference(ref)) {
        const index = await pdf.getPageIndex(ref)
        pageNumber = Number(index) + 1
      } else {
        return undefined
      }

      if (!Number.isFinite(pageNumber) || pageNumber < 1) {
        return undefined
      }

      const destPage: IntermediateOutlineDestPage = {
        targetType: IntermediateOutlineDestType.PAGE,
        pageId: `${pdfId}-page-${pageNumber}`
      }
      return PdfParser.appendOutlineChildren(pdf, items, pdfId, destPage)
    } catch {
      return undefined
    }
  }

  private static async appendOutlineChildren<T extends IntermediateOutlineDest>(
    pdf: PDFDocumentProxy,
    items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined,
    pdfId: string,
    dest: T
  ): Promise<T> {
    const children = await PdfParser.mapChildOutlineDest(pdf, items, pdfId)
    if (children.length) dest.items = children
    return dest
  }

  private static mapTextContentToIntermediate(
    textContent: TextContent,
    pdfId: string,
    pageNumber: number,
    viewport: Pick<PageViewport, 'height' | 'transform'>
  ): IntermediateText[] {
    const items: IntermediateText[] = []
    const styles = textContent.styles
    let idx = 0
    for (const item of textContent.items) {
      const textItem = PdfParser.asTextItem(item)
      if (!textItem) continue

      const style = styles?.[textItem.fontName] || {}
      const id = `${pdfId}-page-${pageNumber}-text-${idx++}`
      const text = PdfParser.buildIntermediateText(
        id,
        textItem,
        style,
        viewport
      )
      items.push(text)
    }
    return items
  }

  private static buildIntermediateText(
    id: string,
    textItem: TextItem,
    style: Partial<TextStyle>,
    viewport: Pick<PageViewport, 'height' | 'transform'>
  ): IntermediateText {
    const metrics = PdfParser.collectMetrics(textItem, style)

    return new IntermediateText({
      id,
      content: String(textItem.str ?? ''),
      fontSize: metrics.fontSize,
      fontFamily: metrics.fontFamily,
      fontWeight: 500,
      italic: false,
      color: 'transparent',
      polygon: PdfParser.buildTextPolygon(textItem, metrics, viewport),
      lineHeight: metrics.lineHeight,
      ascent: metrics.ascent,
      descent: metrics.descent,
      vertical: metrics.vertical,
      dir: PdfParser.mapTextDir(textItem.dir),
      skew: 0,
      isEOL: Boolean(textItem.hasEOL)
    })
  }

  private static buildTextPolygon(
    textItem: TextItem,
    metrics: TextMetrics,
    viewport: Pick<PageViewport, 'height' | 'transform'>
  ): IntermediateTextPolygon {
    const { x, y } = PdfParser.transformToViewport(textItem.transform, viewport)
    const width = Math.max(metrics.width, 0)
    const height = Math.max(
      metrics.height,
      metrics.fontSize,
      metrics.lineHeight,
      0
    )
    const verticalExtents = PdfParser.resolveTextVerticalExtents(
      metrics.ascent,
      metrics.descent,
      height
    )
    const left = Number.isFinite(x) ? x : 0
    const baselineY = Number.isFinite(y) ? y : 0
    const top = baselineY - verticalExtents.ascentHeight
    const right = left + width
    const bottom = baselineY + verticalExtents.descentHeight

    return [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom]
    ]
  }

  private static resolveTextVerticalExtents(
    ascent: number,
    descent: number,
    totalHeight: number
  ): {
    ascentHeight: number
    descentHeight: number
  } {
    const normalizedHeight = PdfParser.normalizeDimension(totalHeight) ?? 0
    if (!normalizedHeight) {
      return {
        ascentHeight: 0,
        descentHeight: 0
      }
    }

    const normalizedAscent = Number.isFinite(ascent) && ascent > 0 ? ascent : 0
    const normalizedDescent = Number.isFinite(descent) ? Math.abs(descent) : 0
    const ratioTotal = normalizedAscent + normalizedDescent

    if (normalizedAscent > 0 && ratioTotal > 0) {
      const scale = normalizedHeight / ratioTotal
      return {
        ascentHeight: normalizedAscent * scale,
        descentHeight: normalizedDescent * scale
      }
    }

    return {
      ascentHeight: normalizedHeight,
      descentHeight: 0
    }
  }

  private static asTextItem(
    item: TextContent['items'][number]
  ): TextItem | undefined {
    return typeof (item as TextItem)?.str === 'string'
      ? (item as TextItem)
      : undefined
  }

  private static mapTextDir(dir: TextItem['dir']): TextDir {
    if (dir === 'rtl') return TextDir.RTL
    if (dir === 'ttb') return TextDir.TTB
    return TextDir.LTR
  }

  private static transformToViewport(
    transform: TextItem['transform'],
    viewport: Pick<PageViewport, 'height' | 'transform'>
  ): { x: number; y: number } {
    const baseTransform = Array.isArray(transform)
      ? transform
      : [1, 0, 0, 1, 0, 0]
    const transformed = PdfParser.multiplyAffineTransforms(
      viewport.transform,
      baseTransform
    )
    return {
      x: Number.isFinite(transformed[4]) ? transformed[4] : 0,
      y: Number.isFinite(transformed[5]) ? transformed[5] : 0
    }
  }

  private static multiplyAffineTransforms(
    left: number[],
    right: number[]
  ): [number, number, number, number, number, number] {
    const [a1, b1, c1, d1, e1, f1] = left
    const [a2, b2, c2, d2, e2, f2] = right

    return [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1
    ]
  }

  private static collectMetrics(
    textItem: TextItem,
    style: Partial<TextStyle>
  ): {
    width: number
    height: number
    ascent: number
    descent: number
    fontFamily: string
    vertical?: boolean
    fontSize: number
    lineHeight: number
  } {
    const width = Math.abs(Number(textItem.width || 0))
    const height = Math.abs(Number(textItem.height || 0))
    const ascent = Number(style.ascent ?? 0)
    const descent = Number(style.descent ?? 0)
    const fontFamily = String(style.fontFamily ?? '')
    const vertical = Boolean(style.vertical ?? false) || undefined
    const fontSize = height || Math.abs(ascent - descent) || 0
    const lineHeight = fontSize || height || Math.abs(ascent - descent) || 0

    return {
      width,
      height: height || fontSize,
      ascent,
      descent,
      fontFamily,
      vertical,
      fontSize,
      lineHeight
    }
  }

  private static async renderThumbnail(
    page: PDFPageProxy,
    scale = 1
  ): Promise<IntermediateImage | undefined> {
    if (typeof document === 'undefined') return undefined
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) return undefined
    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport
    })
    await renderTask.promise
    return new IntermediateImage({
      id: `thumbnail-page-${page.pageNumber}`,
      src: canvas.toDataURL('image/png'),
      polygon: [
        [0, 0],
        [viewport.width, 0],
        [viewport.width, viewport.height],
        [0, viewport.height]
      ],
      opacity: 1
    })
  }
}
