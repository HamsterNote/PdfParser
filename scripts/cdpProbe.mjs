// allow: SIZE_OK - CDP 生命周期、嵌套 target 状态与冷浏览器清理必须由同一闭包原子管理。
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
// eslint-disable-next-line sonarjs/publicly-writable-directories -- 计划固定的隔离 runner，版本与 tarball hash 另行验证。
const RUNNER_PACKAGE = '/tmp/opencode/playwright-runner/package.json'
const DEFAULT_CHROMIUM =
  '/home/zhangxiao/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
const DEFAULT_READER =
  '/home/zhangxiao/worktrees/8797cf4a/feature-pdf-load-fast-9cba4d85'
const AUTO_ATTACH = {
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true
}
const REQUEST_TIMEOUT_MS = 15_000
const WORKER_ATTACH_TIMEOUT_MS = 10_000
const PDF_WORKER_PATH = '/pdfjs-worker/pdf.worker.min.mjs'

class ProbeError extends Error {
  constructor(message, classification = 'FAIL-REGRESSION', details = {}) {
    super(message)
    this.name = 'ProbeError'
    this.classification = classification
    this.details = details
  }
}

function parseArguments(argv) {
  const parsed = {
    phase: 'all',
    runs: 3,
    chromium: DEFAULT_CHROMIUM,
    readerRoot: DEFAULT_READER,
    baseUrl: undefined,
    evidenceDir: undefined,
    output: undefined
  }
  const remaining = [...argv]
  while (remaining.length > 0) {
    const flag = remaining.shift()
    const value = remaining.shift()
    if (!value) throw new ProbeError(`${flag} 缺少参数`)
    if (flag === '--phase') parsed.phase = value
    else if (flag === '--runs') parsed.runs = Number.parseInt(value, 10)
    else if (flag === '--chromium') parsed.chromium = path.resolve(value)
    else if (flag === '--reader-root') parsed.readerRoot = path.resolve(value)
    else if (flag === '--base-url') parsed.baseUrl = value
    else if (flag === '--evidence-dir') parsed.evidenceDir = path.resolve(value)
    else if (flag === '--output') parsed.output = path.resolve(value)
    else throw new ProbeError(`未知参数：${flag}`)
  }
  if (!['probe', 'memory', 'all'].includes(parsed.phase)) {
    throw new ProbeError(`--phase 必须是 probe、memory 或 all：${parsed.phase}`)
  }
  if (!Number.isInteger(parsed.runs) || parsed.runs < 3) {
    throw new ProbeError('--runs 必须是至少 3 的整数')
  }
  if (!parsed.baseUrl) throw new ProbeError('--base-url 必填')
  return parsed
}

function loadWebSocket() {
  try {
    const require = createRequire(RUNNER_PACKAGE)
    const packageValue = require('ws/package.json')
    if (packageValue.version !== '8.20.0') {
      throw new ProbeError(
        `隔离 runner 的 ws 版本必须是 8.20.0，实际为 ${packageValue.version}`,
        'FAIL-BLOCKED',
        {
          alternative:
            'rm -rf /tmp/opencode/playwright-runner && mkdir -p /tmp/opencode/playwright-runner && cd /tmp/opencode/playwright-runner && npm init -y && npm install --save-exact ws@8.20.0'
        }
      )
    }
    return { WebSocket: require('ws'), wsVersion: packageValue.version }
  } catch (error) {
    if (error instanceof ProbeError) throw error
    throw new ProbeError('隔离 runner 无法加载 ws@8.20.0', 'FAIL-BLOCKED', {
      cause: error instanceof Error ? error.message : String(error),
      alternative:
        'mkdir -p /tmp/opencode/playwright-runner && cd /tmp/opencode/playwright-runner && npm init -y && npm install --save-exact ws@8.20.0'
    })
  }
}

