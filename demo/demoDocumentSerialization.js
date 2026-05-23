async function buildPageSummary(page) {
  const content = await resolvePageContent(page)
  const texts = extractTexts(content)
  const images = extractImages(content)

  return {
    number: page.number,
    width: page.width,
    height: page.height,
    textCount: texts.length,
    imageCount: images.length,
    previewText: texts.map((text) => {
      return {
        content: text.content,
        fontSize: text.fontSize,
        fontFamily: text.fontFamily,
        color: text.color,
        polygon: text.polygon
      }
    })
  }
}

function isIntermediateTextItem(item) {
  return item !== null && typeof item === 'object' && 'content' in item
}

function isIntermediateImageItem(item) {
  return item !== null && typeof item === 'object' && 'src' in item
}

function extractTexts(content) {
  return content.filter(isIntermediateTextItem)
}

function extractImages(content) {
  return content.filter(isIntermediateImageItem)
}

async function resolvePageContent(page) {
  if (typeof page.getContent === 'function') {
    const content = await page.getContent()
    return Array.isArray(content) ? content : []
  }

  return Array.isArray(page.content) ? page.content : []
}

function getNow() {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now()
  }

  return Date.now()
}

async function resolveCoverAvailable(intermediate, onDiagnostic) {
  const startedAt = getNow()

  if (typeof intermediate.getCover !== 'function') {
    onDiagnostic?.({
      type: 'cover',
      available: false,
      durationMs: getNow() - startedAt,
      skipped: true
    })
    return false
  }

  const cover = await intermediate.getCover(0.25).catch(() => undefined)
  const available = Boolean(
    cover &&
    typeof cover === 'object' &&
    'src' in cover &&
    typeof cover.src === 'string' &&
    cover.src.length > 0
  )

  onDiagnostic?.({
    type: 'cover',
    available,
    durationMs: getNow() - startedAt,
    skipped: false
  })

  return available
}

export function createProgressiveSerializer(intermediate, options = {}) {
  const { onDiagnostic, onProgress } = options
  const outline =
    typeof intermediate.getOutline === 'function'
      ? (intermediate.getOutline() ?? [])
      : (intermediate.outline ?? [])

  const pageCount = intermediate.pageCount
  const pageNumbers = intermediate.pageNumbers

  // Build placeholder pages using synchronous metadata
  const placeholderPages = pageNumbers.map((num) => {
    const size = intermediate.getPageSizeByPageNumber(num)
    return {
      number: num,
      width: size?.x ?? 0,
      height: size?.y ?? 0,
      textCount: 0,
      imageCount: 0,
      previewText: []
    }
  })

  const shell = {
    id: intermediate.id,
    title: intermediate.title,
    pageCount,
    hasOutline: outline.length > 0,
    pageNumbers,
    coverAvailable: false,
    pages: placeholderPages
  }

  const pageSummaryCache = new Array(pageCount).fill(undefined)
  const subscribers = []
  let resolutionError = null
  const totalProgressUnits = pageCount + 1
  let completedProgressUnits = 0

  function emitProgress(stage, extra = {}) {
    onProgress?.({
      stage,
      current: completedProgressUnits,
      total: totalProgressUnits,
      ...extra
    })
  }

  function advanceProgress(stage, extra = {}) {
    completedProgressUnits = Math.min(
      totalProgressUnits,
      completedProgressUnits + 1
    )
    emitProgress(stage, extra)
  }

  emitProgress('serialize:start', { pageCount })

  const coverAvailablePromise = resolveCoverAvailable(
    intermediate,
    onDiagnostic
  )
  coverAvailablePromise.then((available) => {
    shell.coverAvailable = available
    advanceProgress('serialize:cover', {
      available,
      pageCount
    })
    notifySubscribers()
  })

  function notifySubscribers() {
    const snapshot = buildFullSnapshot()
    for (const cb of subscribers) {
      cb(snapshot)
    }
  }

  function buildFullSnapshot() {
    return {
      id: shell.id,
      title: shell.title,
      pageCount: shell.pageCount,
      hasOutline: shell.hasOutline,
      pageNumbers: shell.pageNumbers,
      coverAvailable: shell.coverAvailable,
      pages: pageSummaryCache.map((s, i) =>
        s !== undefined ? s : placeholderPages[i]
      )
    }
  }

  ;(async () => {
    for (let i = 0; i < pageNumbers.length; i++) {
      const num = pageNumbers[i]
      const pageStartedAt = getNow()
      try {
        const pageResolvedStartedAt = getNow()
        const page = await intermediate.getPageByPageNumber(num)
        const pageResolvedAt = getNow()
        if (page === undefined) {
          pageSummaryCache[i] = {
            number: num,
            width: 0,
            height: 0,
            textCount: 0,
            imageCount: 0,
            previewText: []
          }
          onDiagnostic?.({
            type: 'page',
            pageNumber: num,
            totalDurationMs: getNow() - pageStartedAt,
            resolvePageMs: pageResolvedAt - pageResolvedStartedAt,
            resolveTextsMs: 0,
            buildSummaryMs: 0,
            textCount: 0,
            imageCount: 0,
            missing: true
          })
          advanceProgress('serialize:page', {
            pageNumber: num,
            pagesCompleted: i + 1,
            pageCount
          })
          notifySubscribers()
          continue
        }
        const contentStartedAt = getNow()
        const summaryStartedAt = getNow()
        const summary = await buildPageSummary(page)
        const summaryBuiltAt = getNow()
        const contentResolvedAt = summaryBuiltAt
        pageSummaryCache[i] = summary
        onDiagnostic?.({
          type: 'page',
          pageNumber: num,
          totalDurationMs: summaryBuiltAt - pageStartedAt,
          resolvePageMs: pageResolvedAt - pageResolvedStartedAt,
          resolveTextsMs: contentResolvedAt - contentStartedAt,
          buildSummaryMs: summaryBuiltAt - summaryStartedAt,
          textCount: summary.textCount,
          imageCount: summary.imageCount,
          missing: false
        })
        advanceProgress('serialize:page', {
          pageNumber: num,
          pagesCompleted: i + 1,
          pageCount
        })
        notifySubscribers()
      } catch (err) {
        resolutionError = err
        onDiagnostic?.({
          type: 'page-error',
          pageNumber: num,
          totalDurationMs: getNow() - pageStartedAt,
          error: err instanceof Error ? err.message : String(err)
        })
        notifySubscribers()
        break
      }
    }
  })()

  return {
    shell,

    onUpdate(callback) {
      subscribers.push(callback)
      if (pageSummaryCache.some((s) => s !== undefined)) {
        callback(buildFullSnapshot())
      }
    },

    resolve() {
      return (async () => {
        if (resolutionError) {
          throw resolutionError
        }
        while (pageSummaryCache.some((s) => s === undefined)) {
          if (resolutionError) {
            throw resolutionError
          }
          await new Promise((r) => setTimeout(r, 5))
        }
        await coverAvailablePromise
        emitProgress('serialize:complete', { pageCount })
        return buildFullSnapshot()
      })()
    }
  }
}

export async function serializeIntermediate(intermediate) {
  const serializer = createProgressiveSerializer(intermediate)
  return serializer.resolve()
}
