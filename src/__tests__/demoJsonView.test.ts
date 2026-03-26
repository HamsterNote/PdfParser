import { beforeEach, describe, expect, it, jest } from '@jest/globals'

import { createJsonOutputRenderer } from '../../demo/demoJsonView.js'

interface ViewerRoot {
  tagName: string
}

interface OutputElementLike {
  ownerDocument: {
    createElement: (tagName: string) => ViewerRoot
  }
  children: ViewerRoot[]
  textContent: string
  replaceChildren: (...nodes: ViewerRoot[]) => void
  append: (...nodes: ViewerRoot[]) => void
}

interface JsonTree {
  id: string
  data: unknown
  root: ViewerRoot
}

interface JsonviewApiMock {
  create: ReturnType<
    typeof jest.fn<(data: unknown, rootElement: ViewerRoot) => JsonTree>
  >
  render: ReturnType<
    typeof jest.fn<(tree: JsonTree, container: OutputElementLike) => void>
  >
  destroy: ReturnType<typeof jest.fn<(tree: JsonTree) => void>>
  expand: ReturnType<typeof jest.fn<(tree: JsonTree) => void>>
  collapse: ReturnType<typeof jest.fn<(tree: JsonTree) => void>>
}

function createOutputElement(): OutputElementLike {
  return {
    ownerDocument: {
      createElement: (tagName: string): ViewerRoot => ({ tagName })
    },
    children: [],
    textContent: '',
    replaceChildren(...nodes: ViewerRoot[]) {
      this.children = [...nodes]
      if (nodes.length === 0) {
        this.textContent = ''
      }
    },
    append(...nodes: ViewerRoot[]) {
      this.children.push(...nodes)
    }
  }
}

function createJsonviewApiMock(): JsonviewApiMock {
  const create = jest.fn<(data: unknown, rootElement: ViewerRoot) => JsonTree>(
    (data, rootElement) => ({
      id: `tree-${String((data as { id?: string })?.id ?? 'unknown')}`,
      data,
      root: rootElement
    })
  )
  const render = jest.fn<
    (tree: JsonTree, container: OutputElementLike) => void
  >((tree, container) => {
    container.append(tree.root)
  })
  const destroy = jest.fn<(tree: JsonTree) => void>()
  const expand = jest.fn<(tree: JsonTree) => void>()
  const collapse = jest.fn<(tree: JsonTree) => void>()

  return { create, render, destroy, expand, collapse }
}

describe('createJsonOutputRenderer', () => {
  let output: OutputElementLike
  let jsonviewApi: JsonviewApiMock

  beforeEach(() => {
    output = createOutputElement()
    jsonviewApi = createJsonviewApiMock()
  })

  it('首次渲染时调用 create 和 render，并仅插入一个 viewer root', () => {
    const renderer = createJsonOutputRenderer(output, jsonviewApi)
    const data = { id: 'first', ok: true }

    renderer.renderData(data)

    expect(jsonviewApi.create).toHaveBeenCalledTimes(1)
    expect(jsonviewApi.render).toHaveBeenCalledTimes(1)
    expect(jsonviewApi.destroy).not.toHaveBeenCalled()
    expect(output.children).toHaveLength(1)
    expect(output.textContent).toBe('')
    expect(jsonviewApi.expand).not.toHaveBeenCalled()
    expect(jsonviewApi.collapse).not.toHaveBeenCalled()
  })

  it('重复渲染前会先 destroy 上一棵树并清空容器', () => {
    const renderer = createJsonOutputRenderer(output, jsonviewApi)

    renderer.renderData({ id: 'first' })
    const firstTree = jsonviewApi.create.mock.results[0]?.value
    renderer.renderData({ id: 'second' })

    expect(jsonviewApi.destroy).toHaveBeenCalledTimes(1)
    expect(jsonviewApi.destroy).toHaveBeenCalledWith(firstTree)
    expect(output.children).toHaveLength(1)
    expect(jsonviewApi.create).toHaveBeenCalledTimes(2)
    expect(jsonviewApi.render).toHaveBeenCalledTimes(2)
  })

  it('renderMessage 会清理旧树并回退为纯文本消息', () => {
    const renderer = createJsonOutputRenderer(output, jsonviewApi)
    renderer.renderData({ id: 'first' })

    const firstTree = jsonviewApi.create.mock.results[0]?.value
    renderer.renderMessage('解析失败，请重试')

    expect(jsonviewApi.destroy).toHaveBeenCalledTimes(1)
    expect(jsonviewApi.destroy).toHaveBeenCalledWith(firstTree)
    expect(output.children).toHaveLength(0)
    expect(output.textContent).toBe('解析失败，请重试')
  })

  it('dispose 会销毁当前树并清空容器', () => {
    const renderer = createJsonOutputRenderer(output, jsonviewApi)
    renderer.renderData({ id: 'first' })

    const firstTree = jsonviewApi.create.mock.results[0]?.value
    renderer.dispose()

    expect(jsonviewApi.destroy).toHaveBeenCalledTimes(1)
    expect(jsonviewApi.destroy).toHaveBeenCalledWith(firstTree)
    expect(output.children).toHaveLength(0)
    expect(output.textContent).toBe('')
  })
})
