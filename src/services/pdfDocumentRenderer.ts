import type {
  IntermediateDocument,
  IntermediateText
} from '@hamster-note/types'
import PDFDocument from 'pdfkit'

export async function renderIntermediateDocumentToPdfBuffer(
  document: IntermediateDocument
): Promise<ArrayBuffer> {
  const pdfDocument = new PDFDocument({ autoFirstPage: false })
  const chunks: Buffer[] = []

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      pdfDocument.off('data', handleData)
      pdfDocument.off('end', handleEnd)
      pdfDocument.off('error', handleError)
    }

    const settleResolve = (result: ArrayBuffer) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const settleReject = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const handleData = (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk))
    }

    const handleEnd = () => {
      try {
        const pdfBuffer = Buffer.concat(chunks)
        settleResolve(copyBufferToArrayBuffer(pdfBuffer))
      } catch (error) {
        settleReject(toError(error))
      }
    }

    const handleError = (error: Error) => {
      settleReject(error)
    }

    pdfDocument.on('data', handleData)
    pdfDocument.once('end', handleEnd)
    pdfDocument.once('error', handleError)

    appendPlaceholderPages(pdfDocument, document)
      .then(() => {
        pdfDocument.end()
      })
      .catch((error) => {
        settleReject(toError(error))
      })
  })
}

async function appendPlaceholderPages(
  pdfDocument: PDFKit.PDFDocument,
  document: IntermediateDocument
): Promise<void> {
  const pageNumbers = [...document.pageNumbers].sort(
    (left, right) => left - right
  )

  for (const pageNumber of pageNumbers) {
    const page = await document.getPageByPageNumber(pageNumber)
    const size = document.getPageSizeByPageNumber(pageNumber)

    if (!page || !size) {
      continue
    }

    pdfDocument.addPage({
      size: [size.x, size.y],
      margin: 0
    })

    for (const text of page.texts) {
      const content = String(text.content ?? '')

      if (content.trim().length === 0) {
        continue
      }

      if (!Number.isFinite(text.x) || !Number.isFinite(text.y)) {
        continue
      }

      const fontSize = resolveFontSize(text)

      try {
        pdfDocument.fontSize(fontSize).text(content, text.x, text.y, {
          lineBreak: false
        })
      } catch (error) {
        toError(error)
      }
    }
  }
}

function resolveFontSize(
  text: Pick<IntermediateText, 'fontSize' | 'height' | 'lineHeight'>
): number {
  if (Number.isFinite(text.fontSize) && text.fontSize > 0) {
    return text.fontSize
  }

  return Math.max(
    Number.isFinite(text.height) ? text.height : 0,
    Number.isFinite(text.lineHeight) ? text.lineHeight : 0,
    12
  )
}

function copyBufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copied = Uint8Array.from(buffer)
  return copied.buffer
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
