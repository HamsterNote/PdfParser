import path from 'node:path'
import { GenerationError, toGenerationError } from '../errors/generationErrors'
import type { MockRuleSet } from '../rules/types'
import { validateRuleSet } from '../rules/validateRuleSet'
import { createGenerationReport } from '../reporting/generationReport'
import { writeOutputFile } from './outputWriter'
import { generateMockData, type GenerateMockDataOptions } from './generateMockData'
import { generateTestCases } from './generateTestCases'

export type RunGenerationOptions = GenerateMockDataOptions & {
  outputDir?: string
  overwrite?: boolean
}

export type RunGenerationResult = {
  runId: string
  caseCount: number
  outputPaths: {
    data: string
    cases: string
    report: string
  }
}

export async function runGeneration(
  ruleSet: MockRuleSet,
  options: RunGenerationOptions = {}
): Promise<RunGenerationResult> {
  const validation = validateRuleSet(ruleSet)
  if (!validation.isValid) {
    throw new GenerationError({
      code: 'INVALID_RULE_SET',
      message: validation.errors.map((item) => item.message).join(', ')
    })
  }

  const startedAt = new Date().toISOString()
  const outputDir = options.outputDir ?? 'test/generated'

  try {
    const { samples } = generateMockData(ruleSet, options)
    const testCases = generateTestCases(ruleSet, samples, {
      outputDir: path.join(outputDir, 'cases')
    })
    const report = createGenerationReport({
      runId: `run-${Date.now()}`,
      ruleSetId: ruleSet.id,
      caseCount: testCases.length,
      failureCount: 0,
      startedAt
    })

    const dataPath = path.join(outputDir, 'data', 'mock-data.json')
    const casesPath = path.join(outputDir, 'cases', 'test-cases.json')
    const reportPath = path.join(outputDir, 'report.json')

    await writeOutputFile(dataPath, JSON.stringify(samples, null, 2), {
      overwrite: options.overwrite
    })
    await writeOutputFile(casesPath, JSON.stringify(testCases, null, 2), {
      overwrite: options.overwrite
    })
    await writeOutputFile(reportPath, JSON.stringify(report, null, 2), {
      overwrite: options.overwrite
    })

    return {
      runId: report.runId,
      caseCount: report.caseCount,
      outputPaths: {
        data: dataPath,
        cases: casesPath,
        report: reportPath
      }
    }
  } catch (error) {
    throw toGenerationError(error, {
      code: 'UNKNOWN',
      message: '生成流程失败'
    })
  }
}
