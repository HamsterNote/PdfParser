import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { PdfParser } = await import('../dist/index.js')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURE_PATH = path.resolve(__dirname, '../src/__tests__/test_github.pdf')
const REPORT_DIR = path.resolve(
  __dirname,
  '..',
  process.env.PDF_PARSER_TEST_REPORT_DIR ?? 'test-results'
)
const REPORT_PATH = path.join(REPORT_DIR, 'roundtrip-report.json')

const ROUNDTRIP_THRESHOLDS = {
  pageTokenRetentionMin: 0.45,
  overallTokenRetentionMin: 0.6,
  pageTextLengthRatioMin: 0.3,
  pageSizeDeltaMax: 1
}

const EXPECTED_PAGE_KEYWORDS = [
  {
    pageNumber: 1,
    requiredMatches: 4,
    keywordGroups: [
      ['z.x', 'wszxdhr'],
      ['job@z-x.vip'],
      ['followers', 'follower'],
      ['following'],
      ['repositories', 'repository']
    ]
  },
  {
    pageNumber: 2,
    requiredMatches: 2,
    keywordGroups: [
      ['activity'],
      ['commits'],
      ['repositories', 'repository'],
      ['pinned']
    ]
  },
  {
    pageNumber: 3,
    requiredMatches: 2,
    keywordGroups: [
      ['contribution'],
      ['homepage', '个人主页'],
      ['public'],
      ['javascript', 'vue']
    ]
  }
]

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
}

function normalizeText(value) {
  return value.replace(/\s+/g, '').toLowerCase()
}

function extractUniqueTokens(value) {
  const matches = value.match(/\p{Script=Han}+|[\p{L}\p{N}@._/-]+/gu) ?? []
  return [
    ...new Set(matches.map((token) => token.toLowerCase()).filter(Boolean))
  ]
}

function ratio(numerator, denominator) {
  if (denominator <= 0) {
    return 1
  }

  return numerator / denominator
}

