import { describe, expect, it } from '@jest/globals'
import type { PDFFont } from 'pdf-lib'
import { PdfParser } from '@PdfParser'

type InternalDecodeFont = {
  font: PDFFont
  role: 'custom' | 'standard'
  supportedCodePoints: Set<number>
}

const selectFontRunForCharacter = (
  character: string,
  fonts: InternalDecodeFont[]
):
  | {
      content: string
      font: PDFFont
    }
  | undefined => {
  return (
    PdfParser as unknown as {
      selectFontRunForCharacter: (
        character: string,
        decodeFontSet: {
          fonts: InternalDecodeFont[]
          replacementCharacter: string
        }
      ) =>
        | {
            content: string
            font: PDFFont
          }
        | undefined
    }
  ).selectFontRunForCharacter(character, {
    fonts,
    replacementCharacter: '?'
  })
}

describe('decode font fallback', () => {
  it('ASCII 字符在双字体都支持时应优先选择标准字体', () => {
    const customFont = { name: 'custom' } as unknown as PDFFont
    const standardFont = { name: 'standard' } as unknown as PDFFont

    const result = selectFontRunForCharacter('A', [
      {
        font: customFont,
        role: 'custom',
        supportedCodePoints: new Set([65, 20013])
      },
      {
        font: standardFont,
        role: 'standard',
        supportedCodePoints: new Set([65, 66, 67])
      }
    ])

    expect(result?.content).toBe('A')
    expect(result?.font).toBe(standardFont)
  })

  it('非 ASCII 字符应优先选择自定义字体', () => {
    const customFont = { name: 'custom' } as unknown as PDFFont
    const standardFont = { name: 'standard' } as unknown as PDFFont

    const result = selectFontRunForCharacter('中', [
      {
        font: customFont,
        role: 'custom',
        supportedCodePoints: new Set([20013])
      },
      {
        font: standardFont,
        role: 'standard',
        supportedCodePoints: new Set([63])
      }
    ])

    expect(result?.content).toBe('中')
    expect(result?.font).toBe(customFont)
  })

  it('多个自定义字体时应匹配后续支持的中文字体', () => {
    const firstCustomFont = { name: 'custom-1' } as unknown as PDFFont
    const secondCustomFont = { name: 'custom-2' } as unknown as PDFFont
    const standardFont = { name: 'standard' } as unknown as PDFFont

    const result = selectFontRunForCharacter('汉', [
      {
        font: firstCustomFont,
        role: 'custom',
        supportedCodePoints: new Set([20013])
      },
      {
        font: secondCustomFont,
        role: 'custom',
        supportedCodePoints: new Set([27721])
      },
      {
        font: standardFont,
        role: 'standard',
        supportedCodePoints: new Set([63])
      }
    ])

    expect(result?.content).toBe('汉')
    expect(result?.font).toBe(secondCustomFont)
  })
})
