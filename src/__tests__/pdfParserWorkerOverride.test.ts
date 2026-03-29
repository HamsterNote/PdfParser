import { describe, expect, it } from '@jest/globals'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import { PdfParser } from '@PdfParser'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const loadTestPdf = async (): Promise<ArrayBuffer> => {
  const pdfPath = path.resolve(__dirname, 'test_github.pdf')
  const buffer = await readFile(pdfPath)
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
}

describe('PdfParser worker override regression tests', () => {
  describe('auto initializes when workerSrc is empty', () => {
    it('should auto-initialize worker and parse PDF without manual setup', async () => {
      // Reset workerSrc to empty string before test
      GlobalWorkerOptions.workerSrc = ''

      const pdfBuffer = await loadTestPdf()

      // PdfParser.encode() should work without manual worker setup
      const document = await PdfParser.encode(pdfBuffer)

      expect(document).toBeDefined()
      expect(document).not.toBeNull()
      expect(document?.id).toBeDefined()
      expect(document?.pageCount).toBe(4)
    }, 30000)
  })

  describe('preserves custom workerSrc during parsing', () => {
    it('should not override custom workerSrc when parsing', async () => {
      const customWorkerSrc = 'https://example.com/custom-worker.mjs'
      GlobalWorkerOptions.workerSrc = customWorkerSrc

      const pdfBuffer = await loadTestPdf()

      // Parse should succeed while preserving custom workerSrc
      const document = await PdfParser.encode(pdfBuffer)

      expect(document).toBeDefined()
      expect(document?.pageCount).toBe(4)

      // Verify custom workerSrc was NOT overridden
      expect(GlobalWorkerOptions.workerSrc).toBe(customWorkerSrc)
    }, 30000)
  })
})
