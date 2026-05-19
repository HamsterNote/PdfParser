import { PdfParser } from '../dist/browser.js'
import { createProgressiveSerializer } from './demoDocumentSerialization.js'
import { createJsonOutputRenderer } from './demoJsonView.js'
import { renderPreviewFrame, setPreviewMessage } from './demoPreview.js'

const DEMO_FALLBACK_FONT_URL = './assets/NotoSansSC-Regular.otf'

const getNow = () => {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now()
  }

  return Date.now()
}

const roundMs = (value) => Number(value.toFixed(2))

const publishEncodeDiagnostics = (diagnostics) => {
  const globalWindow = typeof window !== 'undefined' ? window : globalThis
  const target = globalWindow

  if (!target.__pdfParserDemoDiagnostics) {
    target.__pdfParserDemoDiagnostics = {}
  }

  target.__pdfParserDemoDiagnostics.lastEncode = diagnostics

  if (typeof console === 'undefined' || typeof console.info !== 'function') {
    return
  }

  console.info('[PdfParser demo] Encode diagnostics', diagnostics)
  if (
    typeof console.table === 'function' &&
    diagnostics.pageDiagnostics.length > 0
  ) {
    console.table(diagnostics.pageDiagnostics)
  }
}

const configureDemoDecodeFonts = async () => {
  try {
    const response = await fetch(DEMO_FALLBACK_FONT_URL, { method: 'HEAD' })
    if (!response.ok) {
      throw new Error(`Failed to load decode font: ${response.status}`)
    }

    PdfParser.configureDecodeFont({
      url: DEMO_FALLBACK_FONT_URL
    })
  } catch (error) {
    console.warn('Failed to configure decode font.', error)
    PdfParser.configureDecodeFont()
  }
}

const decodeFontSetupPromise = configureDemoDecodeFonts()

const loadSampleButton = document.getElementById('demo-load-sample')
const fileInput = document.getElementById('pdf-file-input')
const pageNumberInput = document.getElementById('page-number-input')
const encodeButton = document.getElementById('encode-button')
const decodeButton = document.getElementById('decode-button')
const jsonOutputToggle = document.getElementById('json-output-toggle')
const statusElement = document.querySelector('[data-role="status"]')
const errorElement = document.querySelector('[data-role="error"]')
const jsonOutputCardElement = document.querySelector(
  '[data-role="json-output-card"]'
)
const outputElement = document.querySelector('[data-role="output"]')
const jsonRenderer = createJsonOutputRenderer(outputElement)
const previewElement = document.querySelector('[data-role="preview"]')
const previewNoteElement = document.querySelector('[data-role="preview-note"]')
const summaryElement = document.querySelector(
  '[data-role="summary"] .summary-content'
)
const diagnosticsElement = document.querySelector(
  '[data-role="diagnostics"] .diagnostics-content'
)
const decodeStatusElement = document.querySelector(
  '[data-role="decode-status"]'
)
const decodePreviewElement = document.querySelector(
  '[data-role="decode-preview"]'
)
const decodePreviewNoteElement = document.querySelector(
  '[data-role="decode-preview-note"]'
)

let currentFile = null
let currentIntermediateDocument = null
let currentPagePreviewUrl = null
let currentDecodePreviewUrl = null
let activeDecodeContextId = 0
let latestJsonOutput = {
  kind: 'message',
  value:
    'Click "Load Sample PDF" or upload a PDF file, then click "Encode PDF".'
}

const isJsonOutputEnabled = () => jsonOutputToggle?.checked !== false

const getSelectedPageNumber = () => {
  if (!pageNumberInput) return undefined
  const value = pageNumberInput.value.trim()
  if (value === '') return undefined
  const num = parseInt(value, 10)
  return Number.isFinite(num) && num >= 1 ? num : undefined
}

const syncJsonOutputVisibility = () => {
  if (jsonOutputCardElement) {
    jsonOutputCardElement.hidden = !isJsonOutputEnabled()
  }
}

const renderLatestJsonOutput = () => {
  if (!isJsonOutputEnabled()) {
    return
  }

  if (latestJsonOutput.kind === 'data') {
    jsonRenderer.renderData(latestJsonOutput.value)
    return
  }

  jsonRenderer.renderMessage(latestJsonOutput.value)
}

