import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy
} from 'pdfjs-dist/types/src/display/api'

type LoadedPdfSession = Readonly<{
  loadingTask: PDFDocumentLoadingTask
  pdf: PDFDocumentProxy
}>

export type LockedPdfDocumentProxy = Pick<
  PDFDocumentProxy,
  | 'numPages'
  | 'fingerprints'
  | 'getMetadata'
  | 'getPage'
  | 'getOutline'
  | 'getDestination'
  | 'getPageIndex'
>

export type LockedPdfSession = Readonly<{
  loadingTask: PDFDocumentLoadingTask
  pdf: LockedPdfDocumentProxy
}>

export type PdfSessionLoader = () => Promise<LoadedPdfSession>

const createLockedPdfDocumentProxy = (
  pdf: PDFDocumentProxy
): LockedPdfDocumentProxy => ({
  numPages: pdf.numPages,
  fingerprints: pdf.fingerprints,
  getMetadata: () => pdf.getMetadata(),
  getPage: (pageNumber) => pdf.getPage(pageNumber),
  getOutline: () => pdf.getOutline(),
  getDestination: (id) => pdf.getDestination(id),
  getPageIndex: (reference) => pdf.getPageIndex(reference)
})

export class PdfSessionOwner {
  private activeLeases = 0
  private readonly activeLeaseSet = new Set<LockedPdfSession>()
  private destroyAttempted = false
  private readonly destroyErrors: unknown[] = []
  private disposePromise: Promise<void> | undefined
  private readonly drainWaiters = new Set<() => void>()
  private lockedSession: LockedPdfSession | undefined
  private lastSession: LoadedPdfSession | undefined
  private loader: PdfSessionLoader | undefined
  private pendingAcquires = 0
  private sessionPromise: Promise<LockedPdfSession> | undefined
  private state: 'open' | 'closing' | 'disposed' = 'open'

  constructor(loader: PdfSessionLoader) {
    this.loader = loader
  }

  async acquire(): Promise<LockedPdfSession> {
    if (this.state === 'disposed') {
      throw new Error('document disposed')
    }
    if (this.state === 'closing') {
      throw new Error('document disposed')
    }

    if (this.lockedSession) {
      return this.createLeaseFromLockedSession(this.lockedSession)
    }

    this.pendingAcquires += 1
    let pendingFinished = false
    const finishPendingOnce = (): void => {
      if (pendingFinished) return
      pendingFinished = true
      this.pendingAcquires -= 1
      if (this.pendingAcquires < 0) {
        throw new Error('pending acquire count became negative')
      }
      this.notifyDrain()
    }

    try {
      const sessionPromise = this.sessionPromise ?? this.startLoading()
      const session = await sessionPromise
      finishPendingOnce()
      if (this.state !== 'open') {
        throw new Error('document disposed')
      }
      return this.createLeaseFromLockedSession(session)
    } finally {
      finishPendingOnce()
    }
  }

  release(lease: LockedPdfSession): void {
    if (!this.activeLeaseSet.delete(lease)) return
    this.activeLeases -= 1
    if (this.activeLeases < 0) {
      throw new Error('active lease count became negative')
    }
    this.notifyDrain()
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise
    this.state = 'closing'
    this.disposePromise = this.disposeOnce()
    return this.disposePromise
  }

  private startLoading(): Promise<LockedPdfSession> {
    const loader = this.loader
    if (!loader) {
      throw new Error('PDF session loader unavailable')
    }

    const attemptedPromise = Promise.resolve()
      .then(() => loader())
      .then((session) => {
        this.lastSession = session
        this.loader = undefined
        this.lockedSession = {
          loadingTask: session.loadingTask,
          pdf: createLockedPdfDocumentProxy(session.pdf)
        }
        return this.lockedSession
      })
      .catch((error: unknown) => {
        if (this.sessionPromise === attemptedPromise) {
          this.sessionPromise = undefined
        }
        throw error
      })
    this.sessionPromise = attemptedPromise
    return attemptedPromise
  }

  private createLeaseFromLockedSession(
    session: LockedPdfSession
  ): LockedPdfSession {
    const lease = {
      loadingTask: session.loadingTask,
      pdf: session.pdf
    }
    this.activeLeaseSet.add(lease)
    this.activeLeases += 1
    return lease
  }

  private async disposeOnce(): Promise<void> {
    try {
      await this.waitForDrain()
      if (this.lastSession && !this.destroyAttempted) {
        this.destroyAttempted = true
        try {
          await this.lastSession.loadingTask.destroy()
        } catch (error: unknown) {
          this.destroyErrors.push(error)
        }
      }
    } finally {
      this.state = 'disposed'
      this.notifyDrain()
    }
  }

  private waitForDrain(): Promise<void> {
    if (this.pendingAcquires === 0 && this.activeLeases === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.drainWaiters.add(resolve)
    })
  }

  private notifyDrain(): void {
    if (this.pendingAcquires !== 0 || this.activeLeases !== 0) return
    const waiters = [...this.drainWaiters]
    this.drainWaiters.clear()
    for (const resolve of waiters) resolve()
  }
}
