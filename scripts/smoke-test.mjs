// 1. 注入 DOMMatrix polyfill
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(_init) {}
  }
}

// 2. 动态导入 - 使用与 dist bundle 相同的导入方式
const { GlobalWorkerOptions } = await import('pdfjs-dist')
const { PdfParser } = await import('../dist/index.js')

// 3. 测试逻辑
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
