function buildPageSummary(page, texts) {
  return {
    number: page.number,
    width: page.width,
    height: page.height,
    textCount: texts.length,
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

async function resolveCoverAvailable(intermediate) {
  if (typeof intermediate.getCover !== 'function') {
    return false
  }

  const cover = await intermediate.getCover(0.25).catch(() => undefined)
  return typeof cover === 'string' && cover.length > 0
}

export function createProgressiveSerializer(intermediate) {
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

  const coverAvailablePromise = resolveCoverAvailable(intermediate)
  coverAvailablePromise.then((available) => {
    shell.coverAvailable = available
  })

  const pageSummaryCache = new Array(pageCount).fill(undefined)
  const subscribers = []
  let resolutionError = null

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
      try {
        const page = await intermediate.getPageByPageNumber(num)
        if (page === undefined) {
          pageSummaryCache[i] = {
            number: num,
            width: 0,
            height: 0,
            textCount: 0,
            previewText: []
          }
          continue
        }
        let texts = []
        if (Array.isArray(page.texts)) {
          texts = page.texts
        } else if (typeof page.getTexts === 'function') {
          texts = await page.getTexts()
        }
        const summary = buildPageSummary(page, texts)
        pageSummaryCache[i] = summary
        notifySubscribers()
      } catch (err) {
        resolutionError = err
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
        return buildFullSnapshot()
      })()
    }
  }
}

export async function serializeIntermediate(intermediate) {
  const serializer = createProgressiveSerializer(intermediate)
  return serializer.resolve()
}
