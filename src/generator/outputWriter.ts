import { promises as fs } from 'node:fs'
import path from 'node:path'

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

  const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`

  try {
    await fs.writeFile(tempPath, contents, { encoding })
    await fs.rename(tempPath, filePath)
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true })
    } catch {
      // ignore cleanup errors
    }
    throw error
  }
}
