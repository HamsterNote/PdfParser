import { describe, expect, it } from '@jest/globals'
import type { IntermediateDocument as ParserIntermediateDocument } from '@hamster-note/types'
import { PdfParser } from '@PdfParser'
import {
  createDocumentWithPages,
  createText,
  normalizePageText
} from './helpers/intermediateDocumentBuilder'

describe('PdfParser.decode integration', () => {
  it('round-trips a multi-page document with page sizes and key text preserved', async () => {
    const document = createDocumentWithPages([
      {
        pageNumber: 1,
        width: 612,
        height: 792,
        texts: [
          createText('page-1-text-1', 'Alpha & Beta #2026', 1, {
            x: 48,
            y: 72,
            fontSize: 16
          }),
          createText('page-1-text-2', 'Budget + Growth %', 1, {
            x: 48,
            y: 108,
            fontSize: 14
          })
        ]
      },
      {
        pageNumber: 2,
        width: 320,
        height: 480,
        texts: [
          createText('page-2-text-1', '第二页', 2, {
            x: 32,
            y: 44,
            fontSize: 18
          }),
          createText('page-2-text-2', 'Segment One', 2, {
            x: 32,
            y: 82,
            fontSize: 14
          }),
          createText('page-2-text-3', 'Segment Two RoundTrip', 2, {
            x: 32,
            y: 116,
            fontSize: 14
          })
        ]
      }
    ])

    const pdfBuffer = await PdfParser.decode(
      document as unknown as ParserIntermediateDocument
    )
    expect(pdfBuffer).toBeDefined()
    expect(pdfBuffer).toBeInstanceOf(ArrayBuffer)
    if (!(pdfBuffer instanceof ArrayBuffer)) {
      throw new Error('expected decode result to be an ArrayBuffer')
    }
    expect(pdfBuffer.byteLength).toBeGreaterThan(0)

    const reparsed = await PdfParser.encode(pdfBuffer)
    expect(reparsed).toBeDefined()
    if (!reparsed) {
      throw new Error('expected reparsed document to be defined')
    }

    expect(reparsed.pageCount).toBe(2)
    expectPageSizeWithinTolerance(reparsed, 1, { x: 612, y: 792 })
    expectPageSizeWithinTolerance(reparsed, 2, { x: 320, y: 480 })

    const firstPage = await reparsed.getPageByPageNumber(1)
    const secondPage = await reparsed.getPageByPageNumber(2)
    const normalizedFirstPageText = normalizePageText(firstPage?.texts)
    const normalizedSecondPageText = normalizePageText(secondPage?.texts)

    expect(normalizedFirstPageText).toContain('alpha&beta#2026')
    expect(normalizedFirstPageText).toContain('budget+growth%')
    expect(normalizedSecondPageText).toContain('segmentone')
    expect(normalizedSecondPageText).toContain('segmenttworoundtrip')
  })

  it('filters invalid text while the remaining content still round-trips', async () => {
    const blankText = createText('page-1-text-blank', '   ', 1, {
      x: 12,
      y: 18,
      fontSize: 12
    })
    const invalidXText = createText(
      'page-1-text-invalid-x',
      'InvalidXToken',
      1,
      {
        x: Number.NaN,
        y: 36,
        fontSize: 12
      }
    )
    const invalidYText = createText(
      'page-2-text-invalid-y',
      'InvalidYToken',
      2,
      {
        x: 16,
        y: Number.POSITIVE_INFINITY,
        fontSize: 12
      }
    )

    const document = createDocumentWithPages([
      {
        pageNumber: 1,
        width: 420,
        height: 595,
        texts: [
          blankText,
          invalidXText,
          createText('page-1-text-valid-1', 'Valid English + Symbol %', 1, {
            x: 24,
            y: 64,
            fontSize: 16
          })
        ]
      },
      {
        pageNumber: 2,
        width: 300,
        height: 500,
        texts: [
          invalidYText,
          createText('page-2-text-valid-1', '第二页 保留内容', 2, {
            x: 28,
            y: 52,
            fontSize: 18
          }),
          createText('page-2-text-valid-2', 'Retained Segment', 2, {
            x: 28,
            y: 88,
            fontSize: 14
          }),
          createText('page-2-text-valid-3', 'Tail Round Trip', 2, {
            x: 28,
            y: 120,
            fontSize: 14
          })
        ]
      }
    ])

    const pdfBuffer = await PdfParser.decode(
      document as unknown as ParserIntermediateDocument
    )
    expect(pdfBuffer).toBeDefined()
    expect(pdfBuffer).toBeInstanceOf(ArrayBuffer)
    if (!(pdfBuffer instanceof ArrayBuffer)) {
      throw new Error('expected decode result to be an ArrayBuffer')
    }
    expect(pdfBuffer.byteLength).toBeGreaterThan(0)

    const reparsed = await PdfParser.encode(pdfBuffer)
    expect(reparsed).toBeDefined()
    if (!reparsed) {
      throw new Error('expected reparsed document to be defined')
    }

    expect(reparsed.pageCount).toBe(2)
    expectPageSizeWithinTolerance(reparsed, 1, { x: 420, y: 595 })
    expectPageSizeWithinTolerance(reparsed, 2, { x: 300, y: 500 })

    const firstPage = await reparsed.getPageByPageNumber(1)
    const secondPage = await reparsed.getPageByPageNumber(2)
    const normalizedFirstPageText = normalizePageText(firstPage?.texts)
    const normalizedSecondPageText = normalizePageText(secondPage?.texts)

    expect(normalizedFirstPageText).toContain('validenglish+symbol%')
    expect(normalizedFirstPageText).not.toContain('invalidxtoken')
    expect(normalizedSecondPageText).toContain('retainedsegment')
    expect(normalizedSecondPageText).toContain('tailroundtrip')
    expect(normalizedSecondPageText).not.toContain('invalidytoken')
  })
})

function expectPageSizeWithinTolerance(
  document: {
    getPageSizeByPageNumber: (
      pageNumber: number
    ) => { x: number; y: number } | undefined
  },
  pageNumber: number,
  expectedSize: { x: number; y: number }
): void {
  const size = document.getPageSizeByPageNumber(pageNumber)

  expect(size).toBeDefined()
  expect(Math.abs((size?.x ?? 0) - expectedSize.x)).toBeLessThanOrEqual(1)
  expect(Math.abs((size?.y ?? 0) - expectedSize.y)).toBeLessThanOrEqual(1)
}
