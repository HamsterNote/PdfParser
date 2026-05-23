import { beforeEach, describe, expect, it, jest } from '@jest/globals'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function flushMicrotasks() {
  return Promise.resolve()
}

async function flushTicks(count = 4) {
  for (let index = 0; index < count; index += 1) {
    await flushMicrotasks()
  }
}

type Snapshot = { id: string; pages: Array<{ textCount: number }> }
type DemoDiagnosticsState = {
  lastEncode: {
    totals?: Record<string, unknown>
    pageDiagnostics?: Record<string, unknown>[]
    coverDiagnostic?: Record<string, unknown>
  }
}
type DemoWindowMock = {
  __pdfParserDemoDiagnostics?: DemoDiagnosticsState
  addEventListener: jest.Mock
}
type SerializerOptions = {
  onDiagnostic?: (event: Record<string, unknown>) => void
  onProgress?: (event: Record<string, unknown>) => void
}

function createElementMock() {
  const listeners = new Map<string, (event?: unknown) => void>()
  return {
    textContent: '',
    innerHTML: '',
    disabled: false,
    hidden: false,
    checked: true,
    dataset: {} as Record<string, string>,
    classList: {
      toggle: jest.fn()
    },
    addEventListener: jest.fn(
      (name: string, handler: (event?: unknown) => void) => {
        listeners.set(name, handler)
      }
    ),
    trigger(name: string, event?: unknown) {
      const handler = listeners.get(name)
      if (handler) {
        handler(event)
      }
    }
  }
}

async function setupDemo() {
  jest.resetModules()

  const loadSampleButton = createElementMock()
  const fileInput = createElementMock()
  const encodeButton = createElementMock()
  const decodeButton = createElementMock()
  const jsonOutputToggle = createElementMock()
  const statusElement = createElementMock()
  const errorElement = createElementMock()
  const jsonOutputCardElement = createElementMock()
  const outputElement = createElementMock()
  const previewElement = createElementMock()
  const previewNoteElement = createElementMock()
  const summaryElement = createElementMock()
  const diagnosticsElement = createElementMock()
  const decodeStatusElement = createElementMock()
  const decodePreviewElement = createElementMock()
  const decodePreviewNoteElement = createElementMock()

  const queryMap = new Map<string, unknown>([
    ['[data-role="status"]', statusElement],
    ['[data-role="error"]', errorElement],
    ['[data-role="json-output-card"]', jsonOutputCardElement],
    ['[data-role="output"]', outputElement],
    ['[data-role="preview"]', previewElement],
    ['[data-role="preview-note"]', previewNoteElement],
    ['[data-role="summary"] .summary-content', summaryElement],
    ['[data-role="diagnostics"] .diagnostics-content', diagnosticsElement],
    ['[data-role="decode-status"]', decodeStatusElement],
    ['[data-role="decode-preview"]', decodePreviewElement],
    ['[data-role="decode-preview-note"]', decodePreviewNoteElement]
  ])

  const renderData = jest.fn<(data: unknown) => void>()
  const updateData = jest.fn<(data: unknown) => void>()
  const renderMessage = jest.fn<(message: string) => void>()

  const encodeMock =
    jest.fn<
      (
        buffer?: unknown,
        options?: unknown,
        onProgress?: (event: Record<string, unknown>) => void
      ) => Promise<unknown>
    >()
  const configureDecodeFontMock = jest.fn()

  const serializerFactoryMock = jest.fn<
    (
      intermediate?: unknown,
      options?: SerializerOptions
    ) => {
      shell: unknown
      onUpdate: (callback: (snapshot: Snapshot) => void) => void
      resolve: () => Promise<unknown>
    }
  >()
  const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {})
  const consoleTable = jest.spyOn(console, 'table').mockImplementation(() => {})

  ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: true
  }))
  ;(globalThis as unknown as { URL: unknown }).URL = {
    createObjectURL: jest.fn(() => 'blob:preview'),
    revokeObjectURL: jest.fn()
  }

  const documentMock = {
    getElementById: jest.fn((id: string) => {
      if (id === 'demo-load-sample') return loadSampleButton
      if (id === 'pdf-file-input') return fileInput
      if (id === 'encode-button') return encodeButton
      if (id === 'decode-button') return decodeButton
      if (id === 'json-output-toggle') return jsonOutputToggle
      return null
    }),
    querySelector: jest.fn(
      (selector: string) => queryMap.get(selector) ?? null
    ),
    createElement: jest.fn(() => ({ textContent: '', innerHTML: '' }))
  }

  ;(globalThis as unknown as { document: unknown }).document = documentMock
  const windowMock: DemoWindowMock = {
    __pdfParserDemoDiagnostics: undefined,
    addEventListener: jest.fn()
  }
  ;(globalThis as unknown as { window: unknown }).window = windowMock

  await jest.unstable_mockModule('../demoDocumentSerialization.js', () => ({
    createProgressiveSerializer: serializerFactoryMock
  }))

  await jest.unstable_mockModule('../demoJsonView.js', () => ({
    createJsonOutputRenderer: () => ({
      renderData,
      updateData,
      renderMessage,
      dispose: jest.fn()
    })
  }))

  await jest.unstable_mockModule('../demoPreview.js', () => ({
    renderPreviewFrame: jest.fn(),
    setPreviewMessage: jest.fn()
  }))

  const browserModule = await import('../../dist/browser.js')
  ;(browserModule.PdfParser as unknown as { encode: unknown }).encode =
    encodeMock
  ;(browserModule.PdfParser as unknown as { decode: unknown }).decode =
    jest.fn()
  ;(
    browserModule.PdfParser as unknown as { configureDecodeFont: unknown }
  ).configureDecodeFont = configureDecodeFontMock

  await import('../demo.js')

  const testFile = new File([new Uint8Array([1, 2, 3])], 'demo.pdf', {
    type: 'application/pdf'
  })
  fileInput.trigger('change', { target: { files: [testFile] } })

  return {
    encodeButton,
    jsonOutputToggle,
    jsonOutputCardElement,
    statusElement,
    errorElement,
    summaryElement,
    diagnosticsElement,
    decodeButton,
    renderData,
    updateData,
    renderMessage,
    encodeMock,
    serializerFactoryMock,
    windowMock,
    consoleInfo,
    consoleTable
  }
}

