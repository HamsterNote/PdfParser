import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import {
  degrees,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts
} from 'pdf-lib'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DIST_ENTRY = path.resolve(SCRIPT_DIR, '../dist/index.js')
const FIXTURE_DIR = path.join(SCRIPT_DIR, '.fixtures')
const RUNS_PER_CONFIG = 5
const SCAN_CONCURRENCIES = [1, 4]
const PAGE_SCAN_BATCH_SIZE = 8
const E2E_MIN_BYTES = 20 * 1024 * 1024
const EVIDENCE_JSON = 'task-1-pdf-streaming-load.json'
const EVIDENCE_LOG = 'task-1-pdf-streaming-load.log'
let pdfjsModulePromise

const FIXTURES = [
  { name: 'simple-300p', fileName: 'simple-300p.pdf', gateEligible: true },
  { name: 'mixed-300p', fileName: 'mixed-300p.pdf', gateEligible: true },
  { name: 'heavy-100p', fileName: 'heavy-100p.pdf', gateEligible: true },
  { name: 'outline', fileName: 'outline.pdf', gateEligible: false }
]

function parseArguments(argv) {
  const parsed = {
    evidenceDir: undefined,
    emitE2eDir: undefined,
    child: undefined
  }
  const remaining = [...argv]
  while (remaining.length > 0) {
    const argument = remaining.shift()
    if (argument === '--evidence-dir') {
      parsed.evidenceDir = remaining.shift()
    } else if (argument === '--emit-e2e') {
      parsed.emitE2eDir = remaining.shift()
    } else if (argument === '--child') {
      parsed.child = JSON.parse(remaining.shift())
    } else {
      throw new Error(`未知参数：${argument}`)
    }
  }
  return parsed
}

function assertAbsoluteDirectory(value, flag) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${flag} 必须提供绝对路径`)
  }
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function makePng(width, height, seed) {
  let state = seed >>> 0
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (width * 3 + 1)
    rows[rowStart] = 0
    for (let column = 0; column < width * 3; column += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      rows[rowStart + column + 1] = state >>> 24
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

async function atomicWrite(outputPath, bytes) {
  await mkdir(path.dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp-${process.pid}`
  await rm(temporaryPath, { force: true })
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, outputPath)
}

async function savePdfAtomically(document, outputPath) {
  const bytes = await document.save({ useObjectStreams: false })
  await atomicWrite(outputPath, bytes)
}

async function generateSimpleFixture(outputPath) {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (let pageNumber = 1; pageNumber <= 300; pageNumber += 1) {
    const page = document.addPage([595.28, 841.89])
    page.drawText(`PDF benchmark simple page ${pageNumber}`, {
      x: 48,
      y: 790,
      size: 14,
      font
    })
  }
  await savePdfAtomically(document, outputPath)
}

async function generateMixedFixture(outputPath) {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const sizes = [
    [595.28, 841.89],
    [612, 792],
    [841.89, 595.28]
  ]
  for (let pageNumber = 1; pageNumber <= 300; pageNumber += 1) {
    const size = sizes[(pageNumber - 1) % sizes.length]
    const page = document.addPage(size)
    page.drawText(`PDF benchmark mixed page ${pageNumber}`, {
      x: 36,
      y: size[1] - 48,
      size: 13,
      font,
      rotate: pageNumber % 3 === 0 ? degrees(2) : undefined
    })
  }
  await savePdfAtomically(document, outputPath)
}

async function generateHeavyFixture(outputPath) {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
    const page = document.addPage([612, 792])
    const image = await document.embedPng(makePng(128, 128, 1000 + pageNumber))
    page.drawImage(image, { x: 52, y: 490, width: 320, height: 240 })
    page.drawText(`PDF benchmark heavy page ${pageNumber}`, {
      x: 52,
      y: 460,
      size: 14,
      font
    })
    const resources = page.node.Resources()
    const properties = document.context.obj({})
    for (let resource = 0; resource < 128; resource += 1) {
      properties.set(
        PDFName.of(`BenchResource${resource}`),
        PDFString.of(`page-${pageNumber}-resource-${resource}`)
      )
    }
    resources.set(PDFName.of('Properties'), properties)
  }
  await savePdfAtomically(document, outputPath)
}

function buildOutlinePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R /PageMode /UseOutlines >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Outlines /First 6 0 R /Last 6 0 R /Count 1 >>',
    '<< /Title (Benchmark Outline) /Parent 5 0 R /Dest [3 0 R /Fit] >>'
  ]
  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, 'binary'))
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body, 'binary')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'binary')
}

async function generateMinimalProbe(outputPath) {
  const document = await PDFDocument.create()
  document.addPage([200, 200])
  const bytes = await document.save({ useObjectStreams: false })
  if (bytes.byteLength >= 50 * 1024) {
    throw new Error(`minimal-probe.pdf 超过 50KB：${bytes.byteLength}`)
  }
  await atomicWrite(outputPath, bytes)
}

async function generateBenchmarkFixtures() {
  await rm(FIXTURE_DIR, { recursive: true, force: true })
  await mkdir(FIXTURE_DIR, { recursive: true })
  await generateSimpleFixture(path.join(FIXTURE_DIR, 'simple-300p.pdf'))
  await generateMixedFixture(path.join(FIXTURE_DIR, 'mixed-300p.pdf'))
  await generateHeavyFixture(path.join(FIXTURE_DIR, 'heavy-100p.pdf'))
  await atomicWrite(path.join(FIXTURE_DIR, 'outline.pdf'), buildOutlinePdf())
  await generateMinimalProbe(path.join(FIXTURE_DIR, 'minimal-probe.pdf'))
}

async function generateE2eFixture(outputPath, seed) {
  let imageCount = 7
  while (true) {
    const document = await PDFDocument.create()
    for (let index = 0; index < imageCount; index += 1) {
      const image = await document.embedPng(
        makePng(1024, 1024, seed + index * 7919)
      )
      const page = document.addPage([1024, 1024])
      page.drawImage(image, { x: 0, y: 0, width: 1024, height: 1024 })
    }
    const bytes = await document.save({ useObjectStreams: false })
    if (bytes.byteLength >= E2E_MIN_BYTES) {
      await atomicWrite(outputPath, bytes)
      const fileStat = await stat(outputPath)
      if (fileStat.size < E2E_MIN_BYTES) {
        throw new Error(`${path.basename(outputPath)} 未达到 20MB`)
      }
      return { bytes: fileStat.size, imageCount }
    }
    imageCount += 1
  }
}

async function emitE2eFixtures(outputDirectory) {
  assertAbsoluteDirectory(outputDirectory, '--emit-e2e')
  await mkdir(outputDirectory, { recursive: true })
  const generated = []
  for (const [index, suffix] of ['a', 'b', 'c'].entries()) {
    const outputPath = path.join(outputDirectory, `large-e2e-${suffix}.pdf`)
    const details = await generateE2eFixture(
      outputPath,
      0xabc000 + index * 100003
    )
    const hash = createHash('sha256')
      .update(await readFile(outputPath))
      .digest('hex')
    generated.push({ outputPath, sha256: hash, ...details })
  }
  if (
    new Set(generated.map(({ sha256 }) => sha256)).size !== generated.length
  ) {
    throw new Error('E2E 夹具内容必须互不相同')
  }
  console.log(JSON.stringify({ generated }, null, 2))
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
}

async function openPdf(buffer) {
  pdfjsModulePromise ??= import('../dist/index.js').then(
    () => import('pdfjs-dist')
  )
  const { getDocument } = await pdfjsModulePromise
  const dataCopy = toArrayBuffer(buffer).slice(0)
  const loadingTask = getDocument({ data: new Uint8Array(dataCopy) })
  return { loadingTask, pdf: await loadingTask.promise }
}

