import {
  IntermediateDocument,
  IntermediatePage,
  IntermediateText
} from '@hamster-note/types'
import {
  createProgressiveSerializer,
  serializeIntermediate
} from '../demoDocumentSerialization'

function makeDocument({ id, title, pages, outline = [] }) {
  const entries = pages.map((p) => ({
    id: p.id,
    pageNumber: p.number,
    size: { x: p.width, y: p.height },
    loader: async () => {
      const texts = (p.texts || []).map(
        (t) =>
          new IntermediateText({
            id: t.id,
            content: t.content,
            fontSize: t.fontSize ?? 12,
            fontFamily: t.fontFamily ?? 'Arial',
            fontWeight: t.fontWeight ?? 400,
            italic: t.italic ?? false,
            color: t.color ?? '#000',
            polygon: t.polygon ?? [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1]
            ],
            lineHeight: t.lineHeight ?? 1.2,
            ascent: t.ascent ?? 0.8,
            descent: t.descent ?? 0.2,
            dir: t.dir ?? 'ltr',
            skew: t.skew ?? 0,
            isEOL: t.isEOL ?? false
          })
      )
      return new IntermediatePage({
        id: p.id,
        width: p.width,
        height: p.height,
        number: p.number,
        texts,
        paragraphs: [],
        getTextsFn: async () => texts
      })
    }
  }))

  const pagesMap = {
    _entries: entries,
    get pageCount() {
      return this._entries.length
    },
    get pageNumbers() {
      return this._entries.map((e) => e.pageNumber).sort((a, b) => a - b)
    },
    getPageByPageNumber: function (n) {
      const e = this._entries.find((e) => e.pageNumber === n)
      return e ? e.loader() : undefined
    },
    getPageSizeByPageNumber: function (n) {
      const e = this._entries.find((e) => e.pageNumber === n)
      return e ? e.size : undefined
    },
    getPages: async function () {
      return Promise.all(this._entries.map((e) => e.loader()))
    }
  }

  return new IntermediateDocument({
    id,
    title,
    pagesMap,
    outline
  })
}

function _makeDocumentWithDeferredTexts({ id, title, pages, outline = [] }) {
  const entries = pages.map((p) => {
    const texts = (p.texts || []).map(
      (t) =>
        new IntermediateText({
          id: t.id,
          content: t.content,
          fontSize: t.fontSize ?? 12,
          fontFamily: t.fontFamily ?? 'Arial',
          fontWeight: t.fontWeight ?? 400,
          italic: t.italic ?? false,
          color: t.color ?? '#000',
          polygon: t.polygon ?? [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1]
          ],
          lineHeight: t.lineHeight ?? 1.2,
          ascent: t.ascent ?? 0.8,
          descent: t.descent ?? 0.2,
          dir: t.dir ?? 'ltr',
          skew: t.skew ?? 0,
          isEOL: t.isEOL ?? false
        })
    )
    return {
      id: p.id,
      pageNumber: p.number,
      size: { x: p.width, y: p.height },
      loader: async () => {
        const page = new IntermediatePage({
          id: p.id,
          width: p.width,
          height: p.height,
          number: p.number,
          texts: [],
          paragraphs: [],
          getTextsFn: async () => texts
        })
        page.textsLoaded = false
        return page
      }
    }
  })

  const pagesMap = {
    _entries: entries,
    get pageCount() {
      return this._entries.length
    },
    get pageNumbers() {
      return this._entries.map((e) => e.pageNumber).sort((a, b) => a - b)
    },
    getPageByPageNumber: function (n) {
      const e = this._entries.find((e) => e.pageNumber === n)
      return e ? e.loader() : undefined
    },
    getPageSizeByPageNumber: function (n) {
      const e = this._entries.find((e) => e.pageNumber === n)
      return e ? e.size : undefined
    },
    getPages: async function () {
      return Promise.all(this._entries.map((e) => e.loader()))
    }
  }

  return new IntermediateDocument({
    id,
    title,
    pagesMap,
    outline
  })
}

let _textIdCounter = 0
function makeText(content) {
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
    dir: 'ltr',
    skew: 0,
    isEOL: false
  }
}

function pageSummaryEquals(a, b) {
  return (
    a.number === b.number &&
    a.width === b.width &&
    a.height === b.height &&
    a.textCount === b.textCount &&
    JSON.stringify(a.previewText) === JSON.stringify(b.previewText)
  )
}

