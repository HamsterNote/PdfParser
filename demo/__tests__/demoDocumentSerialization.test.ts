import {
  IntermediateDocument,
  IntermediateImage,
  IntermediatePage,
  IntermediatePageMap,
  IntermediateText,
  TextDir
} from '@hamster-note/types'
import {
  createProgressiveSerializer,
  serializeIntermediate,
  type DemoDocumentSnapshot,
  type DemoPageSummary,
  type DemoSerializableDocument
} from '../demoDocumentSerialization'

function isIntermediateTextItem(item: unknown): item is IntermediateText {
  return (
    item instanceof IntermediateText ||
    (typeof item === 'object' && item !== null && 'content' in item)
  )
}

function isIntermediateImageItem(item: unknown): item is IntermediateImage {
  return (
    item instanceof IntermediateImage ||
    (typeof item === 'object' && item !== null && 'src' in item)
  )
}

function extractTexts(content: unknown[]): IntermediateText[] {
  return content.filter(isIntermediateTextItem)
}

function extractImages(content: unknown[]): IntermediateImage[] {
  return content.filter(isIntermediateImageItem)
}

type SourceContentItem =
  | ConstructorParameters<typeof IntermediateText>[0]
  | ConstructorParameters<typeof IntermediateImage>[0]
type SourcePage = {
  id: string
  number: number
  width: number
  height: number
  content: SourceContentItem[]
}
type SourceDocument = {
  id: string
  title: string
  pages: SourcePage[]
  outline?: []
}
type PageMapEntry = {
  id: string
  pageNumber: number
  size: { x: number; y: number }
  getData: () => Promise<IntermediatePage>
}

function makeDocument({ id, title, pages, outline = [] }: SourceDocument) {
  const entries: PageMapEntry[] = pages.map((p) => ({
    id: p.id,
    pageNumber: p.number,
    size: { x: p.width, y: p.height },
    getData: async () => {
      const content = (p.content || []).map(createContentItem)
      return new IntermediatePage({
        id: p.id,
        width: p.width,
        height: p.height,
        number: p.number,
        content,
        paragraphs: [],
        getContentFn: async () => content
      })
    }
  }))

  const pagesMap = IntermediatePageMap.makeByInfoList(entries)

  return new IntermediateDocument({
    id,
    title,
    pagesMap,
    outline
  })
}

let _textIdCounter = 0
function makeText(
  content: string
): ConstructorParameters<typeof IntermediateText>[0] {
  return {
    id: `text-${++_textIdCounter}`,
    content,
    fontSize: 12,
    fontFamily: 'Arial',
    fontWeight: 400,
    italic: false,
    color: '#000',
    polygon: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ],
    lineHeight: 1.2,
    ascent: 0.8,
    descent: 0.2,
    dir: TextDir.LTR,
    skew: 0,
    isEOL: false
  }
}

let _imageIdCounter = 0
function makeImage(): ConstructorParameters<typeof IntermediateImage>[0] {
  return {
    id: `image-${++_imageIdCounter}`,
    src: 'data:image/png;base64,abc123',
    polygon: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ],
    opacity: 1
  }
}

function createContentItem(item: SourceContentItem) {
  if ('src' in item) {
    return new IntermediateImage(item)
  }

  return new IntermediateText(item)
}

function pageSummaryEquals(a: DemoPageSummary, b: DemoPageSummary) {
  return (
    a.number === b.number &&
    a.width === b.width &&
    a.height === b.height &&
    a.textCount === b.textCount &&
    a.imageCount === b.imageCount &&
    JSON.stringify(a.previewText) === JSON.stringify(b.previewText)
  )
}

function docEquals(a: DemoDocumentSnapshot, b: DemoDocumentSnapshot) {
  if (
    a.id !== b.id ||
    a.title !== b.title ||
    a.pageCount !== b.pageCount ||
    a.hasOutline !== b.hasOutline
  ) {
    return false
  }
  if (JSON.stringify(a.pageNumbers) !== JSON.stringify(b.pageNumbers)) {
    return false
  }
  if (a.pages.length !== b.pages.length) {
    return false
  }
  for (let i = 0; i < a.pages.length; i++) {
    if (!pageSummaryEquals(a.pages[i], b.pages[i])) {
      return false
    }
  }
  return true
}

