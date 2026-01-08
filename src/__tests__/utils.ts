import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { GlobalWorkerOptions } from 'pdfjs-dist'

/**
 * 在单元测试环境初始化 pdfjs-dist 的 worker 配置。
 * 直接指向 node_modules 中的构建产物，避免因未设置 workerSrc 而报错。
 */
export const setupPdfjsWorker = (): string => {
  // 兼容 ESM：自行计算 __dirname
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const workerSrcPath = path.resolve(
    __dirname,
    '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
  )
  const workerSrc = pathToFileURL(workerSrcPath).toString()

  GlobalWorkerOptions.workerSrc = workerSrc
  return workerSrc
}

/**
 * 在 Node.js 环境使用 pdfjs-dist 的 legacy build。
 * 这是为了避免 Node.js 环境中的 DOMMatrix 等浏览器 API 依赖问题。
 */
export const setupPdfjsWorkerLegacy = (): string => {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const workerSrcPath = path.resolve(
    __dirname,
    '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'
  )
  const workerSrc = pathToFileURL(workerSrcPath).toString()

  GlobalWorkerOptions.workerSrc = workerSrc
  return workerSrc
}

// 注意：不再自动执行 setupPdfjsWorker()
// 测试初始化由 test/setupTests.ts 统一调用 setupPdfjsWorkerLegacy() 完成
