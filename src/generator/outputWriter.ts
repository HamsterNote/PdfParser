import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type OutputWriteOptions = {
  overwrite?: boolean
  encoding?: BufferEncoding
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function writeOutputFile(
  filePath: string,
  contents: string,
  options: OutputWriteOptions = {}
): Promise<void> {
  const { overwrite = false, encoding = 'utf-8' } = options
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  if (!overwrite && (await fileExists(filePath))) {
    throw new Error(`目标文件已存在: ${filePath}`)
  }

  // Use crypto for secure random values in temp file naming
  const randomBytes = crypto.randomBytes(8).toString('hex')
  const tempPath = `${filePath}.tmp-${Date.now()}-${randomBytes}`

  try {
    await fs.writeFile(tempPath, contents, { encoding })

    if (overwrite) {
      await fs.rename(tempPath, filePath)
    } else {
      await fs.copyFile(tempPath, filePath, fs.constants.COPYFILE_EXCL)
      await fs.rm(tempPath, { force: true })
    }
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true })
    } catch {
      // ignore cleanup errors
    }
    throw error
  }
}
