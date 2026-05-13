import jsonview from '@pgrabovets/json-view'

function clearContainer(outputElement) {
  outputElement.replaceChildren()
}

export function createJsonOutputRenderer(
  outputElement,
  jsonviewApi = jsonview
) {
  let currentTree = null
  let pendingData = null
  let scheduled = false
  let rafId = null

  function destroyCurrentTree() {
    if (!currentTree) {
      return
    }

    jsonviewApi.destroy(currentTree)
    currentTree = null
  }

  function renderData(data) {
    if (!outputElement) {
      return
    }

    destroyCurrentTree()
    clearContainer(outputElement)

    const viewerRoot = outputElement.ownerDocument.createElement('div')
    const tree = jsonviewApi.create(data, viewerRoot)
    jsonviewApi.render(tree, outputElement)

    currentTree = tree
  }

  function updateData(data) {
    pendingData = data
    if (scheduled) {
      return
    }
    scheduled = true
    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb) => setTimeout(cb, 0)
    rafId = schedule(() => {
      scheduled = false
      rafId = null
      if (pendingData !== null) {
        const dataToRender = pendingData
        pendingData = null
        renderData(dataToRender)
      }
    })
  }

  function renderMessage(message) {
    if (!outputElement) {
      return
    }

    if (rafId !== null) {
      const cancel =
        typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame
          : clearTimeout
      cancel(rafId)
      rafId = null
    }
    scheduled = false
    pendingData = null

    destroyCurrentTree()
    clearContainer(outputElement)
    outputElement.textContent = message
  }

  function dispose() {
    if (rafId !== null) {
      const cancel =
        typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame
          : clearTimeout
      cancel(rafId)
      rafId = null
    }
    scheduled = false
    pendingData = null

    destroyCurrentTree()

    if (!outputElement) {
      return
    }

    clearContainer(outputElement)
  }

  return {
    renderData,
    updateData,
    renderMessage,
    dispose
  }
}
