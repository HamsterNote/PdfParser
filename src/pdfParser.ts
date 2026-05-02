import { DocumentParser, type ParserInput } from '@hamster-note/document-parser'
import type {
  IntermediateOutlineDest,
  IntermediateOutlineDestPage,
  IntermediateOutlineDestPosition,
  IntermediateOutlineDestUrl,
  IntermediateTextPolygon,
  Number2
} from '@hamster-note/types'
import {
  IntermediateDocument,
  IntermediateOutline,
  IntermediateOutlineDestType,
  IntermediatePage,
  IntermediatePageMap,
  IntermediateText,
  TextDir
} from '@hamster-note/types'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils'
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
  TextItem,
  TextStyle
} from 'pdfjs-dist/types/src/display/api'
import {
  ensurePdfjsStandardFontDataUrlConfigured,
  ensurePdfjsWorkerConfigured
} from './pdfjsWorker'
import './polyfills/dom-matrix.polyfill'
import './polyfills/promise-withresolvers.polyfill'

type RenderableText = {
  content: string
  font: PDFFont
  fontSize: number
  lineHeight: number
  x: number
  y: number
}

type PdfPagePlan = {
  background?: string
  height: number
  texts: RenderableText[]
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

export type DecodeOptions = {
  fonts?: DecodeFontInput
}

export type EncodeOptions = {
  maxPages?: number
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

export class PdfParser extends DocumentParser {
  private static readonly defaultEncodeOptions: Required<EncodeOptions> = {
    maxPages: Number.POSITIVE_INFINITY,
    pageLoadTimeoutMs: 5000
  }

  private static pdfjsModulePromise:
    | Promise<
        Pick<typeof import('pdfjs-dist'), 'getDocument' | 'GlobalWorkerOptions'>
      >
    | undefined

  private static decodeFontConfigs: DecodeFontConfig[] | undefined

  private static decodeFontBytesPromise:
    | Promise<Uint8Array[] | undefined>
    | undefined

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

    const pdf = await PdfParser.loadPdf(buffer)

    let title = 'Untitled PDF'
    try {
      const meta = await pdf.getMetadata()
      title = (meta?.info as { Title: string })?.Title || title
    } catch {
      title = 'Untitled PDF'
    }
    const id = (pdf.fingerprints?.[0] ?? `pdf-${Date.now()}`) as string

    const encodeOptions = PdfParser.resolveEncodeOptions(options, pdf.numPages)
    const total = Math.min(pdf.numPages, encodeOptions.maxPages)
    if (onProgress) {
      onProgress({ stage: 'encode:start', current: 0, total })
    }
    const infoList = await PdfParser.buildPageInfoList(
      pdf,
      id,
      encodeOptions,
      onProgress
    )
    const pagesMap = IntermediatePageMap.makeByInfoList(infoList)
    const outline = await PdfParser.buildOutline(pdf, id).catch(() => undefined)
    const result = new IntermediateDocument({ id, title, pagesMap, outline })
    if (onProgress) {
      onProgress({ stage: 'encode:complete', current: total, total })
    }
    return result
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

    return {
      maxPages: Number.isFinite(maxPages)
        ? PdfParser.clamp(maxPages, 1, Math.max(1, totalPages))
        : Math.max(1, totalPages),
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

    const pageCount = pages.length

    if (onProgress) {
      onProgress({ stage: 'decode:start', current: 0, total: pageCount })
    }

    const pdfDocument = await PDFDocument.create()
    const decodeFontSet = await PdfParser.resolveDecodeFonts(
      pdfDocument,
      options.fonts
    )
    const pagePlans: PdfPagePlan[] = []
    let hasRenderableContent = false

    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]
      const pageWidth = PdfParser.normalizeDimension(page.width)
      const pageHeight = PdfParser.normalizeDimension(page.height)
      if (!pageWidth || !pageHeight) continue

      const background = await PdfParser.resolvePageBackground(page)

      const texts = PdfParser.buildRenderableTexts(
        await PdfParser.resolvePageTexts(page),
        decodeFontSet,
        pageWidth,
        pageHeight
      )
      if (texts === undefined) return undefined
      if (texts.length > 0 || background) hasRenderableContent = true
      pagePlans.push({
        width: pageWidth,
        height: pageHeight,
        texts,
        background
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
      PdfParser.drawTextsToPdfPage(pdfPage, pagePlan.texts)
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

  private static async resolvePageTexts(
    page: IntermediatePage
  ): Promise<IntermediateText[]> {
    if (Array.isArray(page.texts)) {
      return page.texts
    }

    try {
      return (await page.getTexts()) ?? []
    } catch {
      return []
    }
  }

  private static async resolvePageBackground(
    page: IntermediatePage
  ): Promise<string | undefined> {
    try {
      const thumbnail = await page.getThumbnail()
      return typeof thumbnail === 'string' && thumbnail.trim()
        ? thumbnail
        : undefined
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

      let currentX = metrics.x
      for (const run of runs) {
        renderableTexts.push({
          ...metrics,
          content: run.content,
          font: run.font,
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

  private static resolveRenderableTextMetrics(
    text: IntermediateText,
    pageWidth: number,
    pageHeight: number
  ): Omit<RenderableText, 'content'> | undefined {
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
        font: text.font
      })
    }
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
    fontOverride?: DecodeFontInput
  ): Promise<DecodeFontSet> {
    const fonts: ResolvedDecodeFont[] = []
    const customFontBytesList = fontOverride
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
    fontInput: DecodeFontInput
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

  private static async loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
    const { getDocument, GlobalWorkerOptions } =
      await PdfParser.loadPdfjsModule()
    ensurePdfjsWorkerConfigured(GlobalWorkerOptions)
    const standardFontDataUrl = ensurePdfjsStandardFontDataUrlConfigured()
    const dataCopy = data.slice(0)
    const loadingTask = getDocument({
      data: new Uint8Array(dataCopy),
      standardFontDataUrl
    } as Parameters<typeof getDocument>[0])
    return loadingTask.promise
  }

  private static loadPdfjsModule(): Promise<
    Pick<typeof import('pdfjs-dist'), 'getDocument' | 'GlobalWorkerOptions'>
  > {
    if (!PdfParser.pdfjsModulePromise) {
      PdfParser.pdfjsModulePromise = import('pdfjs-dist')
    }
    return PdfParser.pdfjsModulePromise
  }

  private static async buildPageInfoList(
    pdf: PDFDocumentProxy,
    pdfId: string,
    options: Required<EncodeOptions>,
    onProgress?: EncodeProgressReporter
  ): Promise<
    {
      id: string
      pageNumber: number
      size: Number2
      getData: () => Promise<IntermediatePage>
    }[]
  > {
    const total = Math.min(pdf.numPages, options.maxPages)
    const result: {
      id: string
      pageNumber: number
      size: Number2
      getData: () => Promise<IntermediatePage>
    }[] = []
    for (let n = 1; n <= total; n++) {
      const page = await PdfParser.withTimeout(
        pdf.getPage(n),
        options.pageLoadTimeoutMs,
        `Timed out while loading page ${n} during PDF encode`
      )
      const viewport = page.getViewport({ scale: 1 })
      const id = `${pdfId}-page-${n}`
      const size: Number2 = { x: viewport.width, y: viewport.height }
      const getData = () =>
        PdfParser.buildIntermediatePage(
          pdf,
          n,
          pdfId,
          options.pageLoadTimeoutMs
        )
      result.push({ id, pageNumber: n, size, getData })
      page.cleanup?.()
      if (onProgress) {
        onProgress({ stage: 'encode:page', current: n, total })
      }
    }
    return result
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
    pageLoadTimeoutMs: number
  ): Promise<IntermediatePage> {
    const page = await PdfParser.withTimeout(
      pdf.getPage(pageNumber),
      pageLoadTimeoutMs,
      `Timed out while loading page ${pageNumber} during PDF encode`
    )
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await PdfParser.withTimeout(
      page.getTextContent({
        includeMarkedContent: false
      }),
      pageLoadTimeoutMs,
      `Timed out while extracting text from page ${pageNumber} during PDF encode`
    )
    const texts = PdfParser.mapTextContentToIntermediate(
      textContent,
      pdfId,
      pageNumber,
      viewport
    )
    const intermediatePage = new IntermediatePage({
      id: `${pdfId}-page-${pageNumber}`,
      number: pageNumber,
      width: viewport.width,
      height: viewport.height,
      texts,
      thumbnail: undefined
    })
    intermediatePage.setGetThumbnail(async (scale: number) => {
      try {
        const p = await pdf.getPage(pageNumber)
        const url = await PdfParser.renderThumbnail(p, scale)
        p.cleanup?.()
        return url
      } catch {
        return undefined
      }
    })
    intermediatePage.setGetTexts(async () => texts)
    page.cleanup?.()
    return intermediatePage
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
    } catch (error) {
      console.error(error)
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
  ): Promise<string | undefined> {
    if (typeof document === 'undefined') return undefined
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) return undefined
    const renderTask = page.render({ canvas, canvasContext: context, viewport })
    await renderTask.promise
    const url = canvas.toDataURL('image/png')
    return url
  }
}
