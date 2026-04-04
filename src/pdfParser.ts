import { DocumentParser, type ParserInput } from '@hamster-note/document-parser'
import type {
  IntermediateOutlineDest,
  IntermediateOutlineDestPage,
  IntermediateOutlineDestPosition,
  IntermediateOutlineDestUrl,
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
import {
  getDocument,
  type PageViewport,
  type PDFDocumentProxy,
  type PDFPageProxy,
  Util
} from 'pdfjs-dist'
import type {
  TextContent,
  TextItem,
  TextStyle
} from 'pdfjs-dist/types/src/display/api'
import { ensurePdfjsWorkerConfigured } from './pdfjsWorker'
import './polyfills/dom-matrix.polyfill'
import './polyfills/promise-withresolvers.polyfill'

export class PdfParser extends DocumentParser {
  async encode(_input: ParserInput): Promise<IntermediateDocument> {
    const arrayBuffer = await DocumentParser.toArrayBuffer(_input)
    const doc = await PdfParser.encode(arrayBuffer)
    if (!doc) throw new Error('Failed to parse PDF')
    return doc
  }

  static readonly exts = ['pdf'] as const

  static async encode(
    fileOrBuffer: File | ArrayBuffer
  ): Promise<IntermediateDocument | undefined> {
    const buffer = await PdfParser.toArrayBuffer(fileOrBuffer).catch(
      () => undefined
    )
    if (!buffer) return undefined

    const pdf = await PdfParser.loadPdf(buffer)

    let title = 'Untitled PDF'
    try {
      const meta = await pdf.getMetadata()
      title = (meta?.info as { Title: string })?.Title || title
    } catch {
      title = 'Untitled PDF'
    }
    const id = (pdf.fingerprints?.[0] ?? `pdf-${Date.now()}`) as string

    const infoList = await PdfParser.buildPageInfoList(pdf, id)
    const pagesMap = IntermediatePageMap.makeByInfoList(infoList)
    const outline = await PdfParser.buildOutline(pdf, id).catch(() => undefined)
    return new IntermediateDocument({ id, title, pagesMap, outline })
  }

  static async decode(
    intermediateDocument: IntermediateDocument
  ): Promise<ArrayBuffer> {
    PdfParser.validateIntermediateDocumentForDecode(intermediateDocument)
    const { renderIntermediateDocumentToPdfBuffer } =
      await import('./services/pdfDocumentRenderer')
    const result =
      await renderIntermediateDocumentToPdfBuffer(intermediateDocument)
    return result
  }

  private static validateIntermediateDocumentForDecode(
    document: IntermediateDocument
  ): void {
    if (!document) {
      throw new Error('cannot decode empty document')
    }
    if (document.pageCount <= 0) {
      throw new Error('cannot decode empty document')
    }
    if (document.pageNumbers.length === 0) {
      throw new Error('cannot decode empty document')
    }
  }

  private static async loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
    ensurePdfjsWorkerConfigured()
    const dataCopy = data.slice(0)
    const loadingTask = getDocument({
      data: new Uint8Array(dataCopy)
    } as Parameters<typeof getDocument>[0])
    return loadingTask.promise
  }

  private static async buildPageInfoList(
    pdf: PDFDocumentProxy,
    pdfId: string
  ): Promise<
    {
      id: string
      pageNumber: number
      size: Number2
      getData: () => Promise<IntermediatePage>
    }[]
  > {
    const total = pdf.numPages
    const result: {
      id: string
      pageNumber: number
      size: Number2
      getData: () => Promise<IntermediatePage>
    }[] = []
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: 1 })
      const id = `${pdfId}-page-${n}`
      const size: Number2 = { x: viewport.width, y: viewport.height }
      const getData = () => PdfParser.buildIntermediatePage(pdf, n, pdfId)
      result.push({ id, pageNumber: n, size, getData })
      page.cleanup?.()
    }
    return result
  }

  private static async buildIntermediatePage(
    pdf: PDFDocumentProxy,
    pageNumber: number,
    pdfId: string
  ): Promise<IntermediatePage> {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent({
      includeMarkedContent: false
    })
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
        width: 0,
        height: 0,
        lineHeight: 0,
        x: 0,
        y: 0,
        ascent: 0,
        descent: 0,
        vertical: false,
        dir: TextDir.LTR,
        rotate: 0,
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
      const { x, y } = PdfParser.transformToViewport(
        textItem.transform,
        viewport
      )
      const metrics = PdfParser.collectMetrics(textItem, style)
      const text = new IntermediateText({
        id,
        content: String(textItem.str ?? ''),
        fontSize: metrics.fontSize,
        fontFamily: metrics.fontFamily,
        fontWeight: 500,
        italic: false,
        color: 'transparent',
        width: metrics.width,
        height: metrics.height,
        lineHeight: metrics.lineHeight,
        x,
        y,
        ascent: metrics.ascent,
        descent: metrics.descent,
        vertical: metrics.vertical,
        dir: PdfParser.mapTextDir(textItem.dir),
        rotate: 0,
        skew: 0,
        isEOL: Boolean(textItem.hasEOL)
      })
      items.push(text)
    }
    return items
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
    const transformed = Util.transform(viewport.transform, baseTransform)
    return {
      x: Number.isFinite(transformed[4]) ? transformed[4] : 0,
      y: Number.isFinite(transformed[5]) ? transformed[5] : 0
    }
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
