import { readFileSync } from 'node:fs'
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
type DecodeMock = jest.Mock<
  (
    buffer?: unknown,
    options?: unknown,
    onProgress?: (event: Record<string, unknown>) => void
  ) => Promise<ArrayBuffer | undefined>
>
type DemoFetchResponse = {
  ok: boolean
  blob?: () => Promise<Blob>
}
type DemoFetchMock = jest.Mock<
  (input?: unknown, init?: unknown) => Promise<DemoFetchResponse>
>
type RenderPreviewFrameMock = jest.Mock<
  (preview: unknown, frameUrl: string, title?: string) => void
>
type SetPreviewMessageMock = jest.Mock<
  (preview: unknown, message: string, isError?: boolean) => void
>

function createElementMock() {
  const listeners = new Map<string, (event?: unknown) => void>()
  const attributes = new Map<string, string>()
  return {
    textContent: '',
    innerHTML: '',
    disabled: false,
    hidden: false,
    checked: true,
    value: '',
    dataset: {} as Record<string, string>,
    focus: jest.fn(),
    classList: {
      toggle: jest.fn()
    },
    addEventListener: jest.fn(
      (name: string, handler: (event?: unknown) => void) => {
        listeners.set(name, handler)
      }
    ),
    setAttribute: jest.fn((name: string, value: string) => {
      attributes.set(name, value)
    }),
    getAttribute: jest.fn((name: string) => {
      return attributes.get(name) ?? null
    }),
    removeAttribute: jest.fn((name: string) => {
      attributes.delete(name)
    }),
    trigger(name: string, event?: unknown) {
      const handler = listeners.get(name)
      if (handler) {
        handler(event)
      }
    }
  }
}

function setMockPreviewContent(
  preview: unknown,
  innerHTML: string,
  textContent: string
) {
  const element = preview as {
    innerHTML?: string
    textContent?: string
  } | null

  if (!element) {
    return
  }

  element.innerHTML = innerHTML
  element.textContent = textContent
}

function getElementTag(html: string, tagName: string, id: string) {
  const match = html.match(
    new RegExp(`<${tagName}\\b[^>]*\\bid="${id}"[^>]*>`, 'i')
  )

  if (!match) {
    throw new Error(`Missing <${tagName}>#${id}`)
  }

  return match[0]
}

const encodeHtml = readFileSync('demo/encode.html', 'utf8')

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
  const decodeTextOverrideInput = createElementMock()
  const decodeTextErrorElement = createElementMock()
  const renderPreviewFrame: RenderPreviewFrameMock = jest.fn(
    (preview: unknown, frameUrl: string, title = 'PDF preview') => {
      setMockPreviewContent(
        preview,
        `<iframe src="${frameUrl}" title="${title}"></iframe>`,
        title
      )
    }
  )
  const setPreviewMessage: SetPreviewMessageMock = jest.fn(
    (preview: unknown, message: string, isError = false) => {
      const className = isError
        ? 'preview-placeholder preview-error'
        : 'preview-placeholder'
      setMockPreviewContent(
        preview,
        `<span class="${className}">${message}</span>`,
        message
      )
    }
  )

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

  const fetchMock: DemoFetchMock = jest.fn(async () => ({
    ok: true
  }))
  ;(globalThis as unknown as { fetch: DemoFetchMock }).fetch = fetchMock
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
      if (id === 'decode-text-override') return decodeTextOverrideInput
      if (id === 'decode-text-error') return decodeTextErrorElement
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
    renderPreviewFrame,
    setPreviewMessage
  }))

  const decodeMock: DecodeMock = jest.fn()

  const browserModule = await import('../../dist/browser.js')
  ;(browserModule.PdfParser as unknown as { encode: unknown }).encode =
    encodeMock
  ;(browserModule.PdfParser as unknown as { decode: unknown }).decode =
    decodeMock
  ;(
    browserModule.PdfParser as unknown as { configureDecodeFont: unknown }
  ).configureDecodeFont = configureDecodeFontMock

  await import('../demo.js')

  const testFile = new File([new Uint8Array([1, 2, 3])], 'demo.pdf', {
    type: 'application/pdf'
  })
  fileInput.trigger('change', { target: { files: [testFile] } })

  return {
    loadSampleButton,
    encodeButton,
    fileInput,
    jsonOutputToggle,
    jsonOutputCardElement,
    statusElement,
    errorElement,
    summaryElement,
    diagnosticsElement,
    decodeButton,
    decodeStatusElement,
    decodePreviewElement,
    decodePreviewNoteElement,
    decodeTextOverrideInput,
    decodeTextErrorElement,
    renderPreviewFrame,
    setPreviewMessage,
    renderData,
    updateData,
    renderMessage,
    encodeMock,
    decodeMock,
    serializerFactoryMock,
    windowMock,
    consoleInfo,
    consoleTable
  }
}

