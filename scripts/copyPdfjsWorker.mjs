import fs from 'node:fs/promises'

const WORKER_SRC = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
const WORKER_DEST = 'dist/pdf.worker.min.mjs'
const STANDARD_FONTS_SRC = 'node_modules/pdfjs-dist/standard_fonts'
const STANDARD_FONTS_DEST = 'dist/standard_fonts'

async function main() {
  try {
    await fs.access(WORKER_SRC)
    await fs.access(STANDARD_FONTS_SRC)
    await fs.copyFile(WORKER_SRC, WORKER_DEST)
    await fs.cp(STANDARD_FONTS_SRC, STANDARD_FONTS_DEST, { recursive: true })
    console.log(`Copied: ${WORKER_SRC} -> ${WORKER_DEST}`)
    console.log(`Copied: ${STANDARD_FONTS_SRC} -> ${STANDARD_FONTS_DEST}`)
  } catch (err) {
    if (err.code === 'ENOENT') {
      const missingPath = err.path ?? `${WORKER_SRC} or ${STANDARD_FONTS_SRC}`
      console.error(`Source file not found: ${missingPath}`)
      process.exit(1)
    }
    throw err
  }
}

main()