function startFixtureServer(fixtures) {
  const server = createServer(async (request, response) => {
    const fixturePath = fixtures.get(request.url ?? '')
    if (!fixturePath) {
      response.writeHead(404).end('not found')
      return
    }
    try {
      const bytes = await readFile(fixturePath)
      response.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': bytes.byteLength,
        'access-control-allow-origin': '*',
        'cache-control': 'no-store'
      })
      response.end(bytes)
    } catch (error) {
      response
        .writeHead(500)
        .end(error instanceof Error ? error.message : String(error))
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new ProbeError('无法取得 fixture server 端口'))
        return
      }
      resolve({ baseUrl: `http://127.0.0.1:${address.port}`, server })
    })
  })
}

function closeFixtureServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

function waitForDevtoolsUrl(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    const timer = setTimeout(() => {
      reject(new ProbeError('Chromium 未在时限内输出 DevTools WebSocket URL'))
    }, timeoutMs)
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1])
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(
        new ProbeError('Chromium 在 CDP 建链前退出', 'FAIL-BLOCKED', {
          code,
          stderr,
          alternative: `${DEFAULT_CHROMIUM} --headless=new --remote-debugging-port=0 --user-data-dir=/tmp/cdp-probe`
        })
      )
    })
  })
}

async function terminateProcess(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000))
  ])
  if (graceful) return
  child.kill('SIGKILL')
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 3_000))
  ])
}

function removeProfile(profilePath) {
  return rm(profilePath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  })
}

function createCdpClient(WebSocket, websocketUrl) {
  const socket = new WebSocket(websocketUrl)
  const pending = new Map()
  const listeners = new Set()
  const configuredSessionIds = new Set()
  const liveTargetsBySessionId = new Map()
  let nextId = 1
  let closed = false

  const ready = new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })

  function send(
    method,
    params = {},
    sessionId,
    timeoutMs = REQUEST_TIMEOUT_MS
  ) {
    if (closed) return Promise.reject(new ProbeError(`CDP 已关闭：${method}`))
    const id = nextId
    nextId += 1
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(
          new ProbeError(`CDP 请求超时：${method}`, 'FAIL-REGRESSION', {
            method,
            sessionId
          })
        )
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer, method })
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {})
        })
      )
    })
  }

  async function configureSession(sessionId) {
    const key = sessionId ?? 'root'
    if (configuredSessionIds.has(key)) return
    configuredSessionIds.add(key)
    await send('Target.setAutoAttach', AUTO_ATTACH, sessionId)
  }

  function dispatch(message) {
    for (const listener of listeners) listener(message)
  }

  function settleResponse(message) {
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error) {
      const classification =
        message.error.code === -32601 ? 'FAIL-BLOCKED' : 'FAIL-REGRESSION'
      request.reject(
        new ProbeError(
          `CDP ${request.method}: ${message.error.message}`,
          classification,
          { code: message.error.code, data: message.error.data }
        )
      )
    } else request.resolve(message.result ?? {})
  }

  function trackTarget(message) {
    if (message.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = message.params
      liveTargetsBySessionId.set(sessionId, {
        targetId: targetInfo.targetId,
        type: targetInfo.type,
        url: targetInfo.url
      })
      // 嵌套 worker 只有在父 session 也配置 auto-attach 后才可观测。
      configureSession(sessionId).catch((error) => {
        dispatch({
          method: 'Protocol.configureError',
          params: { error, sessionId }
        })
      })
      return
    }
    if (message.method === 'Target.detachedFromTarget') {
      liveTargetsBySessionId.delete(message.params.sessionId)
      return
    }
    if (message.method !== 'Target.targetInfoChanged') return
    for (const [sessionId, target] of liveTargetsBySessionId) {
      if (target.targetId === message.params.targetInfo.targetId) {
        liveTargetsBySessionId.set(sessionId, {
          targetId: target.targetId,
          type: message.params.targetInfo.type,
          url: message.params.targetInfo.url
        })
      }
    }
  }

  socket.on('message', (raw) => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch (error) {
      dispatch({ method: 'Protocol.malformed', params: { error } })
      return
    }
    if (message.id) {
      settleResponse(message)
      return
    }
    trackTarget(message)
    dispatch(message)
  })

  function close(reason) {
    if (closed) return
    closed = true
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(reason)
    }
    pending.clear()
    socket.close()
  }

  return {
    ready,
    send,
    configureSession,
    liveTargetsBySessionId,
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close
  }
}

