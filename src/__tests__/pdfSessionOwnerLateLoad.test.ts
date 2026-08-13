import { describe, expect, it, jest } from '@jest/globals'
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy
} from 'pdfjs-dist/types/src/display/api'
import type { PdfSessionLoader } from '../pdfSessionOwner'
import { PdfSessionOwner } from '../pdfSessionOwner'

type LoadedSession = Awaited<ReturnType<PdfSessionLoader>>

describe('PdfSessionOwner late load cleanup', () => {
  it('destroys a session that resolves after the drain deadline', async () => {
    jest.useFakeTimers()
    try {
      let resolveSession = (_session: LoadedSession): void => undefined
      const sessionPromise = new Promise<LoadedSession>((resolve) => {
        resolveSession = resolve
      })
      const destroy = jest.fn(async (): Promise<void> => undefined)
      const session = {
        loadingTask: { destroy } as unknown as PDFDocumentLoadingTask,
        pdf: {
          numPages: 1,
          fingerprints: ['late-load', null],
          getMetadata: jest.fn(async () => ({})),
          getPage: jest.fn(async () => ({})),
          getOutline: jest.fn(async () => []),
          getDestination: jest.fn(async () => null),
          getPageIndex: jest.fn(async () => 0)
        } as unknown as PDFDocumentProxy
      }
      const owner = new PdfSessionOwner(() => sessionPromise)
      const acquisition = owner.acquire()
      const disposal = owner.dispose(10000)

      jest.advanceTimersByTime(9999)
      await Promise.resolve()
      expect(destroy).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
      resolveSession(session)

      await expect(acquisition).rejects.toThrow('document disposed')
      await expect(disposal).resolves.toBeUndefined()
      expect(destroy).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
})