const setJsonOutputMessage = (message) => {
  latestJsonOutput = {
    kind: 'message',
    value: message
  }

  if (!isJsonOutputEnabled()) {
    return
  }

  jsonRenderer.renderMessage(message)
}

const renderJsonOutputData = (data) => {
  latestJsonOutput = {
    kind: 'data',
    value: data
  }

  if (!isJsonOutputEnabled()) {
    return
  }

  jsonRenderer.renderData(data)
}

const updateJsonOutputData = (data) => {
  latestJsonOutput = {
    kind: 'data',
    value: data
  }

  if (!isJsonOutputEnabled()) {
    return
  }

  jsonRenderer.updateData(data)
}

const setStatus = (text) => {
  if (statusElement) {
    statusElement.textContent = text
  }
}

const setError = (text) => {
  if (errorElement) {
    errorElement.textContent = text
  }
}

const setPreviewNote = (text, isError = false) => {
  if (!previewNoteElement) return
  previewNoteElement.textContent = text
  previewNoteElement.classList.toggle('is-error', isError)
}

const setDecodePreviewNote = (text, isError = false) => {
  if (!decodePreviewNoteElement) return
  decodePreviewNoteElement.textContent = text
  decodePreviewNoteElement.classList.toggle('is-error', isError)
}

const setSummary = (html) => {
  if (summaryElement) {
    summaryElement.innerHTML = html
  }
}

const setDiagnostics = (html) => {
  if (diagnosticsElement) {
    diagnosticsElement.innerHTML = html
  }
}

const formatMetricValue = (value) => {
  if (!Number.isFinite(value)) {
    return 'N/A'
  }

  return `${value.toFixed(2)} ms`
}

const renderDiagnosticsPlaceholder = (message) => {
  setDiagnostics(`
    <p class="diagnostics-placeholder">${escapeHtml(message)}</p>
  `)
}

