import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { createJsonOutputRenderer } from '../demoJsonView'

interface MockTree {
  data: unknown
  rootElement: HTMLElement
  id: string
}

interface MockJsonviewApi {
  create: jest.Mock<(data: unknown, rootElement: HTMLElement) => MockTree>
  render: jest.Mock
  destroy: jest.Mock<(tree: MockTree) => void>
  _trees: MockTree[]
}

interface MockElement {
  children: MockElement[]
  textContent: string
  replaceChildren: jest.Mock
  appendChild: jest.Mock
  ownerDocument: {
    createElement: jest.Mock<(tag: string) => MockElement>
  }
}

let treeIdCounter = 0

function createMockJsonviewApi(): MockJsonviewApi {
  const trees: MockTree[] = []
  return {
    create: jest.fn((data: unknown, rootElement: HTMLElement): MockTree => {
      const tree: MockTree = {
        data,
        rootElement,
        id: 'tree-' + ++treeIdCounter
      }
      trees.push(tree)
      return tree
    }),
    render: jest.fn(),
    destroy: jest.fn((tree: MockTree) => {
      const idx = trees.indexOf(tree)
      if (idx !== -1) {
        trees.splice(idx, 1)
      }
    }),
    _trees: trees
  }
}

function createMockOutputElement(): MockElement {
  const el: MockElement = {
    children: [],
    textContent: '',
    replaceChildren: jest.fn(function (
      this: MockElement,
      ...nodes: MockElement[]
    ) {
      this.children = nodes.filter(Boolean)
      this.textContent = ''
    }),
    appendChild: jest.fn(function (this: MockElement, node: MockElement) {
      this.children.push(node)
    }),
    ownerDocument: {
      createElement: jest.fn(
        (tag: string): MockElement => ({
          tagName: tag,
          children: [],
          appendChild: jest.fn(function (this: MockElement, node: MockElement) {
            this.children.push(node)
          })
        })
      )
    }
  }
  return el
}

describe('createJsonOutputRenderer', () => {
  let mockOutputElement: MockElement
  let mockJsonviewApi: MockJsonviewApi

  beforeEach(() => {
    jest.useFakeTimers()
    mockOutputElement = createMockOutputElement()
    mockJsonviewApi = createMockJsonviewApi()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns renderData, updateData, renderMessage, and dispose', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )
    expect(typeof renderer.renderData).toBe('function')
    expect(typeof renderer.updateData).toBe('function')
    expect(typeof renderer.renderMessage).toBe('function')
    expect(typeof renderer.dispose).toBe('function')
  })

  it('renderData creates and renders tree immediately', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )
    const data = { foo: 'bar' }

    renderer.renderData(data)

    expect(mockJsonviewApi.create).toHaveBeenCalledTimes(1)
    expect(mockJsonviewApi.render).toHaveBeenCalledTimes(1)
    expect(mockJsonviewApi.create).toHaveBeenCalledWith(
      data,
      expect.any(Object)
    )
    expect(mockOutputElement.replaceChildren).toHaveBeenCalled()
  })

  it('updateData schedules a render via setTimeout fallback', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )
    const data = { a: 1 }

    renderer.updateData(data)

    expect(mockJsonviewApi.create).not.toHaveBeenCalled()

    jest.advanceTimersByTime(0)

    expect(mockJsonviewApi.create).toHaveBeenCalledTimes(1)
    expect(mockJsonviewApi.create).toHaveBeenCalledWith(
      data,
      expect.any(Object)
    )
  })

  it('multiple updateData calls coalesce into a single render with the latest data', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )

    renderer.updateData({ version: 1 })
    renderer.updateData({ version: 2 })
    renderer.updateData({ version: 3 })

    expect(mockJsonviewApi.create).not.toHaveBeenCalled()

    jest.advanceTimersByTime(0)

    expect(mockJsonviewApi.create).toHaveBeenCalledTimes(1)
    expect(mockJsonviewApi.create).toHaveBeenCalledWith(
      { version: 3 },
      expect.any(Object)
    )
  })

  it('renderMessage destroys tree and shows text', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )

    renderer.renderData({ initial: true })
    expect(mockJsonviewApi.create).toHaveBeenCalledTimes(1)

    renderer.renderMessage('Loading...')

    expect(mockJsonviewApi.destroy).toHaveBeenCalledTimes(1)
    expect(mockOutputElement.textContent).toBe('Loading...')
  })

  it('dispose destroys tree, clears container, and cancels pending scheduled frame', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )

    renderer.renderData({ initial: true })
    expect(mockJsonviewApi.create).toHaveBeenCalledTimes(1)

    renderer.updateData({ pending: true })

    renderer.dispose()

    expect(mockJsonviewApi.destroy).toHaveBeenCalledTimes(1)
    expect(mockOutputElement.replaceChildren).toHaveBeenCalled()

    jest.advanceTimersByTime(0)
    expect(mockJsonviewApi.create).toHaveBeenCalledTimes(1)
  })

  it('transition from renderMessage to updateData works correctly', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )

    renderer.renderMessage('Loading...')
    expect(mockOutputElement.textContent).toBe('Loading...')

    renderer.updateData({ loaded: true })
    jest.advanceTimersByTime(0)

    expect(mockOutputElement.textContent).toBe('')
    expect(mockJsonviewApi.create).toHaveBeenCalledTimes(1)
    expect(mockJsonviewApi.create).toHaveBeenCalledWith(
      { loaded: true },
      expect.any(Object)
    )
  })

  it('renderMessage cancels pending updateData frame', () => {
    const renderer = createJsonOutputRenderer(
      mockOutputElement,
      mockJsonviewApi as unknown as Record<string, unknown>
    )

    renderer.updateData({ pending: true })

    renderer.renderMessage('Loading...')
    expect(mockOutputElement.textContent).toBe('Loading...')

    jest.advanceTimersByTime(0)

    expect(mockJsonviewApi.create).not.toHaveBeenCalled()
  })
})