async function prepareDecodeContext(
  env: Awaited<ReturnType<typeof setupDemo>>
) {
  const intermediate = { id: 'doc-decode', title: 'Doc Decode' }
  const shell = {
    id: 'doc-decode',
    title: 'Doc Decode',
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
        textCount: 1,
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
  env.encodeMock.mockResolvedValue(intermediate)

  env.encodeButton.trigger('click')
  await flushTicks()

  expect(env.decodeButton.disabled).toBe(false)
}

async function renderDecodeSuccess(env: Awaited<ReturnType<typeof setupDemo>>) {
  env.decodeTextOverrideInput.value = JSON.stringify({
    content: 'Preview text'
  })
  env.decodeMock.mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer)

  env.decodeButton.trigger('click')
  await flushTicks()

  expect(env.decodeStatusElement.dataset.state).toBe('success')
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

describe('demo decode preview states', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders successful override decode as an inline PDF preview', async () => {
    const env = await setupDemo()
    await prepareDecodeContext(env)

    env.decodePreviewElement.innerHTML =
      'No previewable PDF was returned. Decode preview could not be generated.'
    env.decodePreviewNoteElement.textContent = 'old decode error'
    env.errorElement.textContent = 'old error'
    env.decodeTextErrorElement.textContent = 'Invalid JSON syntax.'
    env.renderPreviewFrame.mockClear()
    env.setPreviewMessage.mockClear()

    await renderDecodeSuccess(env)

    expect(env.decodePreviewElement.innerHTML).toContain('blob:preview')
    expect(env.decodePreviewElement.innerHTML).toContain('Decoded PDF preview')
    expect(env.decodePreviewElement.innerHTML).not.toContain('No previewable')
    expect(env.decodePreviewElement.innerHTML).not.toContain(
      'Decode preview could not be generated'
    )
    expect(env.decodePreviewNoteElement.textContent).toBe(
      'Preview generated from the latest successful encode result.'
    )
    expect(env.decodeTextErrorElement.textContent).toBe('')
    expect(env.errorElement.textContent).toBe('')
    expect(env.renderPreviewFrame).toHaveBeenCalledWith(
      env.decodePreviewElement,
      'blob:preview',
      'Decoded PDF preview'
    )
  })

  it('renders empty state for undefined and zero-byte decode results', async () => {
    const emptyResults: Array<ArrayBuffer | undefined> = [
      undefined,
      new ArrayBuffer(0)
    ]

    for (const decoded of emptyResults) {
      const env = await setupDemo()
      await prepareDecodeContext(env)
      env.decodeTextOverrideInput.value = JSON.stringify({ content: 'Empty' })
      env.decodeMock.mockResolvedValue(decoded)
      env.renderPreviewFrame.mockClear()

      env.decodeButton.trigger('click')
      await flushTicks()

      expect(env.decodeStatusElement.dataset.state).toBe('empty')
      expect(env.decodePreviewElement.innerHTML).toContain(
        'No previewable PDF was returned for the current document.'
      )
      expect(env.decodePreviewElement.innerHTML).not.toContain('blob:preview')
      expect(env.renderPreviewFrame).not.toHaveBeenCalled()
    }
  })

  it('renders error state when override decode throws', async () => {
    const env = await setupDemo()
    await prepareDecodeContext(env)

    env.decodeTextOverrideInput.value = JSON.stringify({ content: 'Error' })
    env.decodeMock.mockRejectedValue(new Error('decode boom'))
    env.renderPreviewFrame.mockClear()

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeStatusElement.dataset.state).toBe('error')
    expect(env.decodePreviewElement.innerHTML).toContain(
      'Decode preview could not be generated.'
    )
    expect(env.decodePreviewElement.innerHTML).not.toContain('blob:preview')
    expect(env.decodePreviewNoteElement.textContent).toBe('decode boom')
    expect(env.decodeTextErrorElement.textContent).toBe('')
    expect(env.renderPreviewFrame).not.toHaveBeenCalled()
  })

  it('clears previous decode preview and JSON error on file select', async () => {
    const env = await setupDemo()
    await prepareDecodeContext(env)
    await renderDecodeSuccess(env)

    env.decodeTextErrorElement.textContent = 'Invalid JSON syntax.'
    const newFile = new File([new Uint8Array([1])], 'new.pdf', {
      type: 'application/pdf'
    })

    env.fileInput.trigger('change', { target: { files: [newFile] } })

    expect(env.decodeStatusElement.dataset.state).toBe('idle')
    expect(env.decodePreviewElement.innerHTML).toContain(
      'Decode preview will be available after the selected PDF is encoded.'
    )
    expect(env.decodePreviewElement.innerHTML).not.toContain('blob:preview')
    expect(env.decodeTextErrorElement.textContent).toBe('')
  })

  it('clears previous decode preview and JSON error on sample load', async () => {
    const env = await setupDemo()
    await prepareDecodeContext(env)
    await renderDecodeSuccess(env)
    ;(
      globalThis as unknown as { fetch: DemoFetchMock }
    ).fetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1])])
    })
    env.decodeTextErrorElement.textContent = 'Invalid JSON syntax.'

    env.loadSampleButton.trigger('click')
    await flushTicks()

    expect(env.decodeStatusElement.dataset.state).toBe('idle')
    expect(env.decodePreviewElement.innerHTML).toContain(
      'Decode preview will be available after the sample is encoded.'
    )
    expect(env.decodePreviewElement.innerHTML).not.toContain('blob:preview')
    expect(env.decodeTextErrorElement.textContent).toBe('')
  })

  it('clears previous decode preview and JSON error on re-encode', async () => {
    const env = await setupDemo()
    await prepareDecodeContext(env)
    await renderDecodeSuccess(env)

    env.decodeTextErrorElement.textContent = 'Invalid JSON syntax.'
    env.encodeMock.mockImplementationOnce(() => new Promise<unknown>(() => {}))

    env.encodeButton.trigger('click')

    expect(env.decodeStatusElement.dataset.state).toBe('idle')
    expect(env.decodePreviewElement.innerHTML).toContain(
      'Decode preview cleared while a new encode is running.'
    )
    expect(env.decodePreviewElement.innerHTML).not.toContain('blob:preview')
    expect(env.decodeTextErrorElement.textContent).toBe('')
  })
})

