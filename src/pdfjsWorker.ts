import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist'

let cachedWorkerSrc: string | undefined

const getConfiguredWorkerSrc = (): string | undefined => {
  const workerSrc = GlobalWorkerOptions.workerSrc
  return typeof workerSrc === 'string' && workerSrc.length > 0
    ? workerSrc
    : undefined
}

const resolvePdfjsWorkerSrc = (): string => {
  if (typeof document !== 'undefined') {
    return new URL('./pdf.worker.min.mjs', import.meta.url).href
  }

  const workerPath = createRequire(import.meta.url).resolve(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
  )
  return pathToFileURL(workerPath).toString()
}

export function ensurePdfjsWorkerConfigured(): string {
  const configuredWorkerSrc = getConfiguredWorkerSrc()
  if (configuredWorkerSrc) {
    cachedWorkerSrc = configuredWorkerSrc
    return configuredWorkerSrc
  }

  if (cachedWorkerSrc) {
    GlobalWorkerOptions.workerSrc = cachedWorkerSrc
    return cachedWorkerSrc
  }

  cachedWorkerSrc = resolvePdfjsWorkerSrc()
  GlobalWorkerOptions.workerSrc = cachedWorkerSrc
  return cachedWorkerSrc
}
