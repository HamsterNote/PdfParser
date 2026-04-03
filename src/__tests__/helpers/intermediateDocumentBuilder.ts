import {
  IntermediateDocument,
  IntermediatePage,
  IntermediatePageMap,
  IntermediateText,
  type TextDir
} from '../../__mocks__/@hamster-note/types'

const DEFAULT_TEXT_PROPS = {
  fontSize: 12,
  fontFamily: 'Arial',
  fontWeight: 400,
  italic: false,
  color: '#000000',
  width: 100,
  height: 20,
  lineHeight: 1.2,
  ascent: 10,
  descent: 3,
  vertical: false,
  dir: 'ltr' as TextDir,
  rotate: 0,
  skew: 0,
  isEOL: false
}

export function createText(
  id: string,
  content: string,
  _pageNumber: number,
  overrides: Partial<{
    x: number
    y: number
    fontSize: number
  }> = {}
): IntermediateText {
  return new IntermediateText({
    id,
    content,
    ...DEFAULT_TEXT_PROPS,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    ...overrides
  })
}

export function createSinglePageDocument(
  pageId: string = 'page-1',
  pageNumber: number = 1,
  pageWidth: number = 595,
  pageHeight: number = 842,
  texts: IntermediateText[] = []
): IntermediateDocument {
  const page = new IntermediatePage({
    id: pageId,
    texts,
    width: pageWidth,
    height: pageHeight,
    number: pageNumber,
    thumbnail: undefined,
    textsLoaded: true
  })

  const pagesMap = IntermediatePageMap.makeByInfoList([
    {
      id: pageId,
      pageNumber,
      size: { x: pageWidth, y: pageHeight },
      getData: async () => page
    }
  ])

  return new IntermediateDocument({
    id: 'test-doc-single-page',
    title: 'Single Page Document',
    pagesMap
  })
}

export function createMultiPageDocument(
  pageCount: number = 3,
  pageWidth: number = 595,
  pageHeight: number = 842,
  textsPerPage: IntermediateText[][] = []
): IntermediateDocument {
  const infoList = []

  for (let i = 1; i <= pageCount; i++) {
    const pageId = `page-${i}`
    const texts = textsPerPage[i - 1] ?? []

    const page = new IntermediatePage({
      id: pageId,
      texts,
      width: pageWidth,
      height: pageHeight,
      number: i,
      thumbnail: undefined,
      textsLoaded: true
    })

    infoList.push({
      id: pageId,
      pageNumber: i,
      size: { x: pageWidth, y: pageHeight },
      getData: async () => page
    })
  }

  const pagesMap = IntermediatePageMap.makeByInfoList(infoList)

  return new IntermediateDocument({
    id: 'test-doc-multi-page',
    title: 'Multi Page Document',
    pagesMap
  })
}

export function createEmptyDocument(): IntermediateDocument {
  const pagesMap = IntermediatePageMap.makeByInfoList([])

  return new IntermediateDocument({
    id: 'test-doc-empty',
    title: 'Empty Document',
    pagesMap
  })
}

export function createKeyText(
  content: string,
  pageNumber: number = 1
): IntermediateText {
  return createText(`page-${pageNumber}-text-key`, content, pageNumber, {
    x: 100,
    y: 100
  })
}

export function createDocumentWithPages(
  pages: Array<{
    pageNumber: number
    width: number
    height: number
    texts: IntermediateText[]
  }>
): IntermediateDocument {
  const infoList = pages.map((page) => {
    const intermediatePage = new IntermediatePage({
      id: `page-${page.pageNumber}`,
      texts: page.texts,
      width: page.width,
      height: page.height,
      number: page.pageNumber,
      thumbnail: undefined
    })

    return {
      id: intermediatePage.id,
      pageNumber: page.pageNumber,
      size: { x: page.width, y: page.height },
      getData: async () => intermediatePage
    }
  })

  return new IntermediateDocument({
    id: 'test-doc-with-pages',
    title: 'Test Document With Pages',
    pagesMap: IntermediatePageMap.makeByInfoList(infoList)
  })
}

export function normalizePageText(
  texts: IntermediateText[] | undefined
): string {
  return (texts?.map((text) => text.content).join('') ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
}