function buildExpectedPageSummary(
  page: IntermediatePage,
  texts: IntermediateText[],
  images: IntermediateImage[] = []
): DemoPageSummary {
  return {
    number: page.number,
    width: page.width,
    height: page.height,
    textCount: texts.length,
    imageCount: images.length,
    previewText: texts.map((text) => ({
      content: text.content,
      fontSize: text.fontSize,
      fontFamily: text.fontFamily,
      color: text.color,
      polygon: text.polygon
    }))
  }
}

function createPagesMap(pages: IntermediatePage[]) {
  return IntermediatePageMap.makeByInfoList(
    pages.map((page) => ({
      id: page.id,
      pageNumber: page.number,
      size: { x: page.width, y: page.height },
      getData: async () => page
    }))
  )
}

function createPagesWithDelayedTexts(
  pages: IntermediatePage[],
  delayMs: number
) {
  pages.forEach((page) => {
    page.setGetContent(createDelayedContentGetter(page, delayMs))
  })
  return pages
}

function createDelayedContentGetter(page: IntermediatePage, delayMs: number) {
  return async () => {
    await new Promise((r) => setTimeout(r, delayMs))
    return Array.from(page.content)
  }
}

function waitMs(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function createSimplePagesMap(entries: PageMapEntry[]) {
  return IntermediatePageMap.makeByInfoList(entries)
}

describe('demoDocumentSerialization', () => {
  describe('createProgressiveSerializer', () => {
    it('shell is available immediately before any page text resolution', async () => {
      const doc = makeDocument({
        id: 'doc-1',
        title: 'Test Doc',
        pages: [
          { id: 'p1', number: 1, width: 100, height: 200, content: [] },
          { id: 'p2', number: 2, width: 100, height: 200, content: [] }
        ]
      })

      const serializer = createProgressiveSerializer(doc)
      const { shell } = serializer

      expect(shell.id).toBe('doc-1')
      expect(shell.title).toBe('Test Doc')
      expect(shell.pageCount).toBe(2)
      expect(shell.hasOutline).toBe(false)
      expect(shell.pageNumbers).toEqual([1, 2])
      expect(shell.pages).toHaveLength(2)
      expect(shell.pages[0].number).toBe(1)
      expect(shell.pages[0].textCount).toBe(0)
      expect(shell.pages[0].imageCount).toBe(0)
      expect(shell.pages[0].previewText).toEqual([])
      expect(shell.pages[1].number).toBe(2)
      expect(shell.pages[1].textCount).toBe(0)
      expect(shell.pages[1].imageCount).toBe(0)
      expect(shell.pages[1].previewText).toEqual([])
    })

    it('final resolved JSON is deep-equal to serializeIntermediate output', async () => {
      const doc = makeDocument({
        id: 'doc-2',
        title: 'Full Test',
        pages: [
          {
            id: 'p1',
            number: 1,
            width: 612,
            height: 792,
            content: [makeText('Hello'), makeText('World')]
          },
          {
            id: 'p2',
            number: 2,
            width: 612,
            height: 792,
            content: [makeText('Foo'), makeText('Bar'), makeText('Baz')]
          }
        ]
      })

      const legacy = await serializeIntermediate(doc)
      const serializer = createProgressiveSerializer(doc)
      const progressive = await serializer.resolve()

      expect(docEquals(legacy, progressive)).toBe(true)
    })

    it('onUpdate callbacks fire in ascending page order as pages resolve', async () => {
      const pages = createPagesWithDelayedTexts(
        [
          new IntermediatePage({
            id: 'p1',
            width: 100,
            height: 100,
            number: 1,
            content: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p2',
            width: 100,
            height: 100,
            number: 2,
            content: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p3',
            width: 100,
            height: 100,
            number: 3,
            content: [],
            paragraphs: []
          })
        ],
        5
      )

      const pagesMap = createPagesMap(pages)

      const doc = new IntermediateDocument({
        id: 'doc-3',
        title: 'Order Test',
        pagesMap,
        outline: []
      })
      const s = createProgressiveSerializer(doc)
      const updates: Array<{ pageCount: number; pageNumbers: number[] }> = []
      s.onUpdate((snap) => {
        updates.push({
          pageCount: snap.pageCount,
          pageNumbers: snap.pageNumbers.slice()
        })
      })
      await s.resolve()

      expect(updates.length).toBeGreaterThan(0)
      expect(updates[updates.length - 1].pageCount).toBe(3)
      expect(updates[updates.length - 1].pageNumbers).toEqual([1, 2, 3])
    })

    it('emits post-encode progress events while resolving summaries', async () => {
      const doc = makeDocument({
        id: 'doc-progress',
        title: 'Progress Test',
        pages: [
          {
            id: 'p1',
            number: 1,
            width: 612,
            height: 792,
            content: [makeText('Hello')]
          },
          {
            id: 'p2',
            number: 2,
            width: 612,
            height: 792,
            content: [makeText('World')]
          }
        ]
      })

      const progressEvents: Array<{
        stage: string
        current: number
        total: number
      }> = []
      const serializer = createProgressiveSerializer(doc, {
        onProgress: (event) => {
          progressEvents.push({
            stage: event.stage,
            current: event.current,
            total: event.total
          })
        }
      })

      await serializer.resolve()

      expect(progressEvents[0]).toEqual(
        expect.objectContaining({
          stage: 'serialize:start',
          current: 0
        })
      )
      expect(
        progressEvents.filter((event) => event.stage === 'serialize:page')
      ).toHaveLength(2)
      expect(
        progressEvents.some((event) => event.stage === 'serialize:cover')
      ).toBe(true)
      expect(progressEvents[progressEvents.length - 1]).toEqual(
        expect.objectContaining({
          stage: 'serialize:complete',
          current: progressEvents[progressEvents.length - 1].total
        })
      )
    })

    it('notifies subscribers when cover status resolves before page summaries', async () => {
      const page = new IntermediatePage({
        id: 'p1',
        width: 100,
        height: 200,
        number: 1,
        content: [],
        paragraphs: []
      })

      const doc = {
        id: 'doc-cover-update',
        title: 'Cover Update Test',
        pageCount: 1,
        pageNumbers: [1],
        outline: [],
        getOutline: () => [],
        getCover: async () => {
          await waitMs(10)
          return new IntermediateImage({
            id: 'cover-thumb',
            src: 'data:image/png;base64,abc123',
            polygon: [
              [0, 0],
              [100, 0],
              [100, 200],
              [0, 200]
            ],
            opacity: 1
          })
        },
        getPageByPageNumber: async () => {
          await waitMs(50)
          return page
        },
        getPageSizeByPageNumber: () => ({ x: 100, y: 200 })
      }

      const serializer = createProgressiveSerializer(doc)
      const coverUpdates: boolean[] = []
      serializer.onUpdate((snapshot) => {
        coverUpdates.push(snapshot.coverAvailable)
      })

      await waitMs(20)

      expect(coverUpdates).toContain(true)

      await serializer.resolve()
    })

    it('does not use Promise.all for page text resolution', async () => {
      const pages = createPagesWithDelayedTexts(
        [
          new IntermediatePage({
            id: 'p1',
            width: 100,
            height: 100,
            number: 1,
            content: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p2',
            width: 100,
            height: 100,
            number: 2,
            content: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p3',
            width: 100,
            height: 100,
            number: 3,
            content: [],
            paragraphs: []
          })
        ],
        10
      )

      const pagesMap = createPagesMap(pages)

      const doc = new IntermediateDocument({
        id: 'doc-4',
        title: 'Concurrency Test',
        pagesMap,
        outline: []
      })
      const s = createProgressiveSerializer(doc)
      const updateSnapshots: number[][] = []
      const extractPageNumbers = (snap: {
        pages: Array<{ number: number }>
      }) => {
        const pageNumbers: number[] = []
        for (const page of snap.pages) {
          pageNumbers.push(page.number)
        }
        return pageNumbers
      }
      s.onUpdate((snap) => {
        updateSnapshots.push(extractPageNumbers(snap))
      })
      await s.resolve()

      const lastSnapshot = updateSnapshots[updateSnapshots.length - 1]
      expect(lastSnapshot).toEqual([1, 2, 3])
    })

    it('re-accessing resolved pages does not re-call getContent', async () => {
      const doc = makeDocument({
        id: 'doc-6',
        title: 'Cache Test',
        pages: [
          {
            id: 'p1',
            number: 1,
            width: 100,
            height: 100,
            content: [makeText('Cached')]
          }
        ]
      })

      const pages = await doc.pages
      let getContentCalls = 0
      pages[0].setGetContent(async () => {
        getContentCalls++
        return pages[0].content
      })

      const serializer = createProgressiveSerializer(doc)
      await serializer.resolve()

      const callsBefore = getContentCalls
      await serializer.resolve()
      const callsAfter = getContentCalls

      expect(callsAfter).toBe(callsBefore)
    })

    it('final JSON shape matches legacy contract', async () => {
      const doc = makeDocument({
        id: 'doc-7',
        title: 'Legacy Contract Test',
        pages: [
          {
            id: 'p1',
            number: 1,
            width: 612,
            height: 792,
            content: [makeText('Hello'), makeText('World')]
          },
          {
            id: 'p2',
            number: 2,
            width: 612,
            height: 792,
            content: [makeText('Foo'), makeText('Bar'), makeText('Baz')]
          }
        ]
      })

      const pages = await doc.pages
      const outline = doc.getOutline?.() ?? []

      const expectedPages = await Promise.all(
        pages.map(async (page) => {
          const content = await page.getContent()
          const texts = extractTexts(content)
          const images = extractImages(content)
          return buildExpectedPageSummary(page, texts, images)
        })
      )

      const expected = {
        id: doc.id,
        title: doc.title,
        pageCount: expectedPages.length,
        hasOutline: outline.length > 0,
        pageNumbers: expectedPages.map((p) => p.number),
        coverAvailable: false,
        pages: expectedPages
      }

      const serializer = createProgressiveSerializer(doc)
      const actual = await serializer.resolve()
      expect(actual).toEqual(expected)
    })

    it('summarizes mixed text and image content without serializing image payloads', async () => {
      const doc = makeDocument({
        id: 'doc-mixed-content',
        title: 'Mixed Content Test',
        pages: [
          {
            id: 'p1',
            number: 1,
            width: 612,
            height: 792,
            content: [
              makeText('Hello'),
              makeImage(),
              makeText('World'),
              makeImage()
            ]
          }
        ]
      })

      const serializer = createProgressiveSerializer(doc)
      const result = await serializer.resolve()
      const json = JSON.stringify(result)

      expect(result.pages[0].textCount).toBe(2)
      expect(result.pages[0].imageCount).toBe(2)
      expect(result.pages[0].previewText).toHaveLength(2)
      expect(result.pages[0].previewText.map((text) => text.content)).toEqual([
        'Hello',
        'World'
      ])
      expect(json).not.toContain('data:image/png;base64,abc123')
    })

    it('handles undefined page from getPageByPageNumber', async () => {
      const doc: DemoSerializableDocument = {
        id: 'doc-8',
        title: 'Undefined Page Test',
        pageCount: 1,
        pageNumbers: [1],
        outline: [],
        getOutline: () => [],
        getPageByPageNumber: () => undefined,
        getPageSizeByPageNumber: () => ({ x: 100, y: 200 })
      }

      const serializer = createProgressiveSerializer(doc)
      const result = await serializer.resolve()

      expect(result.pages[0].textCount).toBe(0)
      expect(result.pages[0].imageCount).toBe(0)
      expect(result.pages[0].previewText).toEqual([])
    })

    it('rejects when getPageByPageNumber throws', async () => {
      const doc: DemoSerializableDocument = {
        id: 'doc-9',
        title: 'Throws Test',
        pageCount: 1,
        pageNumbers: [1],
        outline: [],
        getOutline: () => [],
        getPageByPageNumber: () => {
          return Promise.reject(new Error('getPageByPageNumber failed'))
        },
        getPageSizeByPageNumber: () => ({ x: 100, y: 200 })
      }

      const serializer = createProgressiveSerializer(doc)
      await expect(serializer.resolve()).rejects.toThrow(
        'getPageByPageNumber failed'
      )
    })

    it('coverAvailable is true when intermediate has cover', async () => {
      const page = new IntermediatePage({
        id: 'p1',
        width: 100,
        height: 200,
        number: 1,
        content: [],
        paragraphs: []
      })
      page.setGetThumbnail(
        async () =>
          new IntermediateImage({
            id: 'cover-thumb',
            src: 'data:image/png;base64,abc123',
            polygon: [
              [0, 0],
              [100, 0],
              [100, 200],
              [0, 200]
            ],
            opacity: 1
          })
      )

      const doc = new IntermediateDocument({
        id: 'doc-11',
        title: 'Cover Test',
        pagesMap: createSimplePagesMap([
          {
            id: 'p1',
            pageNumber: 1,
            size: { x: 100, y: 200 },
            getData: async () => page
          }
        ]),
        outline: []
      })

      const serializer = createProgressiveSerializer(doc)
      const result = await serializer.resolve()

      expect(result.coverAvailable).toBe(true)
    })
  })
})
