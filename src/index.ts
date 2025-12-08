import { DocumentParser } from '@src/parser/DocumentParser'
import { IntermediateDocument } from '@src/types/common/HamsterDocument'
import { IntermediatePageMap } from '@typesCommon/HamsterDocument/IntermediateDocument'
import { IntermediatePage } from '@typesCommon/HamsterDocument/IntermediatePage'
import {
  IntermediateText,
  TextDir
} from '@typesCommon/HamsterDocument/IntermediateText'
import {
  IntermediateOutline,
  IntermediateOutlineDest,
  IntermediateOutlineDestPage,
  IntermediateOutlineDestPosition,
  IntermediateOutlineDestType,
  IntermediateOutlineDestUrl
} from '@typesCommon/HamsterDocument/IntermediateOutline'
import type { Number2 } from '@math'
import {
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy
} from 'pdfjs-dist'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

export class PdfParser extends DocumentParser {
  static ext = 'pdf'
  constructor(file: File | ArrayBuffer) {
    super(file)
  }
  async encode(): Promise<IntermediateDocument | undefined> {
    const buffer = await this.arrayBuffer?.catch(() => undefined)
    if (!buffer) return undefined

    console.log('loadPdf', buffer)
    const pdf = await this.loadPdf(buffer)
    // title/id
    let title = 'Untitled PDF'
    try {
      const meta = await pdf.getMetadata()
      title = (meta?.info as { Title: string })?.Title || title
    } catch (e) {
      console.error(e)
    }
    const id = (pdf.fingerprints?.[0] ?? `pdf-${Date.now()}`) as string

    const infoList = await this.buildPageInfoList(pdf)
    const pagesMap = IntermediatePageMap.makeByInfoList(infoList)
    const outline = await this.buildOutline(pdf).catch(() => undefined)
    return new IntermediateDocument({ id, title, pagesMap, outline })
  }
  async decode(
    _intermediateDocument: IntermediateDocument
  ): Promise<File | ArrayBuffer | undefined> {
    // 当前阶段不尝试从中间结构重建 PDF，直接返回原始的 ArrayBuffer（若可用）。
    try {
      const buf = await this.arrayBuffer
      return buf
    } catch {
      return undefined
    }
  }

