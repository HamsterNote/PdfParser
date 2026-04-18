// 1. 直接导入 dist entry，验证无需预先导入 pdfjs-dist/DOMMatrix
const { PdfParser } = await import('../dist/index.js')
const { GlobalWorkerOptions } = await import('pdfjs-dist')

// 2. 测试逻辑
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pdfPath = path.resolve(__dirname, '../src/__tests__/test_github.pdf')
const fileBuffer = await readFile(pdfPath)
const arrayBuffer = fileBuffer.buffer.slice(
  fileBuffer.byteOffset,
  fileBuffer.byteOffset + fileBuffer.byteLength
)

// 清空 workerSrc
GlobalWorkerOptions.workerSrc = ''

// 调用 PdfParser.encode()，应该自动设置 workerSrc
await PdfParser.encode(arrayBuffer)

// 验证
if (
  !GlobalWorkerOptions.workerSrc ||
  !GlobalWorkerOptions.workerSrc.includes('pdf.worker.min.mjs')
) {
  throw new Error('workerSrc was not auto-filled')
}

console.log('SUCCESS: workerSrc auto-filled to:', GlobalWorkerOptions.workerSrc)
