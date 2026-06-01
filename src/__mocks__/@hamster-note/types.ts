// Mock for @hamster-note/types@0.8.0
// Matches actual installed API surface at node_modules/@hamster-note/types/dist/**

export type Number2 = {
  x: number
  y: number
}

export enum TextDir {
  TTB = 'ttb',
  LTR = 'ltr',
  RTL = 'rtl'
}

// Polygon types (0.8.0)
export type PolygonPoint = [number, number]

export type Polygon = [PolygonPoint, PolygonPoint, PolygonPoint, PolygonPoint]

// Polygon utilities (0.8.0)
export function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parsePolygonPoint(point: unknown, index: number): PolygonPoint {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new TypeError(
      `Invalid polygon point at index ${index}: expected [number, number], got ${JSON.stringify(point)}`
    )
  }
  const [x, y] = point
  if (!isFiniteCoordinate(x) || !isFiniteCoordinate(y)) {
    throw new TypeError(
      `Invalid polygon point at index ${index}: coordinates must be finite numbers`
    )
  }
  return [x, y] as PolygonPoint
}

export function normalizePolygon(polygon: unknown): Polygon {
  if (!Array.isArray(polygon) || polygon.length !== 4) {
    throw new TypeError(
      `Invalid polygon: expected 4 points, got ${Array.isArray(polygon) ? polygon.length : typeof polygon}`
    )
  }
  return [
    parsePolygonPoint(polygon[0], 0),
    parsePolygonPoint(polygon[1], 1),
    parsePolygonPoint(polygon[2], 2),
    parsePolygonPoint(polygon[3], 3)
  ]
}

export interface IntermediateTextSerialized {
  id: string
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  italic: boolean
  color: string
  polygon: Polygon
  lineHeight: number
  ascent: number
  descent: number
  vertical?: boolean
  dir: TextDir
  opacity?: number // 0.8.0 new field
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
  polygon: Polygon
  lineHeight: number
  ascent: number
  descent: number
  vertical?: boolean
  dir: TextDir
  opacity?: number
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
    opacity: text.opacity,
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
    opacity,
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
    this.opacity = opacity
    this.skew = skew
    this.isEOL = isEOL
  }
}

export enum TextMarkedContentType {
  BEGIN_MARKED_CONTENT = 'beginMarkedContent',
  BEGIN_MARKED_CONTENT_PROPS = 'beginMarkedContentProps',
  END_MARKED_CONTENT = 'endMarkedContent'
}

export class IntermediateTextMarkedContent extends IntermediateText {
  protected type: TextMarkedContentType
  protected markedContentId: string

  constructor(
    data: IntermediateTextSerialized,
    type: TextMarkedContentType,
    markedContentId: string
  ) {
    super(data)
    this.type = type
    this.markedContentId = markedContentId
  }
}

export interface IntermediateImageClip {
  x: number
  y: number
  width: number
  height: number
}

export interface IntermediateImageSerialized {
  id: string
  src: string
  polygon: Polygon
  opacity: number
  clip?: IntermediateImageClip
}

export class IntermediateImage implements IntermediateImageSerialized {
  id: string
  src: string
  polygon: Polygon
  opacity: number
  clip?: IntermediateImageClip

  static readonly serialize = (
    image: IntermediateImage
  ): IntermediateImageSerialized => ({
    id: image.id,
    src: image.src,
    polygon: image.polygon,
    opacity: image.opacity,
    clip: image.clip
  })

  static readonly parse = (
    data: IntermediateImageSerialized
  ): IntermediateImage => new IntermediateImage(data)

  constructor({
    id,
    src,
    polygon,
    opacity,
    clip
  }: IntermediateImageSerialized) {
    this.id = id
    this.src = src
    this.polygon = polygon
    this.opacity = opacity
    this.clip = clip
  }
}

// 0.8.0 content types
export type IntermediateContent = IntermediateText | IntermediateImage

export type IntermediateContentSerialized =
  | IntermediateTextSerialized
  | IntermediateImageSerialized

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
  content?: IntermediateContentSerialized[]
  texts?: IntermediateTextSerialized[] // backward compat
  paragraphs?: IntermediateParagraphSerialized[]
  width: number
  height: number
  number: number
  thumbnail?: IntermediateImageSerialized
}

