import { PdfParser } from '../dist/browser.js'
import { serializeIntermediate } from './demoDocumentSerialization.js'
import { renderPreviewFrame, setPreviewMessage } from './demoPreview.js'
import { createJsonOutputRenderer } from './demoJsonView.js'

const loadSampleButton = document.getElementById('demo-load-sample')
const fileInput = document.getElementById('pdf-file-input')
const encodeButton = document.getElementById('encode-button')
const decodeButton = document.getElementById('decode-button')
const statusElement = document.querySelector('[data-role="status"]')
const errorElement = document.querySelector('[data-role="error"]')
const outputElement = document.querySelector('[data-role="output"]')
const jsonRenderer = createJsonOutputRenderer(outputElement)
const previewElement = document.querySelector('[data-role="preview"]')
const previewNoteElement = document.querySelector('[data-role="preview-note"]')
const summaryElement = document.querySelector(
  '[data-role="summary"] .summary-content'
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
let currentDecodePreviewUrl = null
let activeDecodeContextId = 0

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

const resetPreview = () => {
  setPreviewMessage(previewElement, 'Preview will appear here.')
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

const escapeHtml = (text) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const getPagePreviewText = (page) => {
  if (typeof page?.previewText !== 'string') {
    return ''
  }

  return page.previewText
}

const renderSummary = (serialized) => {
  const pageCount = Number.isFinite(serialized.pageCount)
    ? serialized.pageCount
    : 0
  const hasOutline = Boolean(serialized.hasOutline)

  setSummary(`
    <p><strong>Title:</strong> ${escapeHtml(serialized.title || 'N/A')}</p>
    <p><strong>ID:</strong> ${escapeHtml(serialized.id || 'N/A')}</p>
    <p><strong>Page Count:</strong> ${pageCount}</p>
    <p><strong>Outline:</strong> ${hasOutline ? 'available' : 'none'}</p>
  `)
}

const renderFirstPagePreview = (serialized) => {
  if (!Array.isArray(serialized.pages) || serialized.pages.length === 0) {
    setPreviewMessage(previewElement, 'No pages available in encoded result.')
    setPreviewNote('First page preview unavailable.')
    return
  }

  const firstPage = serialized.pages[0]
  const previewText = getPagePreviewText(firstPage)

  if (serialized.coverAvailable) {
    setPreviewMessage(previewElement, 'Cover available in encoded result.')
  } else {
    setPreviewMessage(previewElement, 'Cover unavailable.')
  }

  if (previewText.length > 0) {
    setPreviewNote(`First page preview: ${previewText.substring(0, 200)}...`)
  } else {
    setPreviewNote('First page text preview unavailable.')
  }
}

const handleLoadSample = async () => {
  setStatus('Loading sample...')
  setError('')
  resetPreview()
  setPreviewNote('Preview will appear here.')
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
  resetPreview()
  setPreviewNote('Preview will appear here.')
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

  setStatus('Encoding...')
  setError('')
  jsonRenderer.renderMessage('Working...')
  setPreviewMessage(previewElement, 'Encoding...')
  setPreviewNote('Encoding PDF...')

  try {
    const arrayBuffer = await currentFile.arrayBuffer()
    const intermediate = await PdfParser.encode(arrayBuffer)

    if (encodeContextId !== activeDecodeContextId) {
      return
    }

    if (!intermediate) {
      throw new Error('Encode returned empty result.')
    }

    const serialized = await serializeIntermediate(intermediate)

    if (encodeContextId !== activeDecodeContextId) {
      return
    }

    jsonRenderer.renderData(serialized)

    renderSummary(serialized)
    renderFirstPagePreview(serialized)
    activateDecodeContext(intermediate)

    setStatus('Encode ready')
  } catch (error) {
    if (encodeContextId !== activeDecodeContextId) {
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    jsonRenderer.renderMessage(message)
    setStatus('Encode failed')
    setError('Encoding failed. See JSON output for details.')
    setPreviewMessage(previewElement, 'Encoding failed.', true)
    setPreviewNote('Preview unavailable due to encode errors.', true)
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
    const decoded = await PdfParser.decode(intermediateDocument)

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

window.addEventListener('pagehide', () => {
  revokeDecodePreviewUrl()
})

window.addEventListener('beforeunload', () => {
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
