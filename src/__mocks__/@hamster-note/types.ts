// Mock for @hamster-note/types
export type Number2 = {
  x: number
  y: number
}

export enum TextDir {
  TTB = 'ttb',
  LTR = 'ltr',
  RTL = 'rtl'
}

export interface IntermediateTextSerialized {
  id: string
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  italic: boolean
  color: string
  width: number
  height: number
  lineHeight: number
  x: number
  y: number
  ascent: number
  descent: number
  vertical?: boolean
  dir: TextDir
  rotate: number
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
  width: number
  height: number
  lineHeight: number
  x: number
  y: number
  ascent: number
  descent: number
  vertical?: boolean
  dir: TextDir
  rotate: number
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
    width: text.width,
    height: text.height,
    lineHeight: text.lineHeight,
    x: text.x,
    y: text.y,
    ascent: text.ascent,
    descent: text.descent,
    vertical: text.vertical,
    dir: text.dir,
    rotate: text.rotate,
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
    width,
    height,
    lineHeight,
    x,
    y,
    ascent,
    descent,
    vertical,
    dir,
    rotate,
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
    this.width = width
    this.height = height
    this.lineHeight = lineHeight
    this.x = x
    this.y = y
    this.ascent = ascent
    this.descent = descent
    this.vertical = vertical
    this.dir = dir
    this.rotate = rotate
    this.skew = skew
    this.isEOL = isEOL
  }
}

export interface IntermediatePageSerialized {
  id: string
  texts: IntermediateTextSerialized[]
  width: number
  height: number
  number: number
  thumbnail: string | undefined
}

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
  width: number
  height: number
  number: number
  private _thumbnail?: string
  private _getThumbnailFn?: (scale: number) => Promise<string | undefined>

  static readonly serialize = (
    page: IntermediatePage
  ): IntermediatePageSerialized => ({
    id: page.id,
    texts: page.texts.map(IntermediateText.serialize),
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
    width,
    height,
    number,
    id,
    thumbnail
  }: Omit<IntermediatePageSerialized, 'texts'> & {
    texts: IntermediateText[] | IntermediateTextSerialized[]
  }) {
    this.id = id
    this.width = width
    this.height = height
    this.number = number
    this._thumbnail = thumbnail
    this.texts = texts.map(
      (t): IntermediateText =>
        t instanceof IntermediateText ? t : new IntermediateText(t)
    )
  }

  async getThumbnail(): Promise<string | undefined> {
    return this._thumbnail
  }

  async getTexts(): Promise<IntermediateText[]> {
    return this.texts
  }

  get hasLoadedTexts(): boolean {
    return true
  }

  setGetThumbnail(fn: (scale: number) => Promise<string | undefined>): void {
    this._getThumbnailFn = fn
  }

  setGetTexts(): void {
    // Mock implementation
  }
}

export class IntermediatePageMap {
  private entryById = new Map<string, IntermediatePageEntry>()
  private entryByPageNumber = new Map<number, IntermediatePageEntry>()

  constructor(entries?: IntermediatePageEntry[]) {
    if (entries) {
      for (const entry of entries) {
        this.entryById.set(entry.id, entry)
        this.entryByPageNumber.set(entry.pageNumber, entry)
      }
    }
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

  static readonly makeByInfoList = (
    infoList: {
      id: string
      pageNumber: number
      size: Number2
      getData: () => Promise<IntermediatePage>
    }[]
  ): IntermediatePageMap => IntermediatePageMap.fromInfoList(infoList)

  getPageById = async (id: string): Promise<IntermediatePage | undefined> => {
    const entry = this.entryById.get(id)
    if (!entry) return undefined
    return entry.loader()
  }

  getPageByPageNumber = async (
    pageNumber: number
  ): Promise<IntermediatePage | undefined> => {
    const entry = this.entryByPageNumber.get(pageNumber)
    if (!entry) return undefined
    return entry.loader()
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
    const promises = this.pageNumbers.map((n) => this.getPageByPageNumber(n))
    const pages = await Promise.all(promises)
    return pages.filter((p): p is IntermediatePage => p !== undefined)
  }

  updatePage = (_page: IntermediatePage): void => {
    // Mock implementation
  }

  static readonly fromSerialized = (): IntermediatePageMap => {
    return new IntermediatePageMap()
  }

  static readonly makeBySerializedData = (): IntermediatePageMap => {
    return new IntermediatePageMap()
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
    outline: IntermediateOutline
  ): IntermediateOutlineSerialized => ({
    ...IntermediateText.serialize(outline),
    dest: outline.dest
  })

  static readonly parse = (
    data: IntermediateOutlineSerialized
  ): IntermediateOutline => new IntermediateOutline(data)

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
    // Mock implementation
  }

  get pageCount(): number {
    return this.pagesMap.pageCount
  }

  get pageNumbers(): number[] {
    return this.pagesMap.pageNumbers
  }

  getCover = async (): Promise<string | undefined> => {
    return undefined
  }

  getPageById = async (id: string): Promise<IntermediatePage | undefined> => {
    return this.pagesMap.getPageById(id)
  }

  getPageByPageNumber = async (
    pageNumber: number
  ): Promise<IntermediatePage | undefined> => {
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

// Vector2 exports
export class Vector2 {
  constructor(
    public readonly x: number,
    public readonly y: number
  ) {}
}

// Point2D is an alias for Number2 for type compatibility
export { Number2 as Point2D }