function docEquals(a, b) {
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

function buildExpectedPageSummary(page, texts) {
  return {
    number: page.number,
    width: page.width,
    height: page.height,
    textCount: texts.length,
    previewText: texts.map((text) => ({
      content: text.content,
      fontSize: text.fontSize,
      fontFamily: text.fontFamily,
      color: text.color,
      polygon: text.polygon
    }))
  }
}

function findEntryByPageNumber(
  entries: Array<{
    pageNumber: number
    loader: () => Promise<IntermediatePage>
    size: { x: number; y: number }
  }>,
  pageNumber: number
) {
  return entries.find((e) => e.pageNumber === pageNumber)
}

function createPagesMap(pages: IntermediatePage[]) {
  const entries = pages.map((p) => ({
    id: p.id,
    pageNumber: p.number,
    size: { x: p.width, y: p.height },
    loader: async () => p
  }))

  return {
    _entries: entries,
    get pageCount() {
      return entries.length
    },
    get pageNumbers() {
      return entries.map((e) => e.pageNumber).sort((a, b) => a - b)
    },
    getPageByPageNumber: function (n) {
      const e = findEntryByPageNumber(entries, n)
      return e ? e.loader() : undefined
    },
    getPageSizeByPageNumber: function (n) {
      const e = findEntryByPageNumber(entries, n)
      return e ? e.size : undefined
    },
    getPages: async function () {
      return pages
    }
  }
}

function createPagesWithDelayedTexts(
  pages: IntermediatePage[],
  delayMs: number
) {
  pages.forEach((page) => {
    page.textsLoaded = false
    page.setGetTexts(createDelayedTextGetter(page, delayMs))
  })
  return pages
}

function createDelayedTextGetter(page: IntermediatePage, delayMs: number) {
  return async () => {
    await new Promise((r) => setTimeout(r, delayMs))
    return Array.from(page.texts)
  }
}

function createSimplePagesMap(
  entries: Array<{
    id: string
    pageNumber: number
    size: { x: number; y: number }
    loader: () => Promise<IntermediatePage>
  }>
) {
  return {
    _entries: entries,
    get pageCount() {
      return entries.length
    },
    get pageNumbers() {
      return entries.map((e) => e.pageNumber).sort((a, b) => a - b)
    },
    getPageByPageNumber: function (n) {
      const e = entries.find((e) => e.pageNumber === n)
      return e ? e.loader() : undefined
    },
    getPageSizeByPageNumber: function (n) {
      const e = entries.find((e) => e.pageNumber === n)
      return e ? e.size : undefined
    },
    getPages: async function () {
      return []
    }
  }
}

describe('demoDocumentSerialization', () => {
  describe('createProgressiveSerializer', () => {
    it('shell is available immediately before any page text resolution', async () => {
      const doc = makeDocument({
        id: 'doc-1',
        title: 'Test Doc',
        pages: [
          { id: 'p1', number: 1, width: 100, height: 200, texts: [] },
          { id: 'p2', number: 2, width: 100, height: 200, texts: [] }
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
      expect(shell.pages[0].previewText).toEqual([])
      expect(shell.pages[1].number).toBe(2)
      expect(shell.pages[1].textCount).toBe(0)
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
            texts: [makeText('Hello'), makeText('World')]
          },
          {
            id: 'p2',
            number: 2,
            width: 612,
            height: 792,
            texts: [makeText('Foo'), makeText('Bar'), makeText('Baz')]
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
            texts: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p2',
            width: 100,
            height: 100,
            number: 2,
            texts: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p3',
            width: 100,
            height: 100,
            number: 3,
            texts: [],
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
            texts: [makeText('Hello')]
          },
          {
            id: 'p2',
            number: 2,
            width: 612,
            height: 792,
            texts: [makeText('World')]
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

    it('does not use Promise.all for page text resolution', async () => {
      const pages = createPagesWithDelayedTexts(
        [
          new IntermediatePage({
            id: 'p1',
            width: 100,
            height: 100,
            number: 1,
            texts: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p2',
            width: 100,
            height: 100,
            number: 2,
            texts: [],
            paragraphs: []
          }),
          new IntermediatePage({
            id: 'p3',
            width: 100,
            height: 100,
            number: 3,
            texts: [],
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

    it('re-accessing resolved pages does not re-call getTexts', async () => {
      const doc = makeDocument({
        id: 'doc-6',
        title: 'Cache Test',
        pages: [
          {
            id: 'p1',
            number: 1,
            width: 100,
            height: 100,
            texts: [makeText('Cached')]
          }
        ]
      })

      const pages = await doc.pages
      let getTextsCalls = 0
      pages[0].getTexts = async () => {
        getTextsCalls++
        return pages[0].texts
      }

      const serializer = createProgressiveSerializer(doc)
      await serializer.resolve()

      const callsBefore = getTextsCalls
      await serializer.resolve()
      const callsAfter = getTextsCalls

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
            texts: [makeText('Hello'), makeText('World')]
          },
          {
            id: 'p2',
            number: 2,
            width: 612,
            height: 792,
            texts: [makeText('Foo'), makeText('Bar'), makeText('Baz')]
          }
        ]
      })

      const pages = await doc.pages
      const outline = doc.getOutline?.() ?? []

      const expectedPages = await Promise.all(
        pages.map(async (page) => {
          const texts = Array.isArray(page.texts)
            ? page.texts
            : await page.getTexts()
          return buildExpectedPageSummary(page, texts)
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

    it('handles undefined page from getPageByPageNumber', async () => {
      const doc = new IntermediateDocument({
        id: 'doc-8',
        title: 'Undefined Page Test',
        pagesMap: {
          _entries: [],
          get pageCount() {
            return 1
          },
          get pageNumbers() {
            return [1]
          },
          getPageByPageNumber: () => undefined,
          getPageSizeByPageNumber: () => ({ x: 100, y: 200 }),
          getPages: async () => []
        },
        outline: []
      })

      const serializer = createProgressiveSerializer(doc)
      const result = await serializer.resolve()

      expect(result.pages[0].textCount).toBe(0)
      expect(result.pages[0].previewText).toEqual([])
    })

    it('rejects when getPageByPageNumber throws', async () => {
      const doc = new IntermediateDocument({
        id: 'doc-9',
        title: 'Throws Test',
        pagesMap: {
          _entries: [],
          get pageCount() {
            return 1
          },
          get pageNumbers() {
            return [1]
          },
          getPageByPageNumber: () => {
            return Promise.reject(new Error('getPageByPageNumber failed'))
          },
          getPageSizeByPageNumber: () => ({ x: 100, y: 200 }),
          getPages: async () => []
        },
        outline: []
      })

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
        texts: [],
        paragraphs: []
      })
      page.setGetThumbnail(async () => 'data:image/png;base64,abc123')

      const doc = new IntermediateDocument({
        id: 'doc-11',
        title: 'Cover Test',
        pagesMap: createSimplePagesMap([
          {
            id: 'p1',
            pageNumber: 1,
            size: { x: 100, y: 200 },
            loader: async () => page
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
