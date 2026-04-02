import { describe, expect, it } from '@jest/globals'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeOutputFile } from '@PdfParser/node'

describe('writeOutputFile', () => {
  it('在 overwrite 为 false 时不会覆盖已有文件', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'output-writer-'))
    const filePath = path.join(tempDir, 'result.json')

    try {
      await writeOutputFile(filePath, 'first', { overwrite: false })

      await expect(
        writeOutputFile(filePath, 'second', { overwrite: false })
      ).rejects.toThrow(`目标文件已存在: ${filePath}`)

      await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('first')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
