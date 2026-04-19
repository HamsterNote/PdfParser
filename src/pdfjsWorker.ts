let cachedWorkerSrc: string | undefined
let cachedStandardFontDataUrl: string | undefined

type ImportMetaWithResolve = ImportMeta & {
  resolve?: (specifier: string) => string
}

type PdfjsGlobalWorkerOptions = {
  workerSrc: string
}

const getConfiguredWorkerSrc = (
  globalWorkerOptions: PdfjsGlobalWorkerOptions
): string | undefined => {
  const workerSrc = globalWorkerOptions.workerSrc
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

const resolvePdfjsStandardFontDataUrl = (): string => {
  if (typeof document !== 'undefined') {
    return new URL('./standard_fonts/', import.meta.url).href
  }

  const resolve = (import.meta as ImportMetaWithResolve).resolve
  if (typeof resolve === 'function') {
    return new URL(
      './',
      resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf')
    ).toString()
  }

  throw new Error(
    'Unable to resolve pdfjs standard font data automatically. Please configure standardFontDataUrl before parsing.'
  )
}

export function ensurePdfjsWorkerConfigured(
  globalWorkerOptions: PdfjsGlobalWorkerOptions
): string {
  const configuredWorkerSrc = getConfiguredWorkerSrc(globalWorkerOptions)
  if (configuredWorkerSrc) {
    cachedWorkerSrc = configuredWorkerSrc
    return configuredWorkerSrc
  }

  if (cachedWorkerSrc) {
    globalWorkerOptions.workerSrc = cachedWorkerSrc
    return cachedWorkerSrc
  }

  cachedWorkerSrc = resolvePdfjsWorkerSrc()
  globalWorkerOptions.workerSrc = cachedWorkerSrc
  return cachedWorkerSrc
}

export function ensurePdfjsStandardFontDataUrlConfigured(): string {
  if (cachedStandardFontDataUrl) {
    return cachedStandardFontDataUrl
  }

  cachedStandardFontDataUrl = resolvePdfjsStandardFontDataUrl()
  return cachedStandardFontDataUrl
}
