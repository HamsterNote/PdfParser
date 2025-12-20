import { jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import type { IntermediateText } from '@typesCommon/HamsterDocument/IntermediateText'
import type { PageViewport } from 'pdfjs-dist'
import { Util } from 'pdfjs-dist'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

jest.mock(
  'pdfjs-dist',
  () => ({
    __esModule: true,
    Util: {
      transform: (m1: number[], m2: number[]) => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ]
    },
    getDocument: jest.fn(() => ({
      promise: Promise.reject(new Error('getDocument is mocked for tests'))
    }))
  }),
  { virtual: true }
)

describe('PdfParser mapTextContentToIntermediate', () => {
  const mapTextContentToIntermediate = (
    PdfParser as unknown as {
      mapTextContentToIntermediate: (
        textContent: TextContent,
        pdfId: string,
        pageNumber: number,
        viewport: Pick<PageViewport, 'height' | 'transform'>
      ) => IntermediateText[]
    }
  ).mapTextContentToIntermediate.bind(PdfParser)

  it('should flip y coordinate to top-left origin using viewport transform', () => {
    const viewport: Pick<PageViewport, 'height' | 'transform'> = {
      height: 400,
      transform: [1, 0, 0, -1, 0, 400]
    }
    const textItem: TextItem = {
      str: 'Hello',
      dir: 'ltr',
      transform: [10, 0, 0, -10, 50, 380],
      width: 30,
      height: 10,
      fontName: 'F1',
      hasEOL: true
    }
    const textContent: TextContent = {
      items: [textItem],
      styles: {
        F1: {
          ascent: 0.8,
          descent: 0.2,
          vertical: false,
          fontFamily: 'Helvetica'
        }
      },
      lang: 'en'
    }

    const result = mapTextContentToIntermediate(
      textContent,
      'pdf-1',
      1,
      viewport
    )
    const expectedMatrix = Util.transform(
      viewport.transform,
      textItem.transform
    )

    expect(result).toHaveLength(1)
    expect(result[0].x).toBeCloseTo(expectedMatrix[4])
    expect(result[0].y).toBeCloseTo(expectedMatrix[5])
    expect(result[0].y).not.toBeCloseTo(textItem.transform[5])
  })
})
