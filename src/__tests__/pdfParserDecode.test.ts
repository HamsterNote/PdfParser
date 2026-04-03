import { PdfParser } from '@PdfParser'
import {
  createSinglePageDocument,
  createMultiPageDocument,
  createEmptyDocument,
  createKeyText
} from './helpers/intermediateDocumentBuilder'

describe('PdfParser.decode', () => {
  describe('single page document decode', () => {
    it('should return ArrayBuffer for single page document', async () => {
      const document = createSinglePageDocument()
      const result = await PdfParser.decode(document)

      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })

  describe('multi-page document round-trip', () => {
    it('should preserve page count after decode then encode', async () => {
      const pageCount = 3
      const pageWidth = 595
      const pageHeight = 842
      const document = createMultiPageDocument(pageCount, pageWidth, pageHeight)

      const arrayBuffer = await PdfParser.decode(document)
      expect(arrayBuffer).toBeDefined()
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer)

      const decodedDocument = await PdfParser.encode(arrayBuffer)
      expect(decodedDocument.pageCount).toBe(pageCount)
    })

    it('should preserve page sizes after decode then encode', async () => {
      const pageWidth = 612
      const pageHeight = 792
      const document = createMultiPageDocument(2, pageWidth, pageHeight)

      const arrayBuffer = await PdfParser.decode(document)
      expect(arrayBuffer).toBeDefined()

      const decodedDocument = await PdfParser.encode(arrayBuffer)
      const size1 = decodedDocument.getPageSizeByPageNumber(1)
      const size2 = decodedDocument.getPageSizeByPageNumber(2)

      expect(size1?.x).toBeCloseTo(pageWidth, 0)
      expect(size1?.y).toBeCloseTo(pageHeight, 0)
      expect(size2?.x).toBeCloseTo(pageWidth, 0)
      expect(size2?.y).toBeCloseTo(pageHeight, 0)
    })
  })

  describe('text content round-trip', () => {
    it('should preserve key text content after decode then encode', async () => {
      const keyContent = 'ImportantContractTerms'
      const document = createSinglePageDocument('page-1', 1, 595, 842, [
        createKeyText(keyContent)
      ])

      const arrayBuffer = await PdfParser.decode(document)
      expect(arrayBuffer).toBeDefined()

      const decodedDocument = await PdfParser.encode(arrayBuffer)
      const page = await decodedDocument.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      expect(normalizedText).toContain(keyContent.toLowerCase())
    })
  })

  describe('empty document error handling', () => {
    it('should throw error when decoding empty document', async () => {
      const emptyDocument = createEmptyDocument()

      await expect(PdfParser.decode(emptyDocument)).rejects.toThrow()
    })

    it('should include cannot decode empty document in error message', async () => {
      const emptyDocument = createEmptyDocument()

      await expect(PdfParser.decode(emptyDocument)).rejects.toThrow(
        'cannot decode empty document'
      )
    })
  })
})
