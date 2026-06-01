import { describe, expect, it } from '@jest/globals'
import { PdfParser, type RawImageData } from '../pdfParser'

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function convert(rawImageData: RawImageData): string | undefined {
  return PdfParser.convertRawImageToDataUrl(rawImageData)
}

function decodePngDataUrl(dataUrl: string): Uint8Array {
  expect(dataUrl).toMatch(/^data:image\/png;base64,/)
  const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length)
  expect(base64.length).toBeGreaterThan(0)
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

function expectValidPngDataUrl(dataUrl: string | undefined): Uint8Array {
  expect(dataUrl).toEqual(expect.stringContaining(PNG_DATA_URL_PREFIX))
  const decoded = decodePngDataUrl(dataUrl as string)
  expect(decoded.length).toBeGreaterThan(PNG_SIGNATURE.length)
  expect(Array.from(decoded.slice(0, PNG_SIGNATURE.length))).toEqual(
    PNG_SIGNATURE
  )
  return decoded
}

describe('convertRawImageToDataUrl', () => {
  it('converts RGBA 2x1 raw image data to a PNG data URL', () => {
    const result = convert({
      data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]),
      width: 2,
      height: 1,
      kind: 3
    })

    expectValidPngDataUrl(result)
  })

  it('converts RGB 2x1 raw image data to a PNG data URL', () => {
    const result = convert({
      data: new Uint8Array([255, 0, 0, 0, 255, 0]),
      width: 2,
      height: 1,
      kind: 2
    })

    expectValidPngDataUrl(result)
  })

  it('returns undefined for unsupported or empty data', () => {
    expect(
      convert({
        data: new Uint8Array([1, 2, 3]),
        width: 1,
        height: 1,
        kind: 99
      })
    ).toBeUndefined()
    expect(
      convert({
        data: new Uint8Array(),
        width: 1,
        height: 1,
        kind: 3
      })
    ).toBeUndefined()
  })
})
