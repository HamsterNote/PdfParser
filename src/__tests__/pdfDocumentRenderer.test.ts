import type { IntermediateDocument as RendererIntermediateDocument } from '@hamster-note/types'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import PDFDocument from 'pdfkit'
import { renderIntermediateDocumentToPdfBuffer } from '../services/pdfDocumentRenderer'
import {
  createDocumentWithPages,
  createSinglePageDocument,
  createText,
  normalizePageText
} from './helpers/intermediateDocumentBuilder'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('renderIntermediateDocumentToPdfBuffer', () => {
  it('renders pages in ascending order with page sizes and original text order', async () => {
    const document = createDocumentWithPages([
      {
        pageNumber: 2,
        width: 320,
        height: 480,
        texts: [
          createText('page-2-text-1', 'SecondPageToken', 2, {
            x: 30,
            y: 40,
            fontSize: 16
          })
        ]
      },
      {
        pageNumber: 1,
        width: 612,
        height: 792,
        texts: [
          createText('page-1-text-1', 'Alpha', 1, {
            x: 40,
            y: 60,
            fontSize: 14
          }),
          createText('page-1-text-2', 'Beta', 1, {
            x: 120,
            y: 60,
            fontSize: 14
          })
        ]
      }
    ])

    const pdfBuffer = await renderIntermediateDocumentToPdfBuffer(
      document as unknown as RendererIntermediateDocument
    )
    const decodedDocument = await PdfParser.encode(pdfBuffer)

    expect(decodedDocument).toBeDefined()
    if (!decodedDocument) {
      throw new Error('expected decoded document to be defined')
    }

    expect(decodedDocument.pageCount).toBe(2)
    expect(decodedDocument.getPageSizeByPageNumber(1)?.x).toBeCloseTo(612, 0)
    expect(decodedDocument.getPageSizeByPageNumber(1)?.y).toBeCloseTo(792, 0)
    expect(decodedDocument.getPageSizeByPageNumber(2)?.x).toBeCloseTo(320, 0)
    expect(decodedDocument.getPageSizeByPageNumber(2)?.y).toBeCloseTo(480, 0)

    const firstPage = await decodedDocument.getPageByPageNumber(1)
    const secondPage = await decodedDocument.getPageByPageNumber(2)
    const normalizedFirstPageText = normalizePageText(firstPage?.texts)
    const normalizedSecondPageText = normalizePageText(secondPage?.texts)

    expect(normalizedFirstPageText).toContain('alpha')
    expect(normalizedFirstPageText).toContain('beta')
    expect(normalizedFirstPageText.indexOf('alpha')).toBeLessThan(
      normalizedFirstPageText.indexOf('beta')
    )
    expect(normalizedSecondPageText).toContain('secondpagetoken')
  })

  it('skips invalid text', async () => {
    const blankText = createText('page-1-text-blank', '   ', 1, {
      x: 10,
      y: 20,
      fontSize: 12
    })
    const invalidXText = createText(
      'page-1-text-invalid-x',
      'InvalidXToken',
      1,
      {
        x: Number.NaN,
        y: 40,
        fontSize: 12
      }
    )
    const invalidYText = createText(
      'page-1-text-invalid-y',
      'InvalidYToken',
      1,
      {
        x: 20,
        y: Number.POSITIVE_INFINITY,
        fontSize: 12
      }
    )
    const fallbackText = createText(
      'page-1-text-fallback',
      'FallbackToken',
      1,
      {
        x: 30,
        y: 60,
        fontSize: 0
      }
    )
    fallbackText.height = 18
    fallbackText.lineHeight = 24

    const throwingText = createText('page-1-text-throwing', 'BoomToken', 1, {
      x: 30,
      y: 90,
      fontSize: 99
    })
    const trailingText = createText(
      'page-1-text-trailing',
      'TrailingValid',
      1,
      {
        x: 30,
        y: 120,
        fontSize: 16
      }
    )

    const document = createSinglePageDocument('page-1', 1, 420, 420, [
      blankText,
      invalidXText,
      invalidYText,
      fallbackText,
      throwingText,
      trailingText
    ])

    const seenFontSizes: number[] = []
    const originalFontSize = PDFDocument.prototype.fontSize
    jest.spyOn(PDFDocument.prototype, 'fontSize').mockImplementation(function (
      this: PDFKit.PDFDocument,
      ...args: unknown[]
    ) {
      const [size] = args

      if (typeof size !== 'number') {
        throw new Error('expected numeric font size')
      }

      if (size === 99) {
        throw new Error('intentional fontSize failure')
      }

      seenFontSizes.push(size)
      return originalFontSize.call(this, size)
    })

    const textSpy = jest.spyOn(PDFDocument.prototype, 'text')

    const pdfBuffer = await renderIntermediateDocumentToPdfBuffer(
      document as unknown as RendererIntermediateDocument
    )
    const decodedDocument = await PdfParser.encode(pdfBuffer)

    expect(pdfBuffer).toBeInstanceOf(ArrayBuffer)
    expect(decodedDocument).toBeDefined()
    if (!decodedDocument) {
      throw new Error('expected decoded document to be defined')
    }

    const renderedContents = textSpy.mock.calls.map((call) => String(call[0]))
    const page = await decodedDocument.getPageByPageNumber(1)
    const normalizedText = normalizePageText(page?.texts)

    expect(seenFontSizes).toContain(24)
    expect(renderedContents).not.toContain('   ')
    expect(renderedContents).not.toContain('InvalidXToken')
    expect(renderedContents).not.toContain('InvalidYToken')
    expect(renderedContents).not.toContain('BoomToken')
    expect(normalizedText).toContain('fallbacktoken')
    expect(normalizedText).toContain('trailingvalid')
    expect(normalizedText).not.toContain('invalidxtoken')
    expect(normalizedText).not.toContain('invalidytoken')
    expect(normalizedText).not.toContain('boomtoken')
  })
})
