import { describe, it, expect } from '@jest/globals'
import {
  createMockRuleSet,
  createMockRule,
  createMockDataSample,
  resetFactoryCounters
} from '@PdfParser'

describe('factories', () => {
  it('生成规则集默认字段', () => {
    const ruleSet = createMockRuleSet()

    expect(ruleSet.id).toContain('ruleset')
    expect(ruleSet.rules.length).toBeGreaterThan(0)
    expect(ruleSet.seed).toBe(1)
  })

  it('支持覆盖字段', () => {
    const ruleSet = createMockRuleSet({ name: 'custom', seed: 123 })

    expect(ruleSet.name).toBe('custom')
    expect(ruleSet.seed).toBe(123)
  })

  it('重置计数器后 id 可重复', () => {
    resetFactoryCounters()
    const first = createMockRule()
    resetFactoryCounters()
    const second = createMockRule()

    expect(first.id).toBe(second.id)
  })

  it('生成样本带有默认字段', () => {
    const sample = createMockDataSample()
    expect(sample.id).toContain('sample')
    expect(sample.payload).toBeDefined()
  })
})