async function waitForTarget(client, predicate, timeoutMs, description) {
  const existing = [...client.liveTargetsBySessionId.entries()].find(
    ([sessionId, target]) => predicate(target, sessionId)
  )
  if (existing) return { sessionId: existing[0], ...existing[1] }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new ProbeError(`${description} 未在 ${timeoutMs}ms 内附着`))
    }, timeoutMs)
    const unsubscribe = client.onEvent((message) => {
      if (message.method !== 'Target.attachedToTarget') return
      const { sessionId, targetInfo } = message.params
      if (!predicate(targetInfo, sessionId)) return
      clearTimeout(timer)
      unsubscribe()
      resolve({
        sessionId,
        targetId: targetInfo.targetId,
        type: targetInfo.type,
        url: targetInfo.url
      })
    })
  })
}

async function evaluate(
  client,
  sessionId,
  expression,
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  const result = await client.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
    timeoutMs
  )
  if (result.exceptionDetails) {
    throw new ProbeError('页面 Runtime.evaluate 抛错', 'FAIL-REGRESSION', {
      exceptionDetails: result.exceptionDetails
    })
  }
  return result.result?.value
}

async function launchColdBrowser(options, WebSocket) {
  launchColdBrowser.profileCounter = (launchColdBrowser.profileCounter ?? 0) + 1
  const profilePath = path.join(
    tmpdir(),
    `pdf-cdp-${process.pid}-${Date.now()}-${launchColdBrowser.profileCounter}`
  )
  const child = spawn(
    options.chromium,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0',
      `--user-data-dir=${profilePath}`,
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )
  let client
  try {
    const websocketUrl = await waitForDevtoolsUrl(child, 15_000)
    client = createCdpClient(WebSocket, websocketUrl)
    await client.ready
    await client.configureSession(undefined)
    const version = await client.send('Browser.getVersion')
    return { child, client, profilePath, version, websocketUrl }
  } catch (error) {
    client?.close(error instanceof Error ? error : new Error(String(error)))
    await terminateProcess(child)
    await removeProfile(profilePath)
    throw error
  }
}

async function closeColdBrowser(browser) {
  const reason = new ProbeError('CDP phase finally cleanup')
  browser.client.close(reason)
  await terminateProcess(browser.child)
  await removeProfile(browser.profilePath)
}

async function createPage(browser, baseUrl) {
  const existingSessionIds = new Set(
    browser.client.liveTargetsBySessionId.keys()
  )
  await browser.client.send('Target.createTarget', {
    url: 'about:blank'
  })
  const page = await waitForTarget(
    browser.client,
    ({ type }, sessionId) =>
      type === 'page' && !existingSessionIds.has(sessionId),
    REQUEST_TIMEOUT_MS,
    'page target'
  )
  await browser.client.send('Runtime.enable', {}, page.sessionId)
  await browser.client.send('Network.enable', {}, page.sessionId)
  await browser.client.send('Page.enable', {}, page.sessionId)
  await Promise.all([
    waitForCdpEvent(
      browser.client,
      page.sessionId,
      'Page.loadEventFired',
      35_000
    ),
    browser.client.send(
      'Page.navigate',
      { url: baseUrl },
      page.sessionId,
      35_000
    )
  ])
  return page
}

function waitForCdpEvent(client, sessionId, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new ProbeError(`CDP 事件超时：${method}`))
    }, timeoutMs)
    const unsubscribe = client.onEvent((message) => {
      if (message.method !== method || message.sessionId !== sessionId) return
      clearTimeout(timer)
      unsubscribe()
      resolve(message.params)
    })
  })
}