const escapeHtml = (text) => {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const getSlowestPageDiagnostic = (pageDiagnostics) => {
  if (!Array.isArray(pageDiagnostics) || pageDiagnostics.length === 0) {
    return null
  }

  return pageDiagnostics.reduce((slowest, current) => {
    const currentDuration = Number.isFinite(current.totalDurationMs)
      ? current.totalDurationMs
      : -1
    const slowestDuration = Number.isFinite(slowest?.totalDurationMs)
      ? slowest.totalDurationMs
      : -1

    return currentDuration > slowestDuration ? current : slowest
  }, null)
}

const renderEncodeDiagnostics = (diagnostics) => {
  if (!diagnostics || diagnostics.failure) {
    const failureMessage = diagnostics?.failure
      ? `Encode failed before diagnostics completed: ${diagnostics.failure}`
      : 'Run Encode to inspect where complete-to-ready time is spent.'
    renderDiagnosticsPlaceholder(failureMessage)
    return
  }

  const totals = diagnostics.totals ?? {}
  const pageDiagnostics = Array.isArray(diagnostics.pageDiagnostics)
    ? diagnostics.pageDiagnostics
    : []
  const slowestPage = getSlowestPageDiagnostic(pageDiagnostics)
  const pageCount = pageDiagnostics.filter((entry) => !entry.error).length
  let coverSummary = 'Cover timing not recorded.'
  if (diagnostics.coverDiagnostic) {
    if (diagnostics.coverDiagnostic.skipped) {
      coverSummary = 'Cover generation skipped.'
    } else {
      const coverAvailability = diagnostics.coverDiagnostic.available
        ? 'available'
        : 'missing'
      coverSummary = `Cover ${coverAvailability} in ${formatMetricValue(diagnostics.coverDiagnostic.durationMs)}.`
    }
  }

  let bottleneck = 'Waiting for serializer completion dominated.'
  if (slowestPage && Number.isFinite(slowestPage.resolveTextsMs)) {
    bottleneck = `Slowest page: ${slowestPage.pageNumber} (${formatMetricValue(slowestPage.totalDurationMs)} total, ${formatMetricValue(slowestPage.resolveTextsMs)} in text resolution).`
  } else if (Number.isFinite(diagnostics.coverDiagnostic?.durationMs)) {
    bottleneck = `Cover work took ${formatMetricValue(diagnostics.coverDiagnostic.durationMs)}.`
  }

  setDiagnostics(`
    <p><strong>Complete → Ready:</strong> ${formatMetricValue(totals.completeToReadyMs)}</p>
    <p><strong>Serializer Wait:</strong> ${formatMetricValue(totals.serializerResolveMs)}</p>
    <p><strong>Total Encode Flow:</strong> ${formatMetricValue(totals.totalEncodeFlowMs)}</p>
    <p><strong>Pages Profiled:</strong> ${pageCount}</p>
    <p><strong>Hotspot:</strong> ${escapeHtml(bottleneck)}</p>
    <p><strong>Cover:</strong> ${escapeHtml(coverSummary)}</p>
    <ul class="diagnostics-list">
      <li>Inspect raw data in <code>window.__pdfParserDemoDiagnostics.lastEncode</code>.</li>
      <li>Use <code>pageDiagnostics</code> to compare per-page text resolution cost.</li>
    </ul>
  `)
}

const resetPreview = () => {
  revokePagePreviewUrl()
  setPreviewMessage(previewElement, 'Original PDF preview will appear here.')
}

const setDecodeButtonEnabled = (enabled) => {
  if (decodeButton) {
    decodeButton.disabled = !enabled
  }
}

const revokeDecodePreviewUrl = () => {
  if (!currentDecodePreviewUrl) {
    return
  }

  URL.revokeObjectURL(currentDecodePreviewUrl)
  currentDecodePreviewUrl = null
}

const revokePagePreviewUrl = () => {
  if (!currentPagePreviewUrl) {
    return
  }

  URL.revokeObjectURL(currentPagePreviewUrl)
  currentPagePreviewUrl = null
}

const setDecodeState = ({
  name,
  statusText,
  previewMessage,
  previewUrl,
  note,
  isError = false
}) => {
  if (decodeStatusElement) {
    decodeStatusElement.textContent = statusText
    decodeStatusElement.dataset.state = name
    decodeStatusElement.classList.toggle('is-error', isError)
  }

  if (previewUrl) {
    renderPreviewFrame(decodePreviewElement, previewUrl, 'Decoded PDF preview')
  } else {
    setPreviewMessage(decodePreviewElement, previewMessage, isError)
  }

  setDecodePreviewNote(note, isError)
}

const resetDecodeContext = ({
  statusText = 'Encode a PDF to enable decode preview.',
  previewMessage = 'Run Encode first, then click Decode to preview the restored PDF.',
  note = 'Decode preview is only available for the latest successful encode result in this page session.',
  keepDocument = false,
  isError = false
} = {}) => {
  activeDecodeContextId += 1
  revokeDecodePreviewUrl()

  if (!keepDocument) {
    currentIntermediateDocument = null
  }

  setDecodeButtonEnabled(keepDocument)
  setDecodeState({
    name: 'idle',
    statusText,
    previewMessage,
    note,
    isError
  })
}

const activateDecodeContext = (intermediateDocument) => {
  currentIntermediateDocument = intermediateDocument
  setDecodeButtonEnabled(true)
  setDecodeState({
    name: 'idle',
    statusText: 'Encode ready. Click Decode to restore the current PDF.',
    previewMessage: 'Decode is ready for the latest encoded document.',
    note: 'Decode preview only works with the latest successful encode result in this page session.'
  })
}

const getDecodedByteLength = (decoded) => {
  if (decoded instanceof ArrayBuffer) {
    return decoded.byteLength
  }

  if (decoded instanceof Blob) {
    return decoded.size
  }

  return 0
}

const createDecodePreviewUrl = (decoded) => {
  const blob =
    decoded instanceof Blob
      ? decoded
      : new Blob([decoded], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

const formatDecodeProgressText = (event) => {
  const total = Number.isFinite(event?.total) ? event.total : 0
  const current = Number.isFinite(event?.current) ? event.current : 0
  const pageLabel = total === 1 ? 'page' : 'pages'

  if (event?.stage === 'decode:start') {
    if (total > 0) {
      return `Decoding started. Preparing ${total} ${pageLabel}...`
    }

    return 'Decoding started.'
  }

  if (event?.stage === 'decode:complete') {
    if (total > 0) {
      return `Decoding complete. Processed ${total} ${pageLabel}.`
    }

    return 'Decoding complete.'
  }

  if (total > 0) {
    return `Decoding page ${Math.min(current, total)} of ${total}...`
  }

  return 'Decoding PDF binary...'
}

const formatEncodeProgressText = (event) => {
  const total = Number.isFinite(event?.total) ? event.total : 0
  const current = Number.isFinite(event?.current) ? event.current : 0
  const pageLabel = total === 1 ? 'page' : 'pages'

  if (event?.stage === 'encode:start') {
    if (total > 0) {
      return `Encoding started. Preparing ${total} ${pageLabel}...`
    }

    return 'Encoding started.'
  }

  if (event?.stage === 'encode:complete') {
    if (total > 0) {
      return `Encoding complete. Processed ${total} ${pageLabel}.`
    }

    return 'Encoding complete.'
  }

  if (total > 0) {
    if (total === 1) {
      return 'Encoding page 1...'
    }
    return `Encoding page ${Math.min(current, total)} of ${total}...`
  }

  return 'Encoding PDF pages...'
}

const formatSerializerProgressText = (event) => {
  const total = Number.isFinite(event?.total) ? event.total : 0
  const current = Number.isFinite(event?.current) ? event.current : 0

  if (event?.stage === 'serialize:start') {
    if (total > 0) {
      return `Encoding complete. Finalizing Demo output (${current} / ${total})...`
    }

    return 'Encoding complete. Finalizing Demo output...'
  }

  if (event?.stage === 'serialize:complete') {
    return 'Finalization complete. Preparing decode preview...'
  }

  if (event?.stage === 'serialize:cover') {
    return `Encoding complete. Checked cover availability (${current} / ${total})...`
  }

  if (event?.stage === 'serialize:page' && Number.isFinite(event?.pageNumber)) {
    return `Encoding complete. Summarized page ${event.pageNumber} (${current} / ${total})...`
  }

  if (total > 0) {
    return `Encoding complete. Finalizing Demo output (${current} / ${total})...`
  }

  return 'Encoding complete. Finalizing Demo output...'
}

const formatSerializerPreviewNote = (event) => {
  if (event?.stage === 'serialize:page' && Number.isFinite(event?.pageCount)) {
    return `Building preview data for page ${event.pageNumber} of ${event.pageCount}.`
  }

  if (event?.stage === 'serialize:cover') {
    return event.available
      ? 'Cover preview is available. Continuing page summaries...'
      : 'Cover preview is unavailable. Continuing page summaries...'
  }

  if (event?.stage === 'serialize:complete') {
    return 'Demo output is ready. Restoring decode actions...'
  }

  return 'Finalizing the restored PDF preview...'
}

const renderPagePreview = (file) => {
  if (!file || !(file instanceof Blob)) {
    resetPreview()
    setPreviewNote('Page Preview shows the original PDF in this session.')
    return
  }

  revokePagePreviewUrl()
  currentPagePreviewUrl = URL.createObjectURL(file)
  renderPreviewFrame(
    previewElement,
    currentPagePreviewUrl,
    'Original PDF preview'
  )
  setPreviewNote('Showing the original PDF loaded in this page session.')
}

const enableEncodeButton = () => {
  if (encodeButton) {
    encodeButton.disabled = false
  }
}

const disableEncodeButton = () => {
  if (encodeButton) {
    encodeButton.disabled = true
  }
}

const renderSummary = (serialized, singlePageNumber) => {
  const pageCount = Number.isFinite(serialized.pageCount)
    ? serialized.pageCount
    : 0
  const hasOutline = Boolean(serialized.hasOutline)
  const pageCountText =
    singlePageNumber != null && pageCount > 0
      ? `Page ${singlePageNumber} of ${pageCount}`
      : `${pageCount}`

  setSummary(`
    <p><strong>Title:</strong> ${escapeHtml(serialized.title || 'N/A')}</p>
    <p><strong>ID:</strong> ${escapeHtml(serialized.id || 'N/A')}</p>
    <p><strong>Page Count:</strong> ${pageCountText}</p>
    <p><strong>Outline:</strong> ${hasOutline ? 'available' : 'none'}</p>
  `)
}

const handleLoadSample = async () => {
  setStatus('Loading sample...')
  setError('')
  renderDiagnosticsPlaceholder(
    'Loading a sample clears the previous encode diagnostics.'
  )
  resetPreview()
  setPreviewNote('Original PDF preview will appear here.')
  resetDecodeContext({
    statusText: 'Loading a sample cleared the previous decode result.',
    previewMessage:
      'Decode preview will be available after the sample is encoded.',
    note: 'Any previous decode preview has been cleared.'
  })

  try {
    const response = await fetch('./assets/test_github.pdf')
    if (!response.ok) {
      throw new Error(`Failed to load sample PDF: ${response.status}`)
    }
    const blob = await response.blob()
    currentFile = new File([blob], 'test_github.pdf', {
      type: 'application/pdf'
    })
    renderPagePreview(currentFile)
    setStatus('Sample loaded')
    enableEncodeButton()
  } catch (error) {
    currentFile = null
    const message = error instanceof Error ? error.message : String(error)
    setError(message)
    setStatus('Failed to load sample')
    disableEncodeButton()
  }
}

const handleFileSelect = (event) => {
  const file = event.target.files?.[0]
  if (!file) {
    return
  }

  setError('')
  renderDiagnosticsPlaceholder(
    'Selecting a file clears the previous encode diagnostics.'
  )
  resetPreview()
  setPreviewNote('Original PDF preview will appear here.')
  resetDecodeContext({
    statusText: 'Selecting a file cleared the previous decode result.',
    previewMessage:
      'Decode preview will be available after the selected PDF is encoded.',
    note: 'Any previous decode preview has been cleared.'
  })

  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    setError('Please select a PDF file.')
    setStatus('Invalid file')
    currentFile = null
    disableEncodeButton()
    return
  }

  currentFile = file
  renderPagePreview(file)
  setStatus('File selected')
  enableEncodeButton()
}

const handleEncode = async () => {
  if (!currentFile || !outputElement) {
    return
  }

  const encodeContextId = activeDecodeContextId + 1
  activeDecodeContextId = encodeContextId
  revokeDecodePreviewUrl()
  currentIntermediateDocument = null
  setDecodeButtonEnabled(false)
  setDecodeState({
    name: 'idle',
    statusText:
      'Encoding in progress. Decode will re-enable when encode succeeds.',
    previewMessage: 'Decode preview cleared while a new encode is running.',
    note: 'Only the newest successful encode result can be decoded.'
  })

  const pageNumber = getSelectedPageNumber()
  const encodeStatusPrefix = pageNumber
    ? `Encoding page ${pageNumber}...`
    : 'Encoding...'
  setStatus(encodeStatusPrefix)
  setError('')
  renderDiagnosticsPlaceholder('Collecting encode diagnostics...')
  setJsonOutputMessage('Working...')
  setPreviewNote('Showing the original PDF while encode is running.')

  const encodeStartedAt = getNow()
  const encodeDiagnostics = {
    fileName: currentFile.name,
    fileSize: currentFile.size,
    milestones: {
      encodeStartedAt: roundMs(encodeStartedAt),
      encodeCompleteAt: null,
      serializerCreatedAt: null,
      shellRenderedAt: null,
      serializerResolvedAt: null,
      readyAt: null
    },
    pageDiagnostics: [],
    coverDiagnostic: null,
    totals: null,
    failure: null
  }

  try {
    const arrayBuffer = await currentFile.arrayBuffer()
    const encodeOptions = pageNumber ? { pages: [pageNumber] } : {}
    const intermediate = await PdfParser.encode(
      arrayBuffer,
      encodeOptions,
      (event) => {
        if (encodeContextId !== activeDecodeContextId) {
          return
        }

        setStatus(formatEncodeProgressText(event))

        if (event?.stage === 'encode:start') {
          setPreviewNote('Encoding PDF pages...')
        }

        if (event?.stage === 'encode:page' && event.total > 0) {
          const pageLabel = event.total === 1 ? 'page' : 'pages'
          setPreviewNote(
            `Processed ${event.current} / ${event.total} ${pageLabel} so far.`
          )
        }

        if (event?.stage === 'encode:complete') {
          encodeDiagnostics.milestones.encodeCompleteAt = roundMs(getNow())
          setPreviewNote('Finalizing the restored PDF preview...')
        }
      }
    )

    if (encodeContextId !== activeDecodeContextId) {
      return
    }

    if (!intermediate) {
      throw new Error('Encode returned empty result.')
    }

    encodeDiagnostics.milestones.serializerCreatedAt = roundMs(getNow())
    const serializer = createProgressiveSerializer(intermediate, {
      onDiagnostic: (event) => {
        if (event.type === 'cover') {
          encodeDiagnostics.coverDiagnostic = {
            available: event.available,
            durationMs: roundMs(event.durationMs),
            skipped: event.skipped
          }
          return
        }

        if (event.type === 'page') {
          encodeDiagnostics.pageDiagnostics.push({
            pageNumber: event.pageNumber,
            totalDurationMs: roundMs(event.totalDurationMs),
            resolvePageMs: roundMs(event.resolvePageMs),
            resolveTextsMs: roundMs(event.resolveTextsMs),
            buildSummaryMs: roundMs(event.buildSummaryMs),
            textCount: event.textCount,
            missing: event.missing
          })
          return
        }

        encodeDiagnostics.pageDiagnostics.push({
          pageNumber: event.pageNumber,
          totalDurationMs: roundMs(event.totalDurationMs),
          error: event.error
        })
      },
      onProgress: (event) => {
        if (encodeContextId !== activeDecodeContextId) {
          return
        }

        setStatus(formatSerializerProgressText(event))
        setPreviewNote(formatSerializerPreviewNote(event))
      }
    })
    renderJsonOutputData(serializer.shell)
    encodeDiagnostics.milestones.shellRenderedAt = roundMs(getNow())
    renderSummary(serializer.shell, pageNumber)

    serializer.onUpdate((snapshot) => {
      if (encodeContextId !== activeDecodeContextId) {
        return
      }

      updateJsonOutputData(snapshot)
      renderSummary(snapshot, pageNumber)
    })

    const finalSnapshot = await serializer.resolve()
    encodeDiagnostics.milestones.serializerResolvedAt = roundMs(getNow())

    if (encodeContextId !== activeDecodeContextId) {
      return
    }

    updateJsonOutputData(finalSnapshot)
    renderSummary(finalSnapshot, pageNumber)
    activateDecodeContext(intermediate)

    encodeDiagnostics.milestones.readyAt = roundMs(getNow())
    encodeDiagnostics.totals = {
      encodeToCompleteMs:
        encodeDiagnostics.milestones.encodeCompleteAt === null
          ? null
          : roundMs(
              encodeDiagnostics.milestones.encodeCompleteAt -
                encodeDiagnostics.milestones.encodeStartedAt
            ),
      completeToReadyMs:
        encodeDiagnostics.milestones.encodeCompleteAt === null
          ? null
          : roundMs(
              encodeDiagnostics.milestones.readyAt -
                encodeDiagnostics.milestones.encodeCompleteAt
            ),
      serializerResolveMs:
        encodeDiagnostics.milestones.serializerCreatedAt === null
          ? null
          : roundMs(
              encodeDiagnostics.milestones.serializerResolvedAt -
                encodeDiagnostics.milestones.serializerCreatedAt
            ),
      totalEncodeFlowMs: roundMs(
        encodeDiagnostics.milestones.readyAt -
          encodeDiagnostics.milestones.encodeStartedAt
      )
    }
    publishEncodeDiagnostics(encodeDiagnostics)
    renderEncodeDiagnostics(encodeDiagnostics)
    setStatus('Encode ready')
  } catch (error) {
    if (encodeContextId !== activeDecodeContextId) {
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    setJsonOutputMessage(message)
    encodeDiagnostics.failure = message
    encodeDiagnostics.milestones.readyAt = roundMs(getNow())
    publishEncodeDiagnostics(encodeDiagnostics)
    renderEncodeDiagnostics(encodeDiagnostics)
    setStatus('Encode failed')
    setError('Encoding failed. See JSON output for details.')
    setPreviewNote(
      'Original PDF preview remains available. Encode failed.',
      true
    )
    setDecodeState({
      name: 'idle',
      statusText:
        'Encode failed. Decode preview is unavailable until encode succeeds.',
      previewMessage:
        'Decode preview unavailable because the latest encode failed.',
      note: 'Re-run Encode successfully to restore a decode context.',
      isError: true
    })
  }
}

const handleDecode = async () => {
  if (!currentIntermediateDocument) {
    setStatus('Decode unavailable')
    setDecodeState({
      name: 'idle',
      statusText: 'Decode unavailable until Encode succeeds.',
      previewMessage:
        'Run Encode first, then click Decode to preview the restored PDF.',
      note: 'Decode preview is only available for the latest successful encode result in this page session.'
    })
    return
  }

  const decodeContextId = activeDecodeContextId
  const intermediateDocument = currentIntermediateDocument

  setStatus('Decoding...')
  setError('')
  setDecodeButtonEnabled(false)
  revokeDecodePreviewUrl()
  setDecodeState({
    name: 'loading',
    statusText: 'Decoding PDF binary...',
    previewMessage: 'Generating a preview from the current encoded document...',
    note: 'The previous decode preview has been cleared.'
  })

  try {
    await decodeFontSetupPromise
    const decoded = await PdfParser.decode(
      intermediateDocument,
      {},
      (event) => {
        if (
          decodeContextId !== activeDecodeContextId ||
          currentIntermediateDocument !== intermediateDocument
        ) {
          return
        }

        const previewMessage =
          event.stage === 'decode:complete'
            ? 'Finalizing the restored PDF preview...'
            : 'Generating a preview from the current encoded document...'

        let note = 'The previous decode preview has been cleared.'
        if (event.stage === 'decode:page' && event.total > 0) {
          const pageLabel = event.total === 1 ? 'page' : 'pages'
          note = `Processed ${event.current} / ${event.total} ${pageLabel} so far.`
        }

        setDecodeState({
          name: 'loading',
          statusText: formatDecodeProgressText(event),
          previewMessage,
          note
        })
      }
    )

    if (
      decodeContextId !== activeDecodeContextId ||
      currentIntermediateDocument !== intermediateDocument
    ) {
      return
    }

    if (!decoded || getDecodedByteLength(decoded) === 0) {
      setStatus('Decode complete: empty result')
      setDecodeButtonEnabled(true)
      setDecodeState({
        name: 'empty',
        statusText: 'Decode finished, but there is no previewable PDF output.',
        previewMessage:
          'No previewable PDF was returned for the current document.',
        note: 'This usually means the current IntermediateDocument has no usable page content for PDF generation.'
      })
      return
    }

    const previewUrl = createDecodePreviewUrl(decoded)

    if (
      decodeContextId !== activeDecodeContextId ||
      currentIntermediateDocument !== intermediateDocument
    ) {
      URL.revokeObjectURL(previewUrl)
      return
    }

    currentDecodePreviewUrl = previewUrl
    setStatus('Decode complete')
    setDecodeButtonEnabled(true)
    setDecodeState({
      name: 'success',
      statusText: 'Decode complete. Showing the restored PDF preview.',
      previewUrl,
      note: 'Preview generated from the latest successful encode result.'
    })
  } catch (error) {
    if (
      decodeContextId !== activeDecodeContextId ||
      currentIntermediateDocument !== intermediateDocument
    ) {
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    revokeDecodePreviewUrl()
    setStatus('Decode failed')
    setError(message)
    setDecodeButtonEnabled(true)
    setDecodeState({
      name: 'error',
      statusText: 'Decode failed. See the error message above.',
      previewMessage: 'Decode preview could not be generated.',
      note: message,
      isError: true
    })
  }
}

resetDecodeContext()
renderDiagnosticsPlaceholder(
  'Run Encode to inspect where complete-to-ready time is spent.'
)
syncJsonOutputVisibility()

if (jsonOutputToggle) {
  jsonOutputToggle.addEventListener('change', () => {
    syncJsonOutputVisibility()
    renderLatestJsonOutput()
  })
}

window.addEventListener('pagehide', () => {
  revokePagePreviewUrl()
  revokeDecodePreviewUrl()
})

window.addEventListener('beforeunload', () => {
  revokePagePreviewUrl()
  revokeDecodePreviewUrl()
})

if (loadSampleButton) {
  loadSampleButton.addEventListener('click', () => {
    void handleLoadSample()
  })
}

if (fileInput) {
  fileInput.addEventListener('change', (event) => {
    void handleFileSelect(event)
  })
}

if (encodeButton) {
  encodeButton.addEventListener('click', () => {
    void handleEncode()
  })
}

if (decodeButton) {
  decodeButton.addEventListener('click', () => {
    void handleDecode()
  })
}
