import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const browserWorkerSrc = new URL('../pdf.worker.min.mjs', import.meta.url).href
const nodeWorkerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
  )
).toString()

const resetDocument = (): void => {
  delete (globalThis as { document?: unknown }).document
}

const setDocument = (value: object): void => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    enumerable: true,
    writable: true,
    value
  })
}

const loadEnsurePdfjsWorkerConfigured = async (): Promise<{
  ensurePdfjsWorkerConfigured: typeof import('../pdfjsWorker').ensurePdfjsWorkerConfigured
  GlobalWorkerOptions: typeof import('pdfjs-dist').GlobalWorkerOptions
}> => {
  jest.resetModules()
  const [{ ensurePdfjsWorkerConfigured }, { GlobalWorkerOptions }] =
    await Promise.all([import('../pdfjsWorker'), import('pdfjs-dist')])

  return {
    ensurePdfjsWorkerConfigured,
    GlobalWorkerOptions
  }
}

beforeEach(() => {
  resetDocument()
})

describe('ensurePdfjsWorkerConfigured', () => {
  it('returns browser worker path in browser environment', async () => {
    setDocument({})

    const { ensurePdfjsWorkerConfigured, GlobalWorkerOptions } =
      await loadEnsurePdfjsWorkerConfigured()
    GlobalWorkerOptions.workerSrc = ''

    expect(ensurePdfjsWorkerConfigured()).toBe(browserWorkerSrc)
    expect(GlobalWorkerOptions.workerSrc).toBe(browserWorkerSrc)
  })

  it('returns Node legacy worker path in Node environment', async () => {
    const { ensurePdfjsWorkerConfigured, GlobalWorkerOptions } =
      await loadEnsurePdfjsWorkerConfigured()
    GlobalWorkerOptions.workerSrc = ''

    expect(ensurePdfjsWorkerConfigured()).toBe(nodeWorkerSrc)
    expect(GlobalWorkerOptions.workerSrc).toBe(nodeWorkerSrc)
  })

  it('preserves preconfigured workerSrc', async () => {
    const preconfiguredWorkerSrc = 'https://example.com/custom-worker.mjs'

    const { ensurePdfjsWorkerConfigured, GlobalWorkerOptions } =
      await loadEnsurePdfjsWorkerConfigured()
    GlobalWorkerOptions.workerSrc = preconfiguredWorkerSrc

    expect(ensurePdfjsWorkerConfigured()).toBe(preconfiguredWorkerSrc)
    expect(GlobalWorkerOptions.workerSrc).toBe(preconfiguredWorkerSrc)
  })

  it('is idempotent on multiple calls', async () => {
    const { ensurePdfjsWorkerConfigured, GlobalWorkerOptions } =
      await loadEnsurePdfjsWorkerConfigured()
    GlobalWorkerOptions.workerSrc = ''

    const firstWorkerSrc = ensurePdfjsWorkerConfigured()
    const secondWorkerSrc = ensurePdfjsWorkerConfigured()

    expect(secondWorkerSrc).toBe(firstWorkerSrc)
    expect(GlobalWorkerOptions.workerSrc).toBe(firstWorkerSrc)
  })
})