describe('demo decode text override accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('associates the textarea with its visible label', () => {
    const textareaTag = getElementTag(
      encodeHtml,
      'textarea',
      'decode-text-override'
    )

    expect(encodeHtml).toContain(
      '<label for="decode-text-override">Decode Text Override (JSON)</label>'
    )
    expect(textareaTag).toContain('id="decode-text-override"')
  })

  it('associates help text with the textarea description', () => {
    const textareaTag = getElementTag(
      encodeHtml,
      'textarea',
      'decode-text-override'
    )
    const helpTextTag = getElementTag(encodeHtml, 'p', 'decode-text-help')

    expect(textareaTag).toContain('aria-describedby="decode-text-help"')
    expect(helpTextTag).toContain('id="decode-text-help"')
  })

  it('announces JSON override errors assertively', () => {
    const errorTag = getElementTag(encodeHtml, 'div', 'decode-text-error')

    expect(errorTag).toContain('role="alert"')
    expect(errorTag).toContain('aria-live="assertive"')
  })

  it('associates error message with the textarea via aria-errormessage', () => {
    const textareaTag = getElementTag(
      encodeHtml,
      'textarea',
      'decode-text-override'
    )
    const errorTag = getElementTag(encodeHtml, 'div', 'decode-text-error')

    expect(textareaTag).toContain('aria-errormessage="decode-text-error"')
    expect(errorTag).toContain('id="decode-text-error"')
  })

  it('keeps the textarea and enabled decode button focusable', async () => {
    const env = await setupDemo()
    await prepareDecodeContext(env)

    env.decodeTextOverrideInput.focus()
    env.decodeButton.focus()

    expect(env.decodeTextOverrideInput.focus).toHaveBeenCalled()
    expect(env.decodeButton.disabled).toBe(false)
    expect(env.decodeButton.focus).toHaveBeenCalled()
  })
})

