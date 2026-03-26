import jsonview from '@pgrabovets/json-view'

function clearContainer(outputElement) {
  outputElement.replaceChildren()
}

export function createJsonOutputRenderer(
  outputElement,
  jsonviewApi = jsonview
) {
  let currentTree = null

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

  function renderMessage(message) {
    if (!outputElement) {
      return
    }

    destroyCurrentTree()
    clearContainer(outputElement)
    outputElement.textContent = message
  }

  function dispose() {
    destroyCurrentTree()

    if (!outputElement) {
      return
    }

    clearContainer(outputElement)
  }

  return {
    renderData,
    renderMessage,
    dispose
  }
}
