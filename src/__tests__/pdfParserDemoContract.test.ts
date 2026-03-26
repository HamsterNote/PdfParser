import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PdfParser } from '@PdfParser'
import { beforeAll, describe, expect, it } from '@jest/globals'

interface ContractSummary {
  fixtureIdentity: {
    source: string
    titlePresent: boolean
    idPresent: boolean
  }
  pageCount: number
  hasOutline: boolean
  firstPagePreview: string
  accessors: {
    hasGetOutlineMethod: boolean
    getCoverCallable: boolean
    firstPageResolved: boolean
    invalidPageReturnsUndefined: boolean
  }
}

interface TextContentLike {
  content: string
}

interface PageLike {
  texts?: TextContentLike[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturePath = path.resolve(__dirname, 'test_github.pdf')

const normalizeText = (texts: TextContentLike[] = []): string =>
  texts
    .map((text) => text.content)
    .join(' ')
    .replace(/\s+/g, '')
    .toLowerCase()

const buildFirstPagePreview = (normalizedText: string): string => {
  const tokens: string[] = []

  if (normalizedText.includes('z.x')) tokens.push('Z.X')
  if (normalizedText.includes('wszxdhr')) tokens.push('wszxdhr')
  if (normalizedText.includes('job@z-x.vip')) tokens.push('job@z-x.vip')

  return tokens.join(' | ')
}

const buildContractSummary = async (): Promise<{
  summary: ContractSummary
  page: PageLike
  normalizedFirstPageText: string
}> => {
  const buffer = await readFile(fixturePath)
  const pdfBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
  const document = await PdfParser.encode(pdfBuffer)

  expect(document).toBeDefined()

  const firstPage = await document?.getPageByPageNumber(1)
  const invalidPage = await document?.getPageByPageNumber(999)
  const outline = document?.getOutline()
  const normalizedFirstPageText = normalizeText(firstPage?.texts)
  const summary: ContractSummary = {
    fixtureIdentity: {
      source: 'src/__tests__/test_github.pdf',
      titlePresent:
        typeof document?.title === 'string' && document.title.trim().length > 0,
      idPresent:
        typeof document?.id === 'string' && document.id.trim().length > 0
    },
    pageCount: document?.pageCount ?? 0,
    hasOutline: Array.isArray(outline) && outline.length > 0,
    firstPagePreview: buildFirstPagePreview(normalizedFirstPageText),
    accessors: {
      hasGetOutlineMethod: typeof document?.getOutline === 'function',
      getCoverCallable: typeof document?.getCover === 'function',
      firstPageResolved: firstPage !== undefined,
      invalidPageReturnsUndefined:
        typeof document?.getPageByPageNumber === 'function' &&
        invalidPage === undefined
    }
  }

  return {
    summary,
    page: firstPage ?? {},
    normalizedFirstPageText
  }
}

describe('PdfParser demo encode contract', () => {
  let summary: ContractSummary
  let firstPage: PageLike
  let normalizedFirstPageText: string

  beforeAll(async () => {
    const result = await buildContractSummary()
    summary = result.summary
    firstPage = result.page
    normalizedFirstPageText = result.normalizedFirstPageText
  }, 30000)

  it('锁定 demo 依赖的稳定 encode 字段', async () => {
    expect(summary.fixtureIdentity.titlePresent).toBe(true)
    expect(summary.fixtureIdentity.idPresent).toBe(true)
    expect(summary.pageCount).toBe(4)
    expect(summary.accessors.hasGetOutlineMethod).toBe(true)
    expect(summary.accessors.getCoverCallable).toBe(true)
    expect(summary.accessors.firstPageResolved).toBe(true)
    expect(summary.accessors.invalidPageReturnsUndefined).toBe(true)
    expect(firstPage.texts).toBeDefined()

    const hasStableName =
      normalizedFirstPageText.includes('z.x') ||
      normalizedFirstPageText.includes('wszxdhr')

    expect(hasStableName).toBe(true)
    expect(normalizedFirstPageText.includes('job@z-x.vip')).toBe(true)
  })

  it('稳定摘要字段应匹配 demo 合同', () => {
    expect(summary.fixtureIdentity.source).toBe('src/__tests__/test_github.pdf')
    expect(summary.pageCount).toBe(4)
    expect(summary.accessors.invalidPageReturnsUndefined).toBe(true)
    expect(summary.firstPagePreview).toContain('Z.X')
    expect(summary.firstPagePreview).toContain('wszxdhr')
    expect(summary.firstPagePreview).toContain('job@z-x.vip')
  })
})
