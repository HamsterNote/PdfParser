import { describe, it, expect } from '@jest/globals'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGeneration } from '@PdfParser'
import { createMockRuleSet, createMockRule } from '@PdfParser'

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw) as T
}

describe('runGeneration', () => {
  it('生成输出文件与报告', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-gen-'))
    const ruleSet = createMockRuleSet({
      id: 'ruleset-001',
      rules: [
        createMockRule({
          id: 'rule-1',
          path: 'textItem.str',
          cases: [
            { caseType: 'normal', overrides: {} },
            { caseType: 'boundary', overrides: { str: '' } }
          ]
        })
      ]
    })

    const result = await runGeneration(ruleSet, {
      outputDir: tempDir,
      overwrite: true
    })

    expect(result.caseCount).toBe(2)

    const data = await readJson<unknown[]>(result.outputPaths.data)
    const cases = await readJson<unknown[]>(result.outputPaths.cases)
    const report = await readJson<{ caseCount: number }>(
      result.outputPaths.report
    )

    expect(data.length).toBe(2)
    expect(cases.length).toBe(2)
    expect(report.caseCount).toBe(2)
  })
})