describe('demo handleEncode progressive behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders shell immediately and updates progressively', async () => {
    const env = await setupDemo()

    const intermediate = { id: 'doc-1', title: 'Doc 1' }
    const shell = {
      id: 'doc-1',
      title: 'Doc 1',
      pageCount: 2,
      hasOutline: false,
      pageNumbers: [1, 2],
      coverAvailable: false,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        },
        {
          number: 2,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        }
      ]
    }
    const progressiveSnapshot = {
      ...shell,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 1,
          imageCount: 0,
          previewText: []
        },
        {
          number: 2,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        }
      ]
    }
    const finalSnapshot = {
      ...shell,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 1,
          imageCount: 0,
          previewText: []
        },
        {
          number: 2,
          width: 100,
          height: 100,
          textCount: 2,
          imageCount: 0,
          previewText: []
        }
      ]
    }

    const resolveDeferred = createDeferred<typeof finalSnapshot>()
    let onUpdateHandler: ((snapshot: Snapshot) => void) | null = null
    env.serializerFactoryMock.mockReturnValue({
      shell,
      onUpdate: (cb: (snapshot: Snapshot) => void) => {
        onUpdateHandler = cb
      },
      resolve: () => resolveDeferred.promise
    })
    env.encodeMock.mockResolvedValue(intermediate)

    env.encodeButton.trigger('click')
    await flushTicks()

    expect(env.renderData).toHaveBeenCalledWith(shell)
    expect(env.summaryElement.innerHTML).toContain(
      '<strong>Page Count:</strong> 2'
    )
    expect(env.decodeButton.disabled).toBe(true)
    ;(onUpdateHandler as unknown as (snapshot: Snapshot) => void)(
      progressiveSnapshot
    )
    expect(env.updateData).toHaveBeenCalledWith(progressiveSnapshot)

    resolveDeferred.resolve(finalSnapshot)
    await flushTicks()

    expect(env.updateData).toHaveBeenCalledWith(finalSnapshot)
    expect(env.statusElement.textContent).toBe('Encode ready')
    expect(env.decodeButton.disabled).toBe(false)
    expect(env.diagnosticsElement.innerHTML).toContain(
      '<strong>Complete → Ready:</strong>'
    )
    expect(env.diagnosticsElement.innerHTML).toContain(
      'window.__pdfParserDemoDiagnostics.lastEncode'
    )
    expect(
      env.windowMock.__pdfParserDemoDiagnostics?.lastEncode.totals
    ).toEqual(
      expect.objectContaining({
        serializerResolveMs: expect.any(Number),
        totalEncodeFlowMs: expect.any(Number)
      })
    )
    expect(env.consoleInfo).toHaveBeenCalled()
  })

  it('skips JSON rendering while toggle is unchecked and restores latest snapshot when re-enabled', async () => {
    const env = await setupDemo()

    const shell = {
      id: 'doc-1',
      title: 'Doc 1',
      pageCount: 1,
      hasOutline: false,
      pageNumbers: [1],
      coverAvailable: false,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        }
      ]
    }
    const finalSnapshot = {
      ...shell,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 2,
          imageCount: 0,
          previewText: []
        }
      ]
    }

    env.serializerFactoryMock.mockReturnValue({
      shell,
      onUpdate: jest.fn(),
      resolve: async () => finalSnapshot
    })
    env.encodeMock.mockResolvedValue({ id: 'intermediate-1' })

    env.jsonOutputToggle.checked = false
    env.jsonOutputToggle.trigger('change')

    expect(env.jsonOutputCardElement.hidden).toBe(true)

    env.encodeButton.trigger('click')
    await flushTicks()

    expect(env.renderMessage).not.toHaveBeenCalledWith('Working...')
    expect(env.renderData).not.toHaveBeenCalledWith(shell)
    expect(env.updateData).not.toHaveBeenCalledWith(finalSnapshot)

    env.jsonOutputToggle.checked = true
    env.jsonOutputToggle.trigger('change')

    expect(env.jsonOutputCardElement.hidden).toBe(false)
    expect(env.renderData).toHaveBeenLastCalledWith(finalSnapshot)
  })

  it('passes serializer page and cover diagnostics into window state', async () => {
    const env = await setupDemo()

    const intermediate = { id: 'doc-diag', title: 'Doc Diag' }
    const shell = {
      id: 'doc-diag',
      title: 'Doc Diag',
      pageCount: 1,
      hasOutline: false,
      pageNumbers: [1],
      coverAvailable: false,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        }
      ]
    }
    const finalSnapshot = {
      ...shell,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 2,
          imageCount: 0,
          previewText: []
        }
      ]
    }

    let serializerOptions: SerializerOptions | undefined
    env.serializerFactoryMock.mockImplementation((_, options) => {
      serializerOptions = options
      return {
        shell,
        onUpdate: jest.fn(),
        resolve: async () => finalSnapshot
      }
    })
    env.encodeMock.mockImplementation(async (_buffer, _options, onProgress) => {
      onProgress?.({ stage: 'encode:start', current: 0, total: 1 })
      onProgress?.({ stage: 'encode:complete', current: 1, total: 1 })
      return intermediate
    })

    env.encodeButton.trigger('click')
    await flushTicks()

    serializerOptions?.onDiagnostic?.({
      type: 'page',
      pageNumber: 1,
      totalDurationMs: 12,
      resolvePageMs: 4,
      resolveTextsMs: 7,
      buildSummaryMs: 1,
      textCount: 2,
      imageCount: 1,
      missing: false
    })
    serializerOptions?.onDiagnostic?.({
      type: 'cover',
      available: true,
      durationMs: 3,
      skipped: false
    })
    await flushTicks()

    expect(
      env.windowMock.__pdfParserDemoDiagnostics?.lastEncode.pageDiagnostics
    ).toEqual([
      expect.objectContaining({
        pageNumber: 1,
        resolveTextsMs: 7,
        textCount: 2,
        imageCount: 1
      })
    ])
    expect(
      env.windowMock.__pdfParserDemoDiagnostics?.lastEncode.coverDiagnostic
    ).toEqual(
      expect.objectContaining({
        available: true,
        durationMs: 3,
        skipped: false
      })
    )
    expect(env.diagnosticsElement.innerHTML).toContain(
      '<strong>Hotspot:</strong>'
    )
  })

  it('surfaces post-encode serializer progress in the main Demo status', async () => {
    const env = await setupDemo()

    const intermediate = { id: 'doc-progress', title: 'Doc Progress' }
    const shell = {
      id: 'doc-progress',
      title: 'Doc Progress',
      pageCount: 2,
      hasOutline: false,
      pageNumbers: [1, 2],
      coverAvailable: false,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        },
        {
          number: 2,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        }
      ]
    }
    const finalSnapshot = {
      ...shell,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 1,
          imageCount: 0,
          previewText: []
        },
        {
          number: 2,
          width: 100,
          height: 100,
          textCount: 1,
          imageCount: 0,
          previewText: []
        }
      ]
    }

    const resolveDeferred = createDeferred<typeof finalSnapshot>()
    let serializerOptions: SerializerOptions | undefined

    env.serializerFactoryMock.mockImplementation((_, options) => {
      serializerOptions = options
      return {
        shell,
        onUpdate: jest.fn(),
        resolve: () => resolveDeferred.promise
      }
    })
    env.encodeMock.mockImplementation(async (_buffer, _options, onProgress) => {
      onProgress?.({ stage: 'encode:start', current: 0, total: 2 })
      onProgress?.({ stage: 'encode:complete', current: 2, total: 2 })
      return intermediate
    })

    env.encodeButton.trigger('click')
    await flushTicks()

    serializerOptions?.onProgress?.({
      stage: 'serialize:start',
      current: 0,
      total: 3,
      pageCount: 2
    })
    expect(env.statusElement.textContent).toContain('Finalizing Demo output')

    serializerOptions?.onProgress?.({
      stage: 'serialize:page',
      current: 1,
      total: 3,
      pageNumber: 1,
      pageCount: 2
    })
    expect(env.statusElement.textContent).toContain('Summarized page 1')

    serializerOptions?.onProgress?.({
      stage: 'serialize:cover',
      current: 2,
      total: 3,
      available: true,
      pageCount: 2
    })
    expect(env.statusElement.textContent).toContain(
      'Checked cover availability'
    )

    resolveDeferred.resolve(finalSnapshot)
    await flushTicks()

    expect(env.statusElement.textContent).toBe('Encode ready')
  })

  it('ignores stale serializer updates from older encode runs', async () => {
    const env = await setupDemo()

    const intermediate1 = { id: 'doc-old', title: 'Old' }
    const intermediate2 = { id: 'doc-new', title: 'New' }

    const oldShell = {
      id: 'doc-old',
      title: 'Old',
      pageCount: 1,
      hasOutline: false,
      pageNumbers: [1],
      coverAvailable: false,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        }
      ]
    }
    const newShell = {
      id: 'doc-new',
      title: 'New',
      pageCount: 1,
      hasOutline: false,
      pageNumbers: [1],
      coverAvailable: false,
      pages: [
        {
          number: 1,
          width: 100,
          height: 100,
          textCount: 0,
          imageCount: 0,
          previewText: []
        }
      ]
    }

    const oldDeferred = createDeferred<Snapshot>()
    const newDeferred = createDeferred<Snapshot>()

    let oldUpdate: ((snapshot: Snapshot) => void) | null = null
    let newUpdate: ((snapshot: Snapshot) => void) | null = null

    env.encodeMock
      .mockResolvedValueOnce(intermediate1)
      .mockResolvedValueOnce(intermediate2)

    env.serializerFactoryMock
      .mockReturnValueOnce({
        shell: oldShell,
        onUpdate: (cb: (snapshot: Snapshot) => void) => {
          oldUpdate = cb
        },
        resolve: () => oldDeferred.promise
      })
      .mockReturnValueOnce({
        shell: newShell,
        onUpdate: (cb: (snapshot: Snapshot) => void) => {
          newUpdate = cb
        },
        resolve: () => newDeferred.promise
      })

    env.encodeButton.trigger('click')
    await flushTicks()
    env.encodeButton.trigger('click')
    await flushTicks()
    ;(oldUpdate as unknown as (snapshot: Snapshot) => void)({
      ...oldShell,
      pages: [{ ...oldShell.pages[0], textCount: 1 }]
    })
    oldDeferred.resolve({
      ...oldShell,
      pages: [{ ...oldShell.pages[0], textCount: 2 }]
    })
    await flushTicks()

    const oldUpdateCalls = env.updateData.mock.calls.filter(
      ([snapshot]) => (snapshot as Snapshot).id === 'doc-old'
    )
    expect(oldUpdateCalls).toHaveLength(0)

    const finalNew = {
      ...newShell,
      pages: [{ ...newShell.pages[0], textCount: 3 }]
    }
    ;(newUpdate as unknown as (snapshot: Snapshot) => void)(finalNew)
    newDeferred.resolve(finalNew)
    await flushTicks()

    expect(env.updateData).toHaveBeenCalledWith(finalNew)
    expect(env.statusElement.textContent).toBe('Encode ready')
    expect(env.decodeButton.disabled).toBe(false)
    expect(env.summaryElement.innerHTML).toContain(
      '<strong>Page Count:</strong> 1'
    )
  })

  it('preserves error handling when encode throws', async () => {
    const env = await setupDemo()
    env.encodeMock.mockRejectedValue(new Error('boom'))

    env.encodeButton.trigger('click')
    await flushTicks()

    expect(env.renderMessage).toHaveBeenLastCalledWith('boom')
    expect(env.statusElement.textContent).toBe('Encode failed')
    expect(env.diagnosticsElement.innerHTML).toContain(
      'Encode failed before diagnostics completed: boom'
    )
    expect(env.errorElement.textContent).toBe(
      'Encoding failed. See JSON output for details.'
    )
    expect(env.decodeButton.disabled).toBe(true)
  })
})