function fixtureActionExpression(fixtureUrl, fileName, firstSelection) {
  const selector = firstSelection
    ? '[data-testid="file-input"]'
    : 'input[aria-label="Choose another file"]'
  return `(async () => {
    const response = await fetch(${JSON.stringify(fixtureUrl)}, { cache: 'no-store' })
    if (!response.ok) throw new Error('fixture HTTP ' + response.status)
    const bytes = await response.arrayBuffer()
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!(input instanceof HTMLInputElement)) throw new Error('upload input missing')
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], ${JSON.stringify(fileName)}, { type: 'application/pdf' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return { bytes: bytes.byteLength, selector: ${JSON.stringify(selector)} }
  })()`
}

async function waitForUiState(client, pageSessionId, state, timeoutMs) {
  return evaluate(
    client,
    pageSessionId,
    `new Promise((resolve, reject) => {
      const deadline = performance.now() + ${timeoutMs}
      const poll = () => {
        const error = document.querySelector('[data-testid="demo-error-state"]')
        if (error) reject(new Error(error.textContent || 'demo error'))
        else if (${state}) resolve(true)
        else if (performance.now() >= deadline) reject(new Error('UI state timeout'))
        else setTimeout(poll, 50)
      }
      poll()
    })`,
    timeoutMs + 2_000
  )
}

async function loadFixture(client, page, fixtureUrl, fileName, firstSelection) {
  const injected = await evaluate(
    client,
    page.sessionId,
    fixtureActionExpression(fixtureUrl, fileName, firstSelection),
    120_000
  )
  await waitForUiState(
    client,
    page.sessionId,
    `document.querySelector('[data-testid="pdf-ready-card"]') !== null`,
    120_000
  )
  await evaluate(
    client,
    page.sessionId,
    `(() => {
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === '加载文件')
      if (!(button instanceof HTMLButtonElement)) throw new Error('加载文件 button missing')
      button.click()
      return true
    })()`
  )
  return injected
}

async function waitForResolvedDocument(client, pageSessionId) {
  return waitForUiState(
    client,
    pageSessionId,
    `document.querySelector('.hamster-reader__intermediate-document-viewer') !== null &&
      document.querySelector('[data-testid="pdf-timing-parse"]')?.textContent?.trim() !== '—'`,
    120_000
  )
}

async function readBrowserTimings(client, pageSessionId) {
  return evaluate(
    client,
    pageSessionId,
    `(() => {
      const read = (testId) => document.querySelector('[data-testid="' + testId + '"]')?.textContent?.trim() ?? ''
      const parse = (text) => text === '<0.1 ms' ? 0 : Number.parseFloat(text)
      const fileLoadText = read('pdf-timing-file-load')
      const parseText = read('pdf-timing-parse')
      const documentResolutionText = read('pdf-timing-document-resolution')
      return {
        fileLoadText,
        parseText,
        documentResolutionText,
        fileLoadMs: parse(fileLoadText),
        parseMs: parse(parseText),
        documentResolutionMs: parse(documentResolutionText)
      }
    })()`
  )
}

