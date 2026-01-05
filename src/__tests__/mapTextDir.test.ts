import { describe, it, expect, jest } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import { TextDir } from '@hamster-note/types'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

jest.mock(
  'pdfjs-dist',
  () => ({
    __esModule: true,
    getDocument: jest.fn(() => ({
      promise: Promise.reject(new Error('getDocument is mocked for tests'))
    }))
  }),
  { virtual: true }
)

describe('PdfParser mapTextDir', () => {
  const mapTextDir = (
    PdfParser as unknown as {
      mapTextDir: (dir: TextItem['dir']) => TextDir
    }
  ).mapTextDir.bind(PdfParser)

  describe('文本方向映射', () => {
    it('应该将 ltr 映射为 TextDir.LTR', () => {
      const result = mapTextDir('ltr')
      expect(result).toBe(TextDir.LTR)
    })

    it('应该将 rtl 映射为 TextDir.RTL', () => {
      const result = mapTextDir('rtl')
      expect(result).toBe(TextDir.RTL)
    })

    it('应该将 ttb 映射为 TextDir.TTB', () => {
      const result = mapTextDir('ttb')
      expect(result).toBe(TextDir.TTB)
    })

    it('应该将 undefined 映射为默认的 TextDir.LTR', () => {
      const result = mapTextDir(undefined as unknown as string)
      expect(result).toBe(TextDir.LTR)
    })

    it('应该将 null 映射为默认的 TextDir.LTR', () => {
      const result = mapTextDir(null as unknown as string)
      expect(result).toBe(TextDir.LTR)
    })

    it('应该将空字符串映射为默认的 TextDir.LTR', () => {
      const result = mapTextDir('')
      expect(result).toBe(TextDir.LTR)
    })

    it('应该将任何无效值映射为默认的 TextDir.LTR', () => {
      expect(mapTextDir('invalid')).toBe(TextDir.LTR)
      expect(mapTextDir('btt')).toBe(TextDir.LTR)
      expect(mapTextDir(123 as unknown as string)).toBe(TextDir.LTR)
    })
  })

  describe('国际文本方向', () => {
    it('应该正确处理阿拉伯语 RTL 方向', () => {
      const result = mapTextDir('rtl')
      expect(result).toBe(TextDir.RTL)
      expect(result).not.toBe(TextDir.LTR)
      expect(result).not.toBe(TextDir.TTB)
    })

    it('应该正确处理中文/日文垂直书写方向', () => {
      const result = mapTextDir('ttb')
      expect(result).toBe(TextDir.TTB)
      expect(result).not.toBe(TextDir.LTR)
      expect(result).not.toBe(TextDir.RTL)
    })

    it('应该正确处理英语 LTR 方向', () => {
      const result = mapTextDir('ltr')
      expect(result).toBe(TextDir.LTR)
      expect(result).not.toBe(TextDir.RTL)
      expect(result).not.toBe(TextDir.TTB)
    })
  })

  describe('边界情况', () => {
    it('应该处理大小写混合的输入', () => {
      expect(mapTextDir('LTR')).toBe(TextDir.LTR)
      expect(mapTextDir('Rtl')).toBe(TextDir.LTR)
      expect(mapTextDir('TTB')).toBe(TextDir.LTR)
    })

    it('应该处理带空格的输入', () => {
      expect(mapTextDir(' ltr ')).toBe(TextDir.LTR)
    })
  })
})
