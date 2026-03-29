import fs from 'node:fs/promises'

const SRC = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
const DEST = 'dist/pdf.worker.min.mjs'

async function main() {
  try {
    await fs.access(SRC)
    await fs.copyFile(SRC, DEST)
    console.log(`Copied: ${SRC} -> ${DEST}`)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Source file not found: ${SRC}`)
      process.exit(1)
    }
    throw err
  }
}

main()
