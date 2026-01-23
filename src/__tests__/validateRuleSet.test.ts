import { describe, it, expect } from '@jest/globals'
import { validateRuleSet } from '@PdfParser'
import { createMockRuleSet, createMockRule } from '@PdfParser'

describe('validateRuleSet', () => {
  it('通过有效规则集', () => {
    const ruleSet = createMockRuleSet()
    const result = validateRuleSet(ruleSet)

    expect(result.isValid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  it('拒绝空 rules', () => {
    const ruleSet = createMockRuleSet({ rules: [] })
    const result = validateRuleSet(ruleSet)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((item) => item.path === 'rules')).toBe(true)
  })

  it('拒绝非法 seed', () => {
    const ruleSet = createMockRuleSet({ seed: 1.2 })
    const result = validateRuleSet(ruleSet)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((item) => item.path === 'seed')).toBe(true)
  })

  it('拒绝非法类型', () => {
    const ruleSet = createMockRuleSet({
      rules: [createMockRule({ type: 'invalid' as never })]
    })
    const result = validateRuleSet(ruleSet)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((item) => item.path.includes('.type'))).toBe(true)
  })

  it('拒绝错误类型约束', () => {
    const ruleSet = createMockRuleSet({
      rules: [
        createMockRule({
          type: 'string',
          constraints: { enum: ['A', 'B'] }
        })
      ]
    })
    const result = validateRuleSet(ruleSet)

    expect(result.isValid).toBe(false)
    expect(
      result.errors.some((item) => item.path.includes('constraints.enum'))
    ).toBe(true)
  })

  it('拒绝 error case 缺少 expected', () => {
    const ruleSet = createMockRuleSet({
      rules: [
        createMockRule({
          cases: [{ caseType: 'error', overrides: {} }]
        })
      ]
    })
    const result = validateRuleSet(ruleSet)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((item) => item.path.includes('expected'))).toBe(
      true
    )
  })

  it('拒绝 length.min 大于 length.max', () => {
    const ruleSet = createMockRuleSet({
      rules: [
        createMockRule({
          constraints: { length: { min: 10, max: 2 } }
        })
      ]
    })
    const result = validateRuleSet(ruleSet)

    expect(result.isValid).toBe(false)
    expect(
      result.errors.some((item) => item.path.includes('constraints.length'))
    ).toBe(true)
  })
})
