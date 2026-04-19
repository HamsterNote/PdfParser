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

async function resolvePages(intermediate) {
  const pages = await intermediate.pages
  return Promise.all(
    pages.map(async (page) => {
      let texts = []
      if (Array.isArray(page.texts)) {
        texts = page.texts
      } else if (typeof page.getTexts === 'function') {
        texts = await page.getTexts()
      }

      return buildPageSummary(page, texts)
    })
  )
}

async function resolveCoverAvailable(intermediate) {
  if (typeof intermediate.getCover !== 'function') {
    return false
  }

  const cover = await intermediate.getCover(0.25).catch(() => undefined)
  return typeof cover === 'string' && cover.length > 0
}

export async function serializeIntermediate(intermediate) {
  const outline =
    typeof intermediate.getOutline === 'function'
      ? (intermediate.getOutline() ?? [])
      : (intermediate.outline ?? [])
  const pages = await resolvePages(intermediate)

  return {
    id: intermediate.id,
    title: intermediate.title,
    pageCount: pages.length,
    hasOutline: outline.length > 0,
    pageNumbers: pages.map((page) => page.number),
    coverAvailable: await resolveCoverAvailable(intermediate),
    pages
  }
}