  // Helpers
  private async loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
    // Important: clone the buffer before passing to pdf.js worker.
    // The worker uses transfer which will detach the provided ArrayBuffer.
    // Using a cloned buffer prevents "ArrayBuffer is already detached" errors
    // when the original buffer is reused elsewhere.
    const dataCopy = data.slice(0)
    const loadingTask = getDocument({ data: new Uint8Array(dataCopy) })
    return loadingTask.promise
  }

  private async buildPageInfoList(pdf: PDFDocumentProxy): Promise<
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
      const id = `page-${n}`
      const size: Number2 = { x: viewport.width, y: viewport.height }
      const getData = () => this.buildIntermediatePage(pdf, n)
      result.push({ id, pageNumber: n, size, getData })
      page.cleanup?.()
    }
    return result
  }

  private async buildIntermediatePage(
    pdf: PDFDocumentProxy,
    pageNumber: number
  ): Promise<IntermediatePage> {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent({
      includeMarkedContent: false
    })
    const texts = this.mapTextContentToIntermediate(textContent)
    const thumbnail = await this.renderThumbnail(page, 0.3).catch(
      () => undefined
    )
    const intermediatePage = new IntermediatePage({
      id: `page-${pageNumber}`,
      number: pageNumber,
      width: viewport.width,
      height: viewport.height,
      texts,
      thumbnail
    })
    page.cleanup?.()
    return intermediatePage
  }

  // Outline
  private async buildOutline(
    pdf: PDFDocumentProxy
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
      const dest = await this.mapOutlineDest(pdf, node).catch(
        () => undefined as unknown as IntermediateOutlineDest
      )
      if (!dest) return undefined
      const outline = new IntermediateOutline({
        id: `outline-${idCounter++}`,
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

  private async mapOutlineDest(
    pdf: PDFDocumentProxy,
    node: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]
  ): Promise<IntermediateOutlineDest> {
    // Prefer URL if present
    if (node?.url) {
      const destUrl: IntermediateOutlineDestUrl = {
        targetType: IntermediateOutlineDestType.URL,
        url: String(node.url),
        unsafeUrl: node.unsafeUrl,
        newWindow: !!node.newWindow
      }
      const children = await this.mapChildOutlineDest(pdf, node.items)
      if (children.length) destUrl.items = children
      return destUrl
    }

    // Resolve destination array
    let destArray:
      | Awaited<ReturnType<PDFDocumentProxy['getDestination']>>[]
      | null = []
    const rawDest = node?.dest
    if (typeof rawDest === 'string') {
      try {
        destArray = await pdf.getDestination(rawDest)
      } catch {
        destArray = []
      }
    } else if (Array.isArray(rawDest)) {
      destArray = rawDest
    }

    // Try resolve page index from dest array
    if (Array.isArray(destArray) && destArray.length > 0) {
      const ref = destArray[0]
      try {
        // If ref is a reference, resolve to page index
        if (ref && typeof ref === 'object' && 'num' in ref) {
          // @ts-expect-error 这里忽略掉问题，因为 pdf.getDestination 只给了 any 类型
          const index = await pdf.getPageIndex(ref)
          const pageNumber = Number(index) + 1
          const destPage: IntermediateOutlineDestPage = {
            targetType: IntermediateOutlineDestType.PAGE,
            pageId: `page-${pageNumber}`
          }
          const children = await this.mapChildOutlineDest(pdf, node.items)
          if (children.length) destPage.items = children
          return destPage
        }
      } catch (e) {
        console.error(e)
      }
    }

    // Fallback to a position-type destination when nothing resolvable
    const destPos: IntermediateOutlineDestPosition = {
      targetType: IntermediateOutlineDestType.POSITION
    }
    const children = await this.mapChildOutlineDest(pdf, node.items)
    if (children.length) destPos.items = children
    return destPos
  }

  private async mapChildOutlineDest(
    pdf: PDFDocumentProxy,
    items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined
  ): Promise<IntermediateOutlineDest[]> {
    if (!Array.isArray(items) || items.length === 0) return []
    const result: IntermediateOutlineDest[] = []
    for (const child of items) {
      try {
        const d = await this.mapOutlineDest(pdf, child)
        if (d) result.push(d)
      } catch (e) {
        console.error(e)
      }
    }
    return result
  }

  private mapTextContentToIntermediate(
    textContent: TextContent
  ): IntermediateText[] {
    const items: IntermediateText[] = []
    const styles = textContent.styles
    let idx = 0
    for (const it of textContent.items) {
      if (typeof (it as TextItem)?.str !== 'string') {
        // Skip non-text items (e.g., marked content delimiters)
        continue
      }
      const textItem = it as TextItem
      const style = styles?.[textItem.fontName] || {}
      const id = `text-${idx++}`
      const dir = ((): TextDir => {
        switch (textItem.dir) {
          case 'rtl':
            return TextDir.RTL
          case 'ttb':
            return TextDir.TTB
          default:
            return TextDir.LTR
        }
      })()
      const transform: number[] = Array.isArray(textItem.transform)
        ? textItem.transform
        : [1, 0, 0, 1, 0, 0]
      const x = Number(transform[4] || 0)
      const y = Number(transform[5] || 0)
      const height = Number(textItem.height || 0)
      const width = Number(textItem.width || 0)
      const ascent = Number(style.ascent ?? 0)
      const descent = Number(style.descent ?? 0)
      const fontFamily = String(style.fontFamily ?? '')
      const vertical = Boolean(style.vertical ?? false) || undefined
      const text = new IntermediateText({
        id,
        content: String(textItem.str ?? ''),
        fontSize: height || Math.abs(ascent - descent) || 0,
        fontFamily,
        fontWeight: 500,
        italic: false,
        // 没有颜色就用透明
        color: 'transparent',
        width,
        height,
        lineHeight: height || Math.abs(ascent - descent) || 0,
        x,
        y,
        ascent,
        descent,
        vertical,
        dir,
        rotate: 0,
        skew: 0,
        isEOL: Boolean(textItem.hasEOL)
      })
      items.push(text)
    }
    return items
  }

  private async renderThumbnail(
    page: PDFPageProxy,
    scale = 0.25
  ): Promise<string | undefined> {
    if (typeof document === 'undefined') return undefined
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const renderTask = page.render({ canvas, viewport })
    await renderTask.promise
    const url = canvas.toDataURL('image/png')
    return url
  }
}
