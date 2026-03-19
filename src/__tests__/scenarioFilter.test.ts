import { describe, it, expect } from '@jest/globals'
import { filterRuleCases, filterRuleSetScenarios } from '@PdfParser'
import { createMockRuleSet, createMockRule } from '@PdfParser'
import type { MockRuleCase } from '@PdfParser'

describe('scenario filter', () => {
  it('根据 include 过滤 case', () => {
    const cases: MockRuleCase[] = [
      { caseType: 'normal', overrides: {} },
      { caseType: 'boundary', overrides: {} }
    ]
    const result = filterRuleCases(cases, { includeScenarios: ['boundary'] })

    expect(result).toHaveLength(1)
    expect(result[0].caseType).toBe('boundary')
  })

  it('根据 exclude 过滤 case', () => {
    const cases: MockRuleCase[] = [
      { caseType: 'normal', overrides: {} },
      { caseType: 'error', overrides: {} }
    ]
    const result = filterRuleCases(cases, { excludeScenarios: ['error'] })

    expect(result).toHaveLength(1)
    expect(result[0].caseType).toBe('normal')
  })

  it('合并规则集 exclusions 与 options', () => {
    const ruleSet = createMockRuleSet({
      exclusions: ['error'],
      rules: [
        createMockRule({
          cases: [
            { caseType: 'normal', overrides: {} },
            { caseType: 'error', overrides: {} }
          ]
        })
      ]
    })

    const filtered = filterRuleSetScenarios(ruleSet, {
      excludeScenarios: ['boundary']
    })

    expect(filtered.rules[0].cases).toHaveLength(1)
    expect(filtered.rules[0].cases[0].caseType).toBe('normal')
  })
})