type ContentGetterReturnType =
  | Promise<IntermediateContent[] | IntermediateContentSerialized[]>
  | IntermediateContent[]
  | IntermediateContentSerialized[]

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
  content: IntermediateContent[]
  paragraphs: IntermediateParagraph[]
  width: number
  height: number
  number: number
  thumbnail?: IntermediateImageSerialized
  private _getThumbnailFn?: (
    scale: number
  ) => Promise<IntermediateImage | undefined>
  private _getContentFn?: () => ContentGetterReturnType
  private contentLoaded: boolean

  static readonly serialize = (
    page: IntermediatePage
  ): IntermediatePageSerialized => ({
    id: page.id,
    content: page.content.map((item) =>
      item instanceof IntermediateImage
        ? IntermediateImage.serialize(item)
        : IntermediateText.serialize(item as IntermediateText)
    ),
    paragraphs: page.paragraphs.map(IntermediateParagraph.serialize),
    width: page.width,
    height: page.height,
    number: page.number,
    thumbnail: page.thumbnail
  })

  static readonly parse = (
    data: IntermediatePageSerialized
  ): IntermediatePage => new IntermediatePage(data)

  constructor({
    content,
    texts,
    paragraphs,
    width,
    height,
    number,
    id,
    thumbnail,
    getThumbnailFn,
    getContentFn
  }: Omit<IntermediatePageSerialized, 'content' | 'texts' | 'paragraphs'> & {
    content?: IntermediateContent[] | IntermediateContentSerialized[]
    texts?: IntermediateText[] | IntermediateTextSerialized[]
    paragraphs?: IntermediateParagraph[] | IntermediateParagraphSerialized[]
  } & {
    getThumbnailFn?: (scale: number) => Promise<IntermediateImage | undefined>
    getContentFn?: () => ContentGetterReturnType
  }) {
    this.id = id
    this.width = width
    this.height = height
    this.number = number
    this.thumbnail = thumbnail
    this._getThumbnailFn = getThumbnailFn
    this._getContentFn = getContentFn

    // Handle content vs texts backward compatibility
    // If texts is provided but not content, treat texts as content (transition period)
    if (content !== undefined) {
      this.content = content.map((item) => {
        if (item instanceof IntermediateImage) return item
        if (item instanceof IntermediateText) return item
        // It's a serialized form
        if ('src' in item) return IntermediateImage.parse(item)
        return IntermediateText.parse(item as IntermediateTextSerialized)
      })
    } else if (texts !== undefined) {
      // Backward compatibility: texts passed but not content
      this.content = texts.map((text) =>
        text instanceof IntermediateText
          ? text
          : IntermediateText.parse(text as IntermediateTextSerialized)
      )
    } else {
      this.content = []
    }

    this.paragraphs = (paragraphs ?? []).map(
      (paragraph): IntermediateParagraph =>
        paragraph instanceof IntermediateParagraph
          ? paragraph
          : new IntermediateParagraph(paragraph)
    )
    this.contentLoaded = getContentFn === undefined
  }

  async getThumbnail(
    scale: number = 1
  ): Promise<IntermediateImage | undefined> {
    if (this._getThumbnailFn) {
      const thumbnail = await this._getThumbnailFn(scale)
      this.thumbnail = thumbnail
        ? IntermediateImage.serialize(thumbnail)
        : undefined
      return thumbnail
    }

    // Return deserialized thumbnail if available
    if (this.thumbnail) {
      return IntermediateImage.parse(this.thumbnail)
    }

    return undefined
  }

  async getContent(): Promise<IntermediateContent[]> {
    if (this._getContentFn) {
      const content = await this._getContentFn()
      this.content = content.map((item) => {
        if (item instanceof IntermediateImage) return item
        if (item instanceof IntermediateText) return item
        if ('src' in item) return IntermediateImage.parse(item)
        return IntermediateText.parse(item as IntermediateTextSerialized)
      })
      this.contentLoaded = true
      this._getContentFn = undefined
    }

    return this.content
  }

  get hasLoadedContent(): boolean {
    return this.contentLoaded
  }

  setGetThumbnail(
    fn: (scale: number) => Promise<IntermediateImage | undefined>
  ): void {
    this._getThumbnailFn = fn
  }

  setGetContent(fn: () => ContentGetterReturnType): void {
    this._getContentFn = fn
    this.contentLoaded = false
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

  getCover = async (scale?: number): Promise<IntermediateImage | undefined> => {
    const firstPageNumber = this.pageNumbers[0]
    const firstPage =
      firstPageNumber === undefined
        ? undefined
        : await this.getPageByPageNumber(firstPageNumber)

    return firstPage ? firstPage.getThumbnail(scale) : undefined
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