async function destroySession(session) {
  await session.loadingTask.destroy()
}

async function scanPages(pdf, concurrency) {
  let nextPage = 1
  const worker = async () => {
    while (nextPage <= pdf.numPages) {
      const pageNumber = nextPage
      nextPage += 1
      const page = await pdf.getPage(pageNumber)
      page.getViewport({ scale: 1 })
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pdf.numPages) }, () => worker())
  )
}

async function runEncodeChild(buffer) {
  const { PdfParser } = await import('../dist/index.js')
  const originalLoad = PdfParser.loadPdfSession
  let sessionOpenCount = 0
  PdfParser.loadPdfSession = async (...argumentsList) => {
    sessionOpenCount += 1
    return originalLoad.apply(PdfParser, argumentsList)
  }
  const startedAt = performance.now()
  try {
    await PdfParser.encode(toArrayBuffer(buffer))
  } finally {
    PdfParser.loadPdfSession = originalLoad
  }
  return { encodeMs: performance.now() - startedAt, sessionOpenCount }
}

async function runSharedChild(buffer, concurrency) {
  const getDocumentStartedAt = performance.now()
  const session = await openPdf(buffer)
  const getDocumentMs = performance.now() - getDocumentStartedAt
  const scanStartedAt = performance.now()
  await scanPages(session.pdf, concurrency)
  const scanMs = performance.now() - scanStartedAt
  const pageCount = session.pdf.numPages
  await destroySession(session)
  return { getDocumentMs, scanMs, pageCount, sessionOpenCount: 1 }
}

async function runRepeatedChild(buffer) {
  const initialSession = await openPdf(buffer)
  const pageCount = initialSession.pdf.numPages
  await destroySession(initialSession)
  const batchCount = Math.ceil(pageCount / PAGE_SCAN_BATCH_SIZE)
  const startedAt = performance.now()
  for (let batch = 0; batch < batchCount; batch += 1) {
    const session = await openPdf(buffer)
    await destroySession(session)
  }
  return {
    repeatedOpenMs: performance.now() - startedAt,
    sessionOpenCount: batchCount,
    sliceCopyCount: batchCount
  }
}

async function runChild(config) {
  const buffer = await readFile(config.fixturePath)
  let result
  if (config.operation === 'encode') {
    result = await runEncodeChild(buffer)
  } else if (config.operation === 'shared') {
    result = await runSharedChild(buffer, config.concurrency)
  } else if (config.operation === 'repeated') {
    result = await runRepeatedChild(buffer)
  } else {
    throw new Error(`未知子进程操作：${config.operation}`)
  }
  process.stdout.write(`BENCH_RESULT ${JSON.stringify(result)}\n`)
}

function runColdChild(config) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--child', JSON.stringify(config)],
    {
      cwd: path.resolve(SCRIPT_DIR, '..'),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    }
  )
  if (result.status !== 0) {
    throw new Error(
      `冷进程失败 (${config.operation}):\n${result.stdout}\n${result.stderr}`
    )
  }
  const line = result.stdout
    .split(/\r?\n/)
    .find((outputLine) => outputLine.startsWith('BENCH_RESULT '))
  if (!line) {
    throw new Error(`冷进程未输出 BENCH_RESULT：${result.stdout}`)
  }
  return JSON.parse(line.slice('BENCH_RESULT '.length))
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right)
  const rank = Math.ceil(percentileValue * sorted.length) - 1
  return sorted[Math.max(0, rank)]
}

function summarize(values) {
  return {
    runs: values.map((value) => Number(value.toFixed(3))),
    median: Number(percentile(values, 0.5).toFixed(3)),
    p95: Number(percentile(values, 0.95).toFixed(3))
  }
}

function summarizeCounts(values) {
  const unique = [...new Set(values)]
  return unique.length === 1 ? unique[0] : values
}

function runConfig(config) {
  return Array.from({ length: RUNS_PER_CONFIG }, () => runColdChild(config))
}

