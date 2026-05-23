import { describe, expect, it, jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import { OPS } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api'

type ImageExtractionRecord = {
  id: string
  width: number
  height: number
  polygon: [
    [number, number],
    [number, number],
    [number, number],
    [number, number]
  ]
  opacity: number
  src?: string
  rawImageData?: {
    data: Uint8Array
    width: number
    height: number
    kind: number
  }
  warnings: Array<{
    type: 'unsupported'
    operator: string
    page: number
    objectId?: string
    message: string
  }>
}

type PdfObjectGetter = (
  objectId: string,
  callback: (value: unknown) => void
) => unknown

type MockPdfPage = PDFPageProxy & {
  objs: {
    get: jest.MockedFunction<PdfObjectGetter>
  }
}

const extractImagesFromPage = (
  page: PDFPageProxy,
  pdfId = 'pdf-id',
  pageNumber = 1,
  timeoutMs = 100
): Promise<ImageExtractionRecord[]> => {
  return (
    PdfParser as unknown as {
      extractImagesFromPage: (
        page: PDFPageProxy,
        pdfId: string,
        pageNumber: number,
        timeoutMs?: number
      ) => Promise<ImageExtractionRecord[]>
    }
  ).extractImagesFromPage(page, pdfId, pageNumber, timeoutMs)
}

function createMockPage(
  fnArray: number[],
  argsArray: unknown[],
  objects: Record<string, unknown> = {}
): MockPdfPage {
  const objectGetter = jest.fn<PdfObjectGetter>((objectId, callback) => {
    callback(objects[objectId])
    return undefined
  })

  return {
    getOperatorList: jest.fn(async () => ({ fnArray, argsArray })),
    getViewport: jest.fn(() => ({
      width: 100,
      height: 100,
      transform: [1, 0, 0, 1, 0, 0]
    })),
    objs: {
      get: objectGetter
    }
  } as unknown as MockPdfPage
}

describe('extractImagesFromPage', () => {
  it('resolves paintImageXObject data and polygon in operator order', async () => {
    const rawImageData = {
      data: new Uint8ClampedArray([1, 2, 3, 4]),
      width: 2,
      height: 1,
      kind: 3
    }
    const page = createMockPage(
      [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
      [[], [20, 0, 0, 10, 5, 7], ['img1'], []],
      { img1: rawImageData }
    )

    const result = await extractImagesFromPage(page, 'pdf-a', 3)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'pdf-a-page-3-image-2',
      width: 2,
      height: 1,
      polygon: [
        [5, 7],
        [25, 7],
        [25, 17],
        [5, 17]
      ],
      opacity: 1,
      warnings: []
    })
    expect(result[0].src).toBeUndefined()
    expect(result[0].rawImageData).toEqual({
      data: new Uint8Array([1, 2, 3, 4]),
      width: 2,
      height: 1,
      kind: 3
    })
    expect(result[0].rawImageData?.data).toBeInstanceOf(Uint8Array)
    expect(page.objs.get).toHaveBeenCalledTimes(1)
    expect(page.objs.get.mock.calls[0][0]).toBe('img1')
    expect(typeof page.objs.get.mock.calls[0][1]).toBe('function')
  })

  it('returns deterministic warnings for unsupported mask and pattern operators', async () => {
    const page = createMockPage(
      [OPS.paintImageMaskXObject, OPS.setFillColorN],
      [['mask1'], ['pattern-name']]
    )

    const result = await extractImagesFromPage(page)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'pdf-id-page-1-image-0',
      width: 0,
      height: 0,
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
      ],
      opacity: 1,
      warnings: [
        {
          type: 'unsupported',
          operator: 'paintImageMaskXObject',
          page: 1,
          objectId: 'mask1',
          message: '图片 mask XObject 需要专门解码，当前 spike 仅记录警告'
        }
      ]
    })
    expect(result[1].warnings).toEqual([
      {
        type: 'unsupported',
        operator: 'setFillColorN',
        page: 1,
        message: 'pattern/高级填充颜色空间暂未展开为图片，当前 spike 仅记录警告'
      }
    ])
    expect(page.objs.get).not.toHaveBeenCalled()
  })

  it('returns stable unsupported warnings for form, repeat, bitmap and soft-mask operators', async () => {
    const page = createMockPage(
      [
        OPS.paintXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintSolidColorImageMask,
        OPS.setGState
      ],
      [['form-xobject'], ['repeat-image'], [], [['SMask', 'soft-mask']]]
    )

    const result = await extractImagesFromPage(page, 'pdf-b', 2)

    expect(result).toHaveLength(4)
    expect(result.map((record) => record.warnings[0])).toEqual([
      {
        type: 'unsupported',
        operator: 'paintXObject',
        page: 2,
        objectId: 'form-xobject',
        message:
          '通用 XObject/Form XObject 内容暂未递归展开，当前 spike 仅记录警告'
      },
      {
        type: 'unsupported',
        operator: 'paintImageXObjectRepeat',
        page: 2,
        objectId: 'repeat-image',
        message:
          '重复图片 XObject 需要展开每个 placement，当前 spike 仅记录警告'
      },
      {
        type: 'unsupported',
        operator: 'paintSolidColorImageMask',
        page: 2,
        message: 'solid color image mask 暂未映射为图片，当前 spike 仅记录警告'
      },
      {
        type: 'unsupported',
        operator: 'setGState',
        page: 2,
        message: 'SMask/soft mask 会影响图片透明度，当前 spike 仅记录警告'
      }
    ])
    expect(page.objs.get).not.toHaveBeenCalled()
  })
})
