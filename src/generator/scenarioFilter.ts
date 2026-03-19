import type { MockRule, MockRuleCase, MockRuleSet } from '../rules/types'

export type ScenarioFilterOptions = {
  includeScenarios?: string[]
  excludeScenarios?: string[]
}

function normalizeList(values?: string[]): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean)
}

export function filterRuleCases(
  cases: MockRuleCase[],
  options: ScenarioFilterOptions
): MockRuleCase[] {
  const include = new Set(normalizeList(options.includeScenarios))
  const exclude = new Set(normalizeList(options.excludeScenarios))

  return cases.filter((item) => {
    if (include.size > 0 && !include.has(item.caseType)) return false
    if (exclude.has(item.caseType)) return false
    return true
  })
}

export function filterRuleSetScenarios(
  ruleSet: MockRuleSet,
  options: ScenarioFilterOptions
): MockRuleSet {
  const combinedExclusions = normalizeList(ruleSet.exclusions)
  const excludeScenarios = new Set([
    ...combinedExclusions,
    ...normalizeList(options.excludeScenarios)
  ])

  const mergedOptions: ScenarioFilterOptions = {
    includeScenarios: options.includeScenarios,
    excludeScenarios: Array.from(excludeScenarios)
  }

  const filteredRules: MockRule[] = ruleSet.rules
    .map((rule) => ({
      ...rule,
      cases: filterRuleCases(rule.cases, mergedOptions)
    }))
    .filter((rule) => rule.cases.length > 0)

  return {
    ...ruleSet,
    rules: filteredRules
  }
}
