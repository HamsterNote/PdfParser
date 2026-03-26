import { PdfParser } from '../dist/browser.js'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import { serializeIntermediate } from './demoDocumentSerialization.js'
import { setPreviewMessage } from './demoPreview.js'

GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/build/pdf.worker.min.mjs'

const loadSampleButton = document.getElementById('demo-load-sample')
const fileInput = document.getElementById('pdf-file-input')
const encodeButton = document.getElementById('encode-button')
const decodeButton = document.getElementById('decode-button')
const statusElement = document.querySelector('[data-role="status"]')
const errorElement = document.querySelector('[data-role="error"]')
const outputElement = document.querySelector('[data-role="output"]')
const previewElement = document.querySelector('[data-role="preview"]')
const previewNoteElement = document.querySelector('[data-role="preview-note"]')
const summaryElement = document.querySelector(
  '[data-role="summary"] .summary-content'
)
const decodeStatusElement = document.querySelector(
  '[data-role="decode-status"]'
)

let currentFile = null

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

const setSummary = (html) => {
  if (summaryElement) {
    summaryElement.innerHTML = html
  }
}

const resetPreview = () => {
  setPreviewMessage(previewElement, 'Preview will appear here.')
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

  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    setError('请选择 PDF 文件。')
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

  setStatus('Encoding...')
  setError('')
  outputElement.textContent = 'Working...'
  setPreviewMessage(previewElement, 'Encoding...')
  setPreviewNote('Encoding PDF...')

  try {
    const arrayBuffer = await currentFile.arrayBuffer()
    const intermediate = await PdfParser.encode(arrayBuffer)
    if (!intermediate) {
      throw new Error('Encode returned empty result.')
    }

    const serialized = await serializeIntermediate(intermediate)
    outputElement.textContent = JSON.stringify(serialized, null, 2)

    renderSummary(serialized)
    renderFirstPagePreview(serialized)

    setStatus('Encode ready')
    if (decodeButton) {
      decodeButton.disabled = false
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    outputElement.textContent = message
    setStatus('Encode failed')
    setError('Encoding failed. See JSON output for details.')
    setPreviewMessage(previewElement, 'Encoding failed.', true)
    setPreviewNote('Preview unavailable due to encode errors.', true)
  }
}

const handleDecode = () => {
  const decodeUnavailableMessage = 'Decode unavailable in current release'

  if (decodeStatusElement) {
    decodeStatusElement.textContent = decodeUnavailableMessage
  }
  setStatus(decodeUnavailableMessage)
}

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
    handleDecode()
  })
}
