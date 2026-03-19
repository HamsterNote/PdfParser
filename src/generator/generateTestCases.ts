import path from 'node:path'
import type { MockDataSample, MockRuleSet, TestCase } from '../rules/types'

export type GenerateTestCasesOptions = {
  outputDir?: string
}

export function generateTestCases(
  ruleSet: MockRuleSet,
  samples: MockDataSample[],
  options: GenerateTestCasesOptions = {}
): TestCase[] {
  const outputDir = options.outputDir ?? 'test/generated/cases'

  return samples.map((sample) => ({
    id: `${sample.id}-case`,
    ruleSetId: ruleSet.id,
    targetModule: ruleSet.targetModule,
    caseType: sample.caseType,
    input: sample.payload,
    expected: sample.expected ?? {},
    filePath: path.join(outputDir, `${sample.id}.test.json`)
  }))
}
