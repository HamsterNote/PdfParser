import { describe, expect, it, jest } from '@jest/globals'

describe('Node direct import regression', () => {
  it('imports package entry without requiring preloaded pdfjs-dist globals', async () => {
    const globalScope = globalThis as Record<string, unknown>
    const previousDOMMatrix = globalScope.DOMMatrix
    const previousDOMMatrixReadOnly = globalScope.DOMMatrixReadOnly

    delete globalScope.DOMMatrix
    delete globalScope.DOMMatrixReadOnly
    jest.resetModules()

    try {
      await expect(import('../index')).resolves.toBeDefined()
      expect(globalScope.DOMMatrix).toBeDefined()
      expect(globalScope.DOMMatrixReadOnly).toBeDefined()
    } finally {
      if (typeof previousDOMMatrix === 'undefined') {
        delete globalScope.DOMMatrix
      } else {
        globalScope.DOMMatrix = previousDOMMatrix
      }

      if (typeof previousDOMMatrixReadOnly === 'undefined') {
        delete globalScope.DOMMatrixReadOnly
      } else {
        globalScope.DOMMatrixReadOnly = previousDOMMatrixReadOnly
      }
    }
  })
})
