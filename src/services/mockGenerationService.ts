import type { MockRuleSet } from '../rules/types'
import { loadRuleSet } from '../rules/ruleSetStore'
import {
  runGeneration,
  type RunGenerationOptions
} from '../generator/runGeneration'

export type MockGenerationServiceInput = RunGenerationOptions & {
  ruleSetPath?: string
  ruleSet?: MockRuleSet
}

export async function generateMockTests(input: MockGenerationServiceInput) {
  let ruleSet: MockRuleSet | null = null

  if (input.ruleSet) {
    ruleSet = input.ruleSet
  } else if (input.ruleSetPath) {
    ruleSet = await loadRuleSet(input.ruleSetPath)
  }

  if (!ruleSet) {
    throw new Error('ruleSet 或 ruleSetPath 必须提供')
  }

  return runGeneration(ruleSet, input)
}