function clampNumber(value) {
  return Number(value.toFixed(4))
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function summarizeDocument(document) {
  const pages = []
  const allTokens = new Set()
  let totalTextCount = 0
  let totalNormalizedTextLength = 0

  for (let pageNumber = 1; pageNumber <= document.pageCount; pageNumber += 1) {
    const page = await document.getPageByPageNumber(pageNumber)
    const size = document.getPageSizeByPageNumber(pageNumber)
    const texts = Array.isArray(page?.texts) ? page.texts : []
    const rawText = texts
      .map((text) => (typeof text?.content === 'string' ? text.content : ''))
      .filter(Boolean)
      .join(' ')
    const normalizedText = normalizeText(rawText)
    const uniqueTokens = extractUniqueTokens(rawText)

    for (const token of uniqueTokens) {
      allTokens.add(token)
    }

    totalTextCount += texts.length
    totalNormalizedTextLength += normalizedText.length

    pages.push({
      pageNumber,
      width: Number(size?.x ?? 0),
      height: Number(size?.y ?? 0),
      textCount: texts.length,
      normalizedText,
      normalizedTextLength: normalizedText.length,
      normalizedTextHash: hashText(normalizedText),
      uniqueTokens,
      previewText: rawText.slice(0, 160)
    })
  }

  return {
    pageCount: document.pageCount,
    totalTextCount,
    totalNormalizedTextLength,
    uniqueTokenCount: allTokens.size,
    pages
  }
}

function compareDocuments(originalSummary, roundTripSummary) {
  const pageComparisons = originalSummary.pages.map((originalPage) => {
    const roundTripPage = roundTripSummary.pages.find(
      (item) => item.pageNumber === originalPage.pageNumber
    )

    if (!roundTripPage) {
      return {
        pageNumber: originalPage.pageNumber,
        missing: true,
        tokenRetention: 0,
        textLengthRatio: 0,
        textCountRatio: 0,
        widthDelta: Number.POSITIVE_INFINITY,
        heightDelta: Number.POSITIVE_INFINITY
      }
    }

    const roundTripTokens = new Set(roundTripPage.uniqueTokens)
    const retainedTokens = originalPage.uniqueTokens.filter((token) =>
      roundTripTokens.has(token)
    )

    return {
      pageNumber: originalPage.pageNumber,
      missing: false,
      tokenRetention: clampNumber(
        ratio(retainedTokens.length, originalPage.uniqueTokens.length)
      ),
      textLengthRatio: clampNumber(
        ratio(
          roundTripPage.normalizedTextLength,
          originalPage.normalizedTextLength
        )
      ),
      textCountRatio: clampNumber(
        ratio(roundTripPage.textCount, originalPage.textCount)
      ),
      widthDelta: clampNumber(
        Math.abs(roundTripPage.width - originalPage.width)
      ),
      heightDelta: clampNumber(
        Math.abs(roundTripPage.height - originalPage.height)
      ),
      retainedTokenCount: retainedTokens.length,
      originalTokenCount: originalPage.uniqueTokens.length,
      roundTripTokenCount: roundTripPage.uniqueTokens.length
    }
  })

  const originalAllTokens = new Set(
    originalSummary.pages.flatMap((page) => page.uniqueTokens)
  )
  const roundTripAllTokens = new Set(
    roundTripSummary.pages.flatMap((page) => page.uniqueTokens)
  )
  const retainedAllTokens = [...originalAllTokens].filter((token) =>
    roundTripAllTokens.has(token)
  )

  return {
    pageCountEqual: originalSummary.pageCount === roundTripSummary.pageCount,
    overallTokenRetention: clampNumber(
      ratio(retainedAllTokens.length, originalAllTokens.size)
    ),
    overallTextLengthRatio: clampNumber(
      ratio(
        roundTripSummary.totalNormalizedTextLength,
        originalSummary.totalNormalizedTextLength
      )
    ),
    overallTextCountRatio: clampNumber(
      ratio(roundTripSummary.totalTextCount, originalSummary.totalTextCount)
    ),
    pageComparisons
  }
}

function evaluateKeywordGroups(summary) {
  return EXPECTED_PAGE_KEYWORDS.map((pageExpectation) => {
    const page = summary.pages.find(
      (item) => item.pageNumber === pageExpectation.pageNumber
    )
    const normalizedText = page?.normalizedText ?? ''
    const matchedGroups = pageExpectation.keywordGroups.filter((group) =>
      group.some((keyword) => normalizedText.includes(normalizeText(keyword)))
    )

    return {
      pageNumber: pageExpectation.pageNumber,
      requiredMatches: pageExpectation.requiredMatches,
      matchedCount: matchedGroups.length,
      passed: matchedGroups.length >= pageExpectation.requiredMatches,
      matchedGroups
    }
  })
}

function validateComparison(comparison) {
  const failures = []

  if (!comparison.pageCountEqual) {
    failures.push('roundtrip 后页数发生变化')
  }

  if (
    comparison.overallTokenRetention <
    ROUNDTRIP_THRESHOLDS.overallTokenRetentionMin
  ) {
    failures.push(`整体 token 保留率过低：${comparison.overallTokenRetention}`)
  }

  for (const pageComparison of comparison.pageComparisons) {
    if (pageComparison.missing) {
      failures.push(`缺少第 ${pageComparison.pageNumber} 页 roundtrip 结果`)
      continue
    }

    if (
      pageComparison.tokenRetention < ROUNDTRIP_THRESHOLDS.pageTokenRetentionMin
    ) {
      failures.push(
        `第 ${pageComparison.pageNumber} 页 token 保留率过低：${pageComparison.tokenRetention}`
      )
    }

    if (
      pageComparison.textLengthRatio <
      ROUNDTRIP_THRESHOLDS.pageTextLengthRatioMin
    ) {
      failures.push(
        `第 ${pageComparison.pageNumber} 页文本长度比例过低：${pageComparison.textLengthRatio}`
      )
    }

    if (pageComparison.widthDelta > ROUNDTRIP_THRESHOLDS.pageSizeDeltaMax) {
      failures.push(
        `第 ${pageComparison.pageNumber} 页宽度漂移过大：${pageComparison.widthDelta}`
      )
    }

    if (pageComparison.heightDelta > ROUNDTRIP_THRESHOLDS.pageSizeDeltaMax) {
      failures.push(
        `第 ${pageComparison.pageNumber} 页高度漂移过大：${pageComparison.heightDelta}`
      )
    }
  }

  return failures
}

function validateKeywordChecks(label, checks) {
  return checks
    .filter((keywordCheck) => !keywordCheck.passed)
    .map(
      (keywordCheck) =>
        `${label} 第 ${keywordCheck.pageNumber} 页未命中足够关键字分组`
    )
}

function assertReport(report) {
  const failures = [
    ...validateComparison(report.comparison),
    ...validateKeywordChecks('原始 fixture', report.keywordChecks.original),
    ...validateKeywordChecks('roundtrip', report.keywordChecks.roundTrip)
  ]

  if (failures.length > 0) {
    throw new Error(failures.join('\n'))
  }
}

const fixtureBuffer = await readFile(FIXTURE_PATH)
const originalInput = toArrayBuffer(fixtureBuffer)
const originalDocument = await PdfParser.encode(originalInput)
const decodedBuffer = await PdfParser.decode(originalDocument)

if (!(decodedBuffer instanceof ArrayBuffer) || decodedBuffer.byteLength === 0) {
  throw new Error('roundtrip decode 没有返回有效 PDF 二进制')
}

const roundTripDocument = await PdfParser.encode(decodedBuffer)
const originalSummary = await summarizeDocument(originalDocument)
const roundTripSummary = await summarizeDocument(roundTripDocument)

const report = {
  fixturePath: path.relative(path.resolve(__dirname, '..'), FIXTURE_PATH),
  generatedAt: new Date().toISOString(),
  decodedPdfHeader: Array.from(new Uint8Array(decodedBuffer).subarray(0, 4)),
  thresholds: ROUNDTRIP_THRESHOLDS,
  originalSummary,
  roundTripSummary,
  comparison: compareDocuments(originalSummary, roundTripSummary),
  keywordChecks: {
    original: evaluateKeywordGroups(originalSummary),
    roundTrip: evaluateKeywordGroups(roundTripSummary)
  }
}

await mkdir(REPORT_DIR, { recursive: true })
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

assertReport(report)

console.log('SUCCESS: roundtrip regression verification passed')
console.log(`Report written to: ${REPORT_PATH}`)
