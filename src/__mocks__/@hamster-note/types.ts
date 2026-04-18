export type Number2 = {
  x: number
  y: number
}

export enum TextDir {
  TTB = 'ttb',
  LTR = 'ltr',
  RTL = 'rtl'
}

export type IntermediateTextPolygonPoint = [number, number]

export type IntermediateTextPolygon = [
  IntermediateTextPolygonPoint,
  IntermediateTextPolygonPoint,
  IntermediateTextPolygonPoint,
  IntermediateTextPolygonPoint
]

export interface IntermediateTextSerialized {
  id: string
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  italic: boolean
  color: string
  polygon: IntermediateTextPolygon
  lineHeight: number
  ascent: number
  descent: number
  vertical?: boolean
  dir: TextDir
  skew: number
  isEOL: boolean
}

export class IntermediateText implements IntermediateTextSerialized {
  id: string
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  italic: boolean
  color: string
  polygon: IntermediateTextPolygon
  lineHeight: number
  ascent: number
  descent: number
  vertical?: boolean
  dir: TextDir
  skew: number
  isEOL: boolean

  static readonly serialize = (
    text: IntermediateText
  ): IntermediateTextSerialized => ({
    id: text.id,
    content: text.content,
    fontSize: text.fontSize,
    fontFamily: text.fontFamily,
    fontWeight: text.fontWeight,
    italic: text.italic,
    color: text.color,
    polygon: text.polygon,
    lineHeight: text.lineHeight,
    ascent: text.ascent,
    descent: text.descent,
    vertical: text.vertical,
    dir: text.dir,
    skew: text.skew,
    isEOL: text.isEOL
  })

  static readonly parse = (
    data: IntermediateTextSerialized
  ): IntermediateText => new IntermediateText(data)

  constructor({
    id,
    content,
    fontSize,
    fontFamily,
    fontWeight,
    italic,
    color,
    polygon,
    lineHeight,
    ascent,
    descent,
    vertical,
    dir,
    skew,
    isEOL
  }: IntermediateTextSerialized) {
    this.id = id
    this.content = content
    this.fontSize = fontSize
    this.fontFamily = fontFamily
    this.fontWeight = fontWeight
    this.italic = italic
    this.color = color
    this.polygon = polygon
    this.lineHeight = lineHeight
    this.ascent = ascent
    this.descent = descent
    this.vertical = vertical
    this.dir = dir
    this.skew = skew
    this.isEOL = isEOL
  }
}

export interface IntermediateParagraphSerialized {
  id: string
  x: number
  y: number
  width: number
  height: number
  textIds: string[]
}

export class IntermediateParagraph implements IntermediateParagraphSerialized {
  id: string
  x: number
  y: number
  width: number
  height: number
  textIds: string[]

  static readonly serialize = (
    paragraph: IntermediateParagraph
  ): IntermediateParagraphSerialized => ({
    id: paragraph.id,
    x: paragraph.x,
    y: paragraph.y,
    width: paragraph.width,
    height: paragraph.height,
    textIds: paragraph.textIds
  })

  static readonly parse = (
    data: IntermediateParagraphSerialized
  ): IntermediateParagraph => new IntermediateParagraph(data)

  constructor({
    id,
    x,
    y,
    width,
    height,
    textIds
  }: IntermediateParagraphSerialized) {
    this.id = id
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.textIds = [...textIds]
  }
}

export interface IntermediatePageSerialized {
  id: string
  texts: IntermediateTextSerialized[]
  paragraphs?: IntermediateParagraphSerialized[]
  width: number
  height: number
  number: number
  thumbnail: string | undefined
}

type TextsGetterReturnType =
  | Promise<IntermediateText[] | IntermediateTextSerialized[]>
  | IntermediateText[]
  | IntermediateTextSerialized[]

type PageLoader = () => Promise<IntermediatePage>

interface IntermediatePageEntry {
  id: string
  pageNumber: number
  size: Number2
  loader: PageLoader
  cache?: Promise<IntermediatePage>
}

export class IntermediatePage {
  id: string
  texts: IntermediateText[]
  paragraphs: IntermediateParagraph[]
  width: number
  height: number
  number: number
  private _thumbnail?: string
  private _getThumbnailFn?: (scale: number) => Promise<string | undefined>
  private _getTextsFn?: () => TextsGetterReturnType
  private textsLoaded: boolean

  static readonly serialize = (
    page: IntermediatePage
  ): IntermediatePageSerialized => ({
    id: page.id,
    texts: page.texts.map(IntermediateText.serialize),
    paragraphs: page.paragraphs.map(IntermediateParagraph.serialize),
    width: page.width,
    height: page.height,
    number: page.number,
    thumbnail: page._thumbnail
  })

  static readonly parse = (
    data: IntermediatePageSerialized
  ): IntermediatePage => new IntermediatePage(data)