async function validatePdf(filePath) {
  const session = await openPdf(await readFile(filePath))
  const pageCount = session.pdf.numPages
  await destroySession(session)
  if (pageCount < 1) {
    throw new Error(`${filePath} 不是有效的非空 PDF`)
  }
  return pageCount
}

async function benchmarkFixture(fixture) {
  const fileStat = await stat(fixture.filePath)
  const pageCount = await validatePdf(fixture.filePath)
  const encodeRuns = runConfig({
    operation: 'encode',
    fixturePath: fixture.filePath
  })
  const repeatedRuns = runConfig({
    operation: 'repeated',
    fixturePath: fixture.filePath
  })
  const shared = {}
  for (const concurrency of SCAN_CONCURRENCIES) {
    const runs = runConfig({
      operation: 'shared',
      fixturePath: fixture.filePath,
      concurrency
    })
    shared[`conc${concurrency}`] = {
      getDocumentMs: summarize(runs.map(({ getDocumentMs }) => getDocumentMs)),
      scanMs: summarize(runs.map(({ scanMs }) => scanMs)),
      sessionOpenCount: summarizeCounts(
        runs.map(({ sessionOpenCount }) => sessionOpenCount)
      )
    }
  }
  return {
    name: fixture.name,
    source: fixture.source,
    gateEligible: fixture.gateEligible,
    bytes: fileStat.size,
    pageCount,
    encodeMs: summarize(encodeRuns.map(({ encodeMs }) => encodeMs)),
    sessionOpenCount: summarizeCounts(
      encodeRuns.map(({ sessionOpenCount }) => sessionOpenCount)
    ),
    sharedSession: shared,
    repeatedSessionBaseline: {
      repeatedOpenMs: summarize(
        repeatedRuns.map(({ repeatedOpenMs }) => repeatedOpenMs)
      ),
      sessionOpenCount: summarizeCounts(
        repeatedRuns.map(({ sessionOpenCount }) => sessionOpenCount)
      ),
      sliceCopyCount: summarizeCounts(
        repeatedRuns.map(({ sliceCopyCount }) => sliceCopyCount)
      )
    }
  }
}

function makeLog(report) {
  const lines = [
    `PDF streaming load baseline (${report.generatedAt})`,
    `Node ${report.environment.nodeVersion}; ${report.runsPerConfig} cold runs/config`,
    ''
  ]
  for (const fixture of report.fixtures) {
    lines.push(
      `${fixture.name}: pages=${fixture.pageCount}, bytes=${fixture.bytes}, gateEligible=${fixture.gateEligible}`,
      `  encode median=${fixture.encodeMs.median}ms p95=${fixture.encodeMs.p95}ms sessions=${JSON.stringify(fixture.sessionOpenCount)}`,
      `  shared conc1 getDocument median=${fixture.sharedSession.conc1.getDocumentMs.median}ms p95=${fixture.sharedSession.conc1.getDocumentMs.p95}ms; scan median=${fixture.sharedSession.conc1.scanMs.median}ms p95=${fixture.sharedSession.conc1.scanMs.p95}ms`,
      `  shared conc4 getDocument median=${fixture.sharedSession.conc4.getDocumentMs.median}ms p95=${fixture.sharedSession.conc4.getDocumentMs.p95}ms; scan median=${fixture.sharedSession.conc4.scanMs.median}ms p95=${fixture.sharedSession.conc4.scanMs.p95}ms`,
      `  repeated opens median=${fixture.repeatedSessionBaseline.repeatedOpenMs.median}ms p95=${fixture.repeatedSessionBaseline.repeatedOpenMs.p95}ms sessions=${fixture.repeatedSessionBaseline.sessionOpenCount}`
    )
  }
  lines.push(
    '',
    `Decision gate: ${report.decisionGate.outcome}`,
    report.decisionGate.reason
  )
  return `${lines.join('\n')}\n`
}

