import { GlobalWorkerOptions } from 'pdfjs-dist'

let cachedWorkerSrc: string | undefined

type ImportMetaWithResolve = ImportMeta & {
  resolve?: (specifier: string) => string
}

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

  const resolve = (import.meta as ImportMetaWithResolve).resolve
  if (typeof resolve === 'function') {
    return resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
  }

  throw new Error(
    'Unable to resolve pdfjs worker automatically. Please configure GlobalWorkerOptions.workerSrc before parsing.'
  )
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