  constructor({
    texts,
    paragraphs,
    width,
    height,
    number,
    id,
    thumbnail,
    getThumbnailFn,
    getTextsFn
  }: Omit<IntermediatePageSerialized, 'texts' | 'paragraphs'> & {
    texts: IntermediateText[] | IntermediateTextSerialized[]
    paragraphs?: IntermediateParagraph[] | IntermediateParagraphSerialized[]
  } & {
    getThumbnailFn?: (scale: number) => Promise<string | undefined>
    getTextsFn?: () => TextsGetterReturnType
  }) {
    this.id = id
    this.width = width
    this.height = height
    this.number = number
    this._thumbnail = thumbnail
    this._getThumbnailFn = getThumbnailFn
    this._getTextsFn = getTextsFn
    this.texts = texts.map(
      (text): IntermediateText =>
        text instanceof IntermediateText ? text : new IntermediateText(text)
    )
    this.paragraphs = (paragraphs ?? []).map(
      (paragraph): IntermediateParagraph =>
        paragraph instanceof IntermediateParagraph
          ? paragraph
          : new IntermediateParagraph(paragraph)
    )
    this.textsLoaded = getTextsFn === undefined
  }

  async getThumbnail(scale: number = 1): Promise<string | undefined> {
    if (this._getThumbnailFn) {
      const thumbnail = await this._getThumbnailFn(scale)
      this._thumbnail = thumbnail
      return thumbnail
    }

    return this._thumbnail
  }

  async getTexts(): Promise<IntermediateText[]> {
    if (this._getTextsFn) {
      const texts = await this._getTextsFn()
      this.texts = texts.map(
        (text): IntermediateText =>
          text instanceof IntermediateText ? text : new IntermediateText(text)
      )
      this.textsLoaded = true
      this._getTextsFn = undefined
    }

    return this.texts
  }

  get hasLoadedTexts(): boolean {
    return this.textsLoaded
  }

  setGetThumbnail(fn: (scale: number) => Promise<string | undefined>): void {
    this._getThumbnailFn = fn
  }

  setGetTexts(fn: () => TextsGetterReturnType): void {
    this._getTextsFn = fn
    this.textsLoaded = false
  }
}

export class IntermediatePageMap {
  private entryById = new Map<string, IntermediatePageEntry>()
  private entryByPageNumber = new Map<number, IntermediatePageEntry>()

  constructor(entries?: IntermediatePageEntry[]) {
    if (entries) {
      for (const entry of entries) {
        this.registerEntry(entry)
      }
    }
  }

  private registerEntry(entry: IntermediatePageEntry): void {
    this.entryById.set(entry.id, entry)
    this.entryByPageNumber.set(entry.pageNumber, entry)
  }

  private resolve(entry: IntermediatePageEntry): Promise<IntermediatePage> {
    if (!entry.cache) {
      entry.cache = entry.loader()
    }

    return entry.cache
  }

  static readonly fromInfoList = (
    infoList: {
      id: string
      pageNumber: number
      size: Number2
      getData: () => Promise<IntermediatePage>
    }[]
  ): IntermediatePageMap => {
    const entries: IntermediatePageEntry[] = infoList.map((info) => ({
      id: info.id,
      pageNumber: info.pageNumber,
      size: info.size,
      loader: info.getData
    }))

    return new IntermediatePageMap(entries)
  }

  static readonly fromSerialized = (
    pages: IntermediatePageSerialized[]
  ): IntermediatePageMap => {
    const entries: IntermediatePageEntry[] = pages.map((page) => ({
      id: page.id,
      pageNumber: page.number,
      size: { x: page.width, y: page.height },
      loader: async () => IntermediatePage.parse(page)
    }))

    return new IntermediatePageMap(entries)
  }

  static readonly makeByInfoList = (
    infoList: {
      id: string
      pageNumber: number
      size: Number2
      getData: () => Promise<IntermediatePage>
    }[]
  ): IntermediatePageMap => IntermediatePageMap.fromInfoList(infoList)

  static readonly makeBySerializedData = (
    pages: IntermediatePageSerialized[]
  ): IntermediatePageMap => IntermediatePageMap.fromSerialized(pages)

  getPageById = (id: string): Promise<IntermediatePage> | undefined => {
    const entry = this.entryById.get(id)
    return entry ? this.resolve(entry) : undefined
  }

  getPageByPageNumber = (
    pageNumber: number
  ): Promise<IntermediatePage> | undefined => {
    const entry = this.entryByPageNumber.get(pageNumber)
    return entry ? this.resolve(entry) : undefined
  }

  getPageSizeByPageNumber = (pageNumber: number): Number2 | undefined => {
    const entry = this.entryByPageNumber.get(pageNumber)
    return entry?.size
  }

  get pageCount(): number {
    return this.entryByPageNumber.size
  }

  get pageNumbers(): number[] {
    return Array.from(this.entryByPageNumber.keys()).sort((a, b) => a - b)
  }

  getPages = async (): Promise<IntermediatePage[]> => {
    const pages = await Promise.all(
      this.pageNumbers
        .map((pageNumber) => this.getPageByPageNumber(pageNumber))
        .filter((page): page is Promise<IntermediatePage> => page !== undefined)
    )

    return pages
  }

