import { describe, it, expect } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import type { PageViewport } from 'pdfjs-dist'
import { Util } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

jest.mock(
  'pdfjs-dist',
  () => ({
    __esModule: true,
    Util: {
      transform: (m1: readonly number[], m2: readonly number[]): number[] => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ]
    },
    getDocument: jest.fn(() => ({
      promise: Promise.reject(new Error('getDocument is mocked for tests'))
    }))
  }),
  { virtual: true }
)

describe('PdfParser transformToViewport', () => {
  const transformToViewport = (
    PdfParser as unknown as {
      transformToViewport: (
        transform: TextItem['transform'],
        viewport: Pick<PageViewport, 'height' | 'transform'>
      ) => { x: number; y: number }
    }
  ).transformToViewport.bind(PdfParser)

  describe('正常坐标转换', () => {
    it('应该正确转换基础坐标', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }
      const transform: number[] = [10, 0, 0, -10, 50, 380]

      const result = transformToViewport(transform, viewport)
      const expected = Util.transform(viewport.transform, transform)

      expect(result.x).toBe(expected[4])
      expect(result.y).toBe(expected[5])
    })

    it('应该处理零坐标', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }
      const transform: number[] = [1, 0, 0, 1, 0, 0]

      const result = transformToViewport(transform, viewport)

      expect(result.x).toBe(0)
      expect(result.y).toBe(400)
    })

    it('应该正确应用缩放变换', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 800,
        transform: [2, 0, 0, -2, 0, 800]
      }
      const transform: number[] = [12, 0, 0, 12, 100, 600]

      const result = transformToViewport(transform, viewport)

      expect(result.x).toBe(200)
      expect(result.y).toBe(-400)
    })
  })

  describe('边界值处理', () => {
    it('应该处理包含 Infinity 的变换矩阵', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }
      const transform: number[] = [1, 0, 0, 1, Infinity, -Infinity]

      const result = transformToViewport(transform, viewport)

      // Infinity 应该被返回为 0（通过 Number.isFinite 检查）
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('应该处理包含 NaN 的变换矩阵', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }
      const transform: number[] = [1, 0, 0, 1, NaN, 100]

      const result = transformToViewport(transform, viewport)

      // NaN 会传播到最终结果，所以 x 和 y 都不是有限数
      // Number.isFinite(NaN) === false, 所以都返回 0
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('应该处理负数坐标', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }
      const transform: number[] = [1, 0, 0, 1, -50, -100]

      const result = transformToViewport(transform, viewport)

      // x = 1*(-50) + 0*0 + 0 = -50
      // y = 0*(-50) + (-1)*(-100) + 400 = 500
      expect(result.x).toBe(-50)
      expect(result.y).toBe(500)
    })
  })

  describe('默认矩阵处理', () => {
    it('当 transform 为 undefined 时应该使用默认单位矩阵', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }

      const result = transformToViewport(undefined, viewport)

      // 默认矩阵 [1, 0, 0, 1, 0, 0]
      expect(result.x).toBe(0)
      expect(result.y).toBe(400)
    })

    it('当 transform 为非数组时应该使用默认单位矩阵', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }

      // @ts-expect-error 测试非数组输入
      const result = transformToViewport(null, viewport)

      expect(result.x).toBe(0)
      expect(result.y).toBe(400)
    })
  })

  describe('变换组合', () => {
    it('应该正确组合 viewport 和文本变换矩阵', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 1000,
        transform: [2, 0, 0, -2, 50, 1000]
      }
      const transform: number[] = [3, 0, 0, 3, 100, 800]

      const result = transformToViewport(transform, viewport)

      // 实际矩阵变换结果
      // x = 2*100 + 50 = 250
      // y = -2*800 + 1000 = -600
      expect(result.x).toBe(250)
      expect(result.y).toBe(-600)
    })

    it('应该处理旋转变换', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1, 0, 0, -1, 0, 400]
      }
      // 90度旋转矩阵
      const transform: number[] = [0, 1, -1, 0, 200, 200]

      const result = transformToViewport(transform, viewport)

      // x = 1*200 + 0*200 + 0 = 200
      // y = 0*200 + (-1)*200 + 400 = 200
      expect(result.x).toBe(200)
      expect(result.y).toBe(200)
    })
  })

  describe('不同 viewport 配置', () => {
    it('应该处理不同的 viewport 高度', () => {
      const heights = [100, 500, 1000, 2000]

      for (const height of heights) {
        const viewport: Pick<PageViewport, 'height' | 'transform'> = {
          height,
          transform: [1, 0, 0, -1, 0, height]
        }
        const transform: number[] = [1, 0, 0, 1, 100, 50]

        const result = transformToViewport(transform, viewport)

        expect(result.x).toBe(100)
        expect(result.y).toBe(height - 50)
      }
    })

    it('应该处理不同的 viewport 变换', () => {
      const viewport: Pick<PageViewport, 'height' | 'transform'> = {
        height: 400,
        transform: [1.5, 0, 0, -1.5, 10, 410]
      }
      const transform: number[] = [2, 0, 0, 2, 50, 100]

      const result = transformToViewport(transform, viewport)

      // x = 1.5*50 + 10 = 85
      // y = -1.5*100 + 410 = 260
      expect(result.x).toBe(85)
      expect(result.y).toBe(260)
    })
  })
})
