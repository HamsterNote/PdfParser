const PREVIEW_ERROR_CLASS = 'preview-error'

function getPreviewDocument(preview) {
  return preview?.ownerDocument ?? document
}

function resetPreview(preview) {
  preview.replaceChildren()
}

function createPlaceholderElement(preview, message) {
  const placeholder = getPreviewDocument(preview).createElement('span')
  placeholder.className = 'preview-placeholder'
  placeholder.textContent = message
  return placeholder
}

export function setPreviewMessage(preview, message, isError = false) {
  if (!preview) {
    return
  }

  resetPreview(preview)
  preview.classList.toggle(PREVIEW_ERROR_CLASS, isError)
  preview.append(createPlaceholderElement(preview, message))
}

export function renderPreviewImage(preview, imageUrl) {
  if (!preview) {
    return
  }

  resetPreview(preview)
  preview.classList.remove(PREVIEW_ERROR_CLASS)

  const img = getPreviewDocument(preview).createElement('img')
  img.src = imageUrl
  img.alt = 'PDF page preview'

  preview.append(img)
}
