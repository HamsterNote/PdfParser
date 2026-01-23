import type { MockRuleSet } from '../rules/types'
import { loadRuleSet } from '../rules/ruleSetStore'
import { runGeneration, type RunGenerationOptions } from '../generator/runGeneration'

export type MockGenerationServiceInput = RunGenerationOptions & {
  ruleSetPath?: string
  ruleSet?: MockRuleSet
}

export async function generateMockTests(
  input: MockGenerationServiceInput
) {
  const ruleSet = input.ruleSet
    ? input.ruleSet
    : input.ruleSetPath
      ? await loadRuleSet(input.ruleSetPath)
      : null

  if (!ruleSet) {
    throw new Error('ruleSet 或 ruleSetPath 必须提供')
  }

  return runGeneration(ruleSet, input)
}