async function waitForQuiescence(
  client,
  pageSessionId,
  pendingNetworkRequests
) {
  // Phase B 的确定性静默条件：最终文档 7 页均挂载、所有图片解码完成，
  // 且渲染签名和 CDP Network 在途集合连续 1.2 秒不变。
  let previousSignature
  let lastSnapshot
  let stableSince = Date.now()
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const snapshot = await evaluate(
      client,
      pageSessionId,
      `(() => {
        const pages = [...document.querySelectorAll('.hamster-reader__intermediate-page')]
        const images = [...document.querySelectorAll('.hamster-reader__intermediate-page img')]
        return {
          pageCount: pages.length,
          imageCount: images.length,
          decodedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
          timing: [...document.querySelectorAll('[data-testid^="pdf-timing-"]')]
            .map((node) => node.textContent?.trim() ?? '').join('|')
        }
      })()`
    )
    lastSnapshot = snapshot
    const signature = JSON.stringify({
      pageCount: snapshot.pageCount,
      imageCount: snapshot.imageCount,
      decodedImages: snapshot.decodedImages,
      timing: snapshot.timing
    })
    if (signature !== previousSignature || pendingNetworkRequests.size > 0) {
      previousSignature = signature
      stableSince = Date.now()
    }
    if (
      snapshot.pageCount === 7 &&
      snapshot.imageCount > 0 &&
      snapshot.decodedImages === snapshot.imageCount &&
      pendingNetworkRequests.size === 0 &&
      Date.now() - stableSince >= 1_200
    ) {
      return {
        ...snapshot,
        pendingNetworkRequests: 0,
        stableForMs: Date.now() - stableSince
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new ProbeError('Phase B quiescence 不可达', 'FAIL-REGRESSION', {
    lastSnapshot,
    pendingNetworkRequests: [...pendingNetworkRequests.entries()],
    stableForMs: Date.now() - stableSince
  })
}

function isPdfWorker(target) {
  return (
    target.type.includes('worker') && target.url.includes('pdf.worker.min.mjs')
  )
}

async function collectAgentHeap(client, sessionId, target) {
  const beforeGc = await client.send('Runtime.getHeapUsage', {}, sessionId)
  await client.send('HeapProfiler.collectGarbage', {}, sessionId)
  const afterGc = await client.send('Runtime.getHeapUsage', {}, sessionId)
  for (const [label, value] of Object.entries({ beforeGc, afterGc })) {
    for (const component of [
      'usedSize',
      'embedderHeapUsedSize',
      'backingStorageSize'
    ]) {
      if (!Number.isFinite(value[component])) {
        throw new ProbeError(
          `heap ${label}.${component} 缺失`,
          'FAIL-REGRESSION',
          {
            target,
            value
          }
        )
      }
    }
  }
  const retainedBytes =
    afterGc.usedSize + afterGc.embedderHeapUsedSize + afterGc.backingStorageSize
  return { sessionId, ...target, beforeGc, afterGc, retainedBytes }
}

async function collectAllHeaps(client, page) {
  const targets = [
    {
      sessionId: page.sessionId,
      targetId: page.targetId,
      type: 'page',
      url: page.url
    }
  ]
  for (const [sessionId, target] of client.liveTargetsBySessionId) {
    if (isPdfWorker(target)) targets.push({ sessionId, ...target })
  }
  if (targets.length < 2)
    throw new ProbeError('采集时没有存活的 pdf.worker target')
  const agents = []
  for (const target of targets) {
    agents.push(await collectAgentHeap(client, target.sessionId, target))
  }
  return {
    agents,
    retainedBytes: agents.reduce((sum, agent) => sum + agent.retainedBytes, 0)
  }
}

function createNetworkTracker(client) {
  const pending = new Map()
  const responses = []
  const unsubscribe = client.onEvent((message) => {
    const sessionId = message.sessionId ?? 'root'
    if (message.method === 'Target.attachedToTarget') {
      const targetUrl = message.params.targetInfo.url
      if (isPdfWorker(message.params.targetInfo)) {
        // module worker 已成功创建 target 时，父 page session 的 Script 请求已完成转交；
        // Chromium 不保证该旧 session 再发 loadingFinished。
        for (const [requestKey, request] of pending) {
          if (request.url === targetUrl) pending.delete(requestKey)
        }
      }
    } else if (message.method === 'Network.requestWillBeSent') {
      // Vite HMR WebSocket/EventSource 是 dev server 常驻通道，不属于 PDF 渲染网络活动。
      if (['WebSocket', 'EventSource'].includes(message.params.type)) return
      pending.set(`${sessionId}:${message.params.requestId}`, {
        url: message.params.request.url,
        type: message.params.type
      })
    } else if (
      message.method === 'Network.loadingFinished' ||
      message.method === 'Network.loadingFailed'
    ) {
      pending.delete(`${sessionId}:${message.params.requestId}`)
    } else if (message.method === 'Network.responseReceived') {
      responses.push({
        sessionId,
        url: message.params.response.url,
        status: message.params.response.status
      })
    }
  })
  return { pending, responses, unsubscribe }
}

async function runPhaseA(options, WebSocket, fixtureBaseUrl) {
  const browser = await launchColdBrowser(options, WebSocket)
  const handshake = {
    browserWebSocketConnected: true,
    navigationSuccess: false,
    fixtureInjection: false,
    openDocumentStart: false,
    openDocumentResolved: false,
    openDocumentRejected: false,
    workerAttached: false,
    workerNetworkStatus: undefined
  }
  const network = createNetworkTracker(browser.client)
  try {
    const page = await createPage(browser, options.baseUrl)
    handshake.navigationSuccess = true
    const injected = await loadFixture(
      browser.client,
      page,
      `${fixtureBaseUrl}/minimal-probe.pdf`,
      'minimal-probe.pdf',
      true
    )
    handshake.fixtureInjection = injected.bytes > 0
    handshake.openDocumentStart = true
    const worker = await waitForTarget(
      browser.client,
      isPdfWorker,
      WORKER_ATTACH_TIMEOUT_MS,
      'pdf.worker target'
    )
    handshake.workerAttached = true
    await browser.client.send('Runtime.enable', {}, worker.sessionId)
    await waitForResolvedDocument(browser.client, page.sessionId)
    handshake.openDocumentResolved = true
    const workerNetworkStatus = await evaluate(
      browser.client,
      page.sessionId,
      `fetch(${JSON.stringify(worker.url)}, { cache: 'no-store' }).then((response) => response.status)`,
      30_000
    )
    handshake.workerNetworkStatus = workerNetworkStatus
    if (!worker.url.includes(PDF_WORKER_PATH) || workerNetworkStatus !== 200) {
      throw new ProbeError(
        'pdf.worker 请求未返回 HTTP 200',
        'FAIL-REGRESSION',
        {
          worker,
          workerNetworkStatus
        }
      )
    }
    const pageHeap = await collectAgentHeap(browser.client, page.sessionId, {
      targetId: page.targetId,
      type: 'page',
      url: options.baseUrl
    })
    const workerHeap = await collectAgentHeap(
      browser.client,
      worker.sessionId,
      worker
    )
    return {
      verdict: 'PASS',
      handshake,
      capabilities: {
        browserWebSocket: true,
        rootAutoAttach: true,
        nestedWorkerAttach: true,
        collectGarbageOnPageAndWorker: true,
        threeComponentHeapUsageOnPageAndWorker: true
      },
      heaps: { page: pageHeap, worker: workerHeap },
      browserVersion: browser.version.product,
      protocolVersion: browser.version.protocolVersion
    }
  } catch (error) {
    handshake.openDocumentRejected =
      handshake.openDocumentStart && !handshake.openDocumentResolved
    throw Object.assign(error, { phaseAHandshake: handshake })
  } finally {
    network.unsubscribe()
    await closeColdBrowser(browser)
  }
}

async function runMemoryIteration(
  options,
  WebSocket,
  fixtureBaseUrl,
  group,
  runIndex
) {
  const browser = await launchColdBrowser(options, WebSocket)
  const network = createNetworkTracker(browser.client)
  try {
    const page = await createPage(browser, options.baseUrl)
    const fixtureNames = group === 'control' ? ['c'] : ['a', 'b', 'c']
    for (const [index, suffix] of fixtureNames.entries()) {
      await loadFixture(
        browser.client,
        page,
        `${fixtureBaseUrl}/large-e2e-${suffix}.pdf`,
        `large-e2e-${suffix}.pdf`,
        index === 0
      )
      await waitForResolvedDocument(browser.client, page.sessionId)
    }
    const quiescence = await waitForQuiescence(
      browser.client,
      page.sessionId,
      network.pending
    )
    const browserTimings = await readBrowserTimings(
      browser.client,
      page.sessionId
    )
    if (
      !Number.isFinite(browserTimings.fileLoadMs) ||
      browserTimings.fileLoadMs <= 0 ||
      !Number.isFinite(browserTimings.parseMs) ||
      browserTimings.parseMs <= 0 ||
      !Number.isFinite(browserTimings.documentResolutionMs) ||
      browserTimings.documentResolutionMs < 0
    ) {
      throw new ProbeError('真实浏览器三段计时无效', 'FAIL-REGRESSION', {
        browserTimings
      })
    }
    const heap = await collectAllHeaps(browser.client, page)
    return {
      group,
      runIndex,
      coldProfilePath: browser.profilePath,
      fixtureSequence: fixtureNames,
      quiescence,
      browserTimings,
      ...heap,
      browserVersion: browser.version.product
    }
  } finally {
    network.unsubscribe()
    await closeColdBrowser(browser)
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

async function runPhaseB(options, WebSocket, fixtureBaseUrl) {
  const groups = { control: [], sequence: [] }
  for (const group of ['control', 'sequence']) {
    const runNumbers = Array.from(
      { length: options.runs },
      (_, index) => index + 1
    )
    for (const runIndex of runNumbers) {
      groups[group].push(
        await runMemoryIteration(
          options,
          WebSocket,
          fixtureBaseUrl,
          group,
          runIndex
        )
      )
    }
  }
  const controlMedian = median(
    groups.control.map(({ retainedBytes }) => retainedBytes)
  )
  const sequenceMedian = median(
    groups.sequence.map(({ retainedBytes }) => retainedBytes)
  )
  const allowedDeltaBytes = Math.max(16 * 1024 * 1024, controlMedian * 0.1)
  const deltaBytes = sequenceMedian - controlMedian
  return {
    verdict: deltaBytes > allowedDeltaBytes ? 'FAIL-REGRESSION' : 'PASS',
    runsPerGroup: options.runs,
    groups,
    comparison: {
      controlMedianRetainedBytes: controlMedian,
      sequenceMedianRetainedBytes: sequenceMedian,
      deltaBytes,
      allowedDeltaBytes,
      allowedRelativeDelta: 0.1,
      allowedAbsoluteDeltaBytes: 16 * 1024 * 1024
    }
  }
}

async function writeReport(options, report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  let outputPath = options.output
  if (!outputPath && options.evidenceDir) {
    const evidenceFile =
      options.phase === 'probe'
        ? 'task-11-phase-a.json'
        : 'task-11-cdp-memory.json'
    outputPath = path.join(options.evidenceDir, evidenceFile)
  }
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, serialized)
  }
  process.stdout.write(serialized)
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const { WebSocket, wsVersion } = loadWebSocket()
  const fixtureRoot = path.join(options.readerRoot, 'demo/.fixtures')
  const fixtureServer = await startFixtureServer(
    new Map([
      [
        '/minimal-probe.pdf',
        path.join(SCRIPT_DIR, '.fixtures/minimal-probe.pdf')
      ],
      ['/large-e2e-a.pdf', path.join(fixtureRoot, 'large-e2e-a.pdf')],
      ['/large-e2e-b.pdf', path.join(fixtureRoot, 'large-e2e-b.pdf')],
      ['/large-e2e-c.pdf', path.join(fixtureRoot, 'large-e2e-c.pdf')]
    ])
  )
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    wsVersion,
    chromiumPath: options.chromium,
    baseUrl: options.baseUrl,
    phaseA: undefined,
    phaseB: undefined,
    verdict: 'PASS'
  }
  try {
    if (options.phase !== 'memory') {
      report.phaseA = await runPhaseA(options, WebSocket, fixtureServer.baseUrl)
    }
    if (options.phase !== 'probe') {
      report.phaseB = await runPhaseB(options, WebSocket, fixtureServer.baseUrl)
      report.verdict = report.phaseB.verdict
    }
  } catch (error) {
    report.verdict =
      error instanceof ProbeError ? error.classification : 'FAIL-REGRESSION'
    report.failure = {
      message: error instanceof Error ? error.message : String(error),
      details: error instanceof ProbeError ? error.details : {},
      phaseAHandshake: error?.phaseAHandshake
    }
  } finally {
    await closeFixtureServer(fixtureServer.server)
  }
  await writeReport(options, report)
  if (report.verdict === 'FAIL-BLOCKED') process.exitCode = 2
  else if (report.verdict === 'FAIL-REGRESSION') process.exitCode = 3
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