describe('demo decode JSON override', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  async function prepareEncodeContext(
    env: Awaited<ReturnType<typeof setupDemo>>
  ) {
    await prepareDecodeContext(env)
  }

  it('valid JSON override drives demo decode', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    const override = {
      content: 'Demo Override',
      fontSize: 24,
      opacity: 0.5,
      color: '#ff0000'
    }
    env.decodeTextOverrideInput.value = JSON.stringify(override)

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).toHaveBeenCalledTimes(1)
    expect(env.decodeMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ text: override }),
      expect.any(Function)
    )
    expect(env.decodeTextErrorElement.textContent).toBe('')
    expect(env.decodeTextOverrideInput.setAttribute).toHaveBeenCalledWith(
      'aria-invalid',
      'false'
    )
  })

  it('invalid JSON blocks decode and clears stale preview', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = 'not json'

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).not.toHaveBeenCalled()
    expect(env.decodeTextErrorElement.textContent).toContain('Invalid JSON')
    expect(env.decodeTextOverrideInput.setAttribute).toHaveBeenCalledWith(
      'aria-invalid',
      'true'
    )
  })

  it('blank editor passes {} without text override', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = ''

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).toHaveBeenCalledTimes(1)
    expect(env.decodeMock).toHaveBeenLastCalledWith(
      expect.anything(),
      {},
      expect.any(Function)
    )
    expect(env.decodeTextErrorElement.textContent).toBe('')
    expect(env.decodeTextOverrideInput.setAttribute).toHaveBeenCalledWith(
      'aria-invalid',
      'false'
    )
  })

  it('whitespace-only editor passes {} without text override', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = '   \n\t  '

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).toHaveBeenCalledTimes(1)
    expect(env.decodeMock).toHaveBeenLastCalledWith(
      expect.anything(),
      {},
      expect.any(Function)
    )
    expect(env.decodeTextErrorElement.textContent).toBe('')
    expect(env.decodeTextOverrideInput.setAttribute).toHaveBeenCalledWith(
      'aria-invalid',
      'false'
    )
  })

  it('rejects unknown fields', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = JSON.stringify({ unknownField: 1 })

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).not.toHaveBeenCalled()
    expect(env.decodeTextErrorElement.textContent).toContain('Unknown field')
  })

  it('rejects invalid color values', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = JSON.stringify({ color: 'red' })

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).not.toHaveBeenCalled()
    expect(env.decodeTextErrorElement.textContent).toContain('Invalid color')
  })

  it('rejects non-number text override metrics', async () => {
    const invalidMetrics = [
      'fontSize',
      'lineHeight',
      'opacity',
      'ascent',
      'descent',
      'skew'
    ]

    for (const field of invalidMetrics) {
      const env = await setupDemo()
      await prepareEncodeContext(env)

      env.decodeTextOverrideInput.value = JSON.stringify({ [field]: '12' })

      env.decodeButton.trigger('click')
      await flushTicks()

      expect(env.decodeMock).not.toHaveBeenCalled()
      expect(env.decodeTextErrorElement.textContent).toContain(
        `${field} must be a number`
      )
    }
  })

  it('rejects non-number polygon entries', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = JSON.stringify({ polygon: [0, '1'] })

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).not.toHaveBeenCalled()
    expect(env.decodeTextErrorElement.textContent).toContain(
      'polygon must be an array of numbers'
    )
  })

  it('accepts transparent color', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = JSON.stringify({ color: 'transparent' })

    env.decodeButton.trigger('click')
    await flushTicks()

    expect(env.decodeMock).toHaveBeenCalledTimes(1)
    expect(env.decodeMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ text: { color: 'transparent' } }),
      expect.any(Function)
    )
    expect(env.decodeTextErrorElement.textContent).toBe('')
  })

  it('clears JSON error on file select', async () => {
    const env = await setupDemo()
    await prepareEncodeContext(env)

    env.decodeTextOverrideInput.value = 'bad'
    env.decodeButton.trigger('click')
    await flushTicks()
    expect(env.decodeTextErrorElement.textContent).not.toBe('')

    const newFile = new File([new Uint8Array([1])], 'new.pdf', {
      type: 'application/pdf'
    })
    env.fileInput.trigger('change', { target: { files: [newFile] } })
    expect(env.decodeTextErrorElement.textContent).toBe('')
    expect(env.decodeTextOverrideInput.getAttribute('aria-invalid')).toBe(
      'false'
    )
  })
})