  updatePage = (page: IntermediatePage): void => {
    this.registerEntry({
      id: page.id,
      pageNumber: page.number,
      size: { x: page.width, y: page.height },
      loader: async () => page,
      cache: Promise.resolve(page)
    })
  }
}

export enum IntermediateOutlineDestType {
  TEXT = 'text',
  PAGE = 'page',
  POSITION = 'position',
  URL = 'url'
}

export type IntermediateOutlineDest =
  | IntermediateOutlineDestPage
  | IntermediateOutlineDestText
  | IntermediateOutlineDestPosition
  | IntermediateOutlineDestUrl

export interface IntermediateOutlineDestUrl {
  targetType: IntermediateOutlineDestType.URL
  url: string
  unsafeUrl: string | undefined
  newWindow: boolean
  items?: IntermediateOutlineDest[]
}

export interface IntermediateOutlineDestPage {
  targetType: IntermediateOutlineDestType.PAGE
  pageId: string
  items?: IntermediateOutlineDest[]
}

export interface IntermediateOutlineDestText {
  targetType: IntermediateOutlineDestType.TEXT
  textId: string
  items?: IntermediateOutlineDest[]
}

export interface IntermediateOutlineDestPosition {
  targetType: IntermediateOutlineDestType.POSITION
  items?: IntermediateOutlineDest[]
}

export interface IntermediateOutlineSerialized extends IntermediateTextSerialized {
  dest: IntermediateOutlineDest
}

export class IntermediateOutline extends IntermediateText {
  dest: IntermediateOutlineDest

  static readonly serialize = (
    outline: IntermediateText
  ): IntermediateOutlineSerialized => ({
    ...IntermediateText.serialize(outline),
    dest: (outline as IntermediateOutline).dest
  })

  static readonly parse = (
    data: IntermediateTextSerialized
  ): IntermediateOutline =>
    new IntermediateOutline(data as IntermediateOutlineSerialized)

  constructor(data: IntermediateOutlineSerialized) {
    super(data)
    this.dest = data.dest
  }
}

export interface IntermediateDocumentSerialized {
  id: string
  pages: IntermediatePageSerialized[]
  title: string
  outline?: IntermediateOutlineSerialized[]
}

export class IntermediateDocument {
  readonly id: string
  title: string
  outline?: IntermediateOutline[]
  private pagesMap: IntermediatePageMap

  constructor({
    pagesMap,
    id,
    title,
    outline
  }: Omit<IntermediateDocumentSerialized, 'pages'> & {
    pagesMap: IntermediatePageMap
    outline?: IntermediateOutline[]
  }) {
    this.id = id
    this.title = title
    this.pagesMap = pagesMap
    this.outline = outline
  }

  get pages(): Promise<IntermediatePage[]> {
    return this.pagesMap.getPages()
  }

  set pages(pages: IntermediatePage[]) {
    this.pagesMap = IntermediatePageMap.fromSerialized(
      pages.map(IntermediatePage.serialize)
    )
  }

  get pageCount(): number {
    return this.pagesMap.pageCount
  }

  get pageNumbers(): number[] {
    return this.pagesMap.pageNumbers
  }

  getCover = async (): Promise<string | undefined> => {
    const firstPageNumber = this.pageNumbers[0]
    const firstPage =
      firstPageNumber === undefined
        ? undefined
        : await this.getPageByPageNumber(firstPageNumber)

    return firstPage?.getThumbnail()
  }

  getPageById = (id: string): Promise<IntermediatePage> | undefined => {
    return this.pagesMap.getPageById(id)
  }

  getPageByPageNumber = (
    pageNumber: number
  ): Promise<IntermediatePage> | undefined => {
    return this.pagesMap.getPageByPageNumber(pageNumber)
  }

  getPageSizeByPageNumber = (pageNumber: number): Number2 | undefined => {
    return this.pagesMap.getPageSizeByPageNumber(pageNumber)
  }

  getOutline = (): IntermediateOutline[] | undefined => {
    return this.outline
  }

  static readonly serialize = async (
    doc: IntermediateDocument
  ): Promise<IntermediateDocumentSerialized> => {
    const pages = await doc.pages

    return {
      id: doc.id,
      title: doc.title,
      pages: pages.map(IntermediatePage.serialize),
      outline: doc.outline?.map(IntermediateOutline.serialize)
    }
  }

  static readonly parse = (
    data: IntermediateDocumentSerialized
  ): IntermediateDocument => {
    const pagesMap = IntermediatePageMap.fromSerialized(data.pages)

    return new IntermediateDocument({
      id: data.id,
      title: data.title,
      pagesMap,
      outline: data.outline?.map(IntermediateOutline.parse)
    })
  }
}

export class Vector2 {
  constructor(
    public readonly x: number,
    public readonly y: number
  ) {}
}

export type { Number2 as Point2D }