function resolveDecisionGate(initialFailingFixtures, retestFailingFixtures) {
  if (initialFailingFixtures.length === 0) {
    return {
      outcome: 'D1_HOLDS',
      thresholdMs: 2000,
      concurrency: 1,
      reason:
        '全部 performanceGateFixtures 的共享会话全量尺寸扫描 p95 均不超过 2 秒。'
    }
  }
  if (retestFailingFixtures.length === 0) {
    return {
      outcome: 'D1_HOLDS_AFTER_CONCURRENCY_RAISE',
      thresholdMs: 2000,
      concurrency: 4,
      initialFailingFixtures: initialFailingFixtures.map(({ name }) => name),
      reason:
        '并发 1 有夹具超过 2 秒；将尺寸扫描并发默认值上调到 4 后复测，全部 performanceGateFixtures 均通过。'
    }
  }
  return {
    outcome: 'STOP_REDECISION_REQUIRED',
    thresholdMs: 2000,
    concurrency: 4,
    initialFailingFixtures: initialFailingFixtures.map(({ name }) => name),
    failingFixtures: retestFailingFixtures.map(({ name }) => name),
    reason:
      '并发默认值已从 1 上调到 4 并完成一轮复测，仍有夹具超过 2 秒，必须停止并重新决策。'
  }
}

async function runBenchmark(evidenceDir) {
  assertAbsoluteDirectory(evidenceDir, '--evidence-dir')
  if (!existsSync(DIST_ENTRY)) {
    throw new Error(
      `缺少构建产物 ${DIST_ENTRY}。请在 parser 仓执行：yarn build:all`
    )
  }
  await mkdir(evidenceDir, { recursive: true })
  await generateBenchmarkFixtures()
  const matrix = FIXTURES.map((fixture) => ({
    ...fixture,
    filePath: path.join(FIXTURE_DIR, fixture.fileName),
    source: 'generated'
  }))
  if (process.env.PDF_BENCH_REAL) {
    const realPath = path.resolve(process.env.PDF_BENCH_REAL)
    matrix.push({
      name: 'PDF_BENCH_REAL',
      fileName: path.basename(realPath),
      filePath: realPath,
      source: 'environment',
      gateEligible: true
    })
  }
  const fixtures = []
  for (const fixture of matrix) {
    console.log(`Benchmarking ${fixture.name}...`)
    fixtures.push(await benchmarkFixture(fixture))
  }
  const gateFixtures = fixtures.filter(({ gateEligible }) => gateEligible)
  const initialFailingFixtures = gateFixtures.filter(
    ({ sharedSession }) => sharedSession.conc1.scanMs.p95 > 2000
  )
  const retestFailingFixtures = initialFailingFixtures.filter(
    ({ sharedSession }) => sharedSession.conc4.scanMs.p95 > 2000
  )
  const decisionGate = resolveDecisionGate(
    initialFailingFixtures,
    retestFailingFixtures
  )
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    runsPerConfig: RUNS_PER_CONFIG,
    performanceGateFixtures: gateFixtures.map(({ name }) => name),
    fixtures,
    excludedFixtures: ['minimal-probe'],
    decisionGate
  }
  await atomicWrite(
    path.join(evidenceDir, EVIDENCE_JSON),
    `${JSON.stringify(report, null, 2)}\n`
  )
  await atomicWrite(path.join(evidenceDir, EVIDENCE_LOG), makeLog(report))
  console.log(JSON.stringify(report, null, 2))
  if (decisionGate.outcome === 'STOP_REDECISION_REQUIRED') {
    process.exitCode = 2
  }
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 18) {
    throw new Error(`需要 Node.js >=18，当前为 ${process.version}`)
  }
  const argumentsValue = parseArguments(process.argv.slice(2))
  if (argumentsValue.child) {
    await runChild(argumentsValue.child)
    return
  }
  if (argumentsValue.emitE2eDir) {
    await emitE2eFixtures(argumentsValue.emitE2eDir)
    return
  }
  await runBenchmark(argumentsValue.evidenceDir)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
