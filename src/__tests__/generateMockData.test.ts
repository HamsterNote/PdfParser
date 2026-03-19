import { describe, expect, it } from '@jest/globals'
import { createMockRule, createMockRuleSet, generateMockData } from '@PdfParser'

describe('generateMockData', () => {
  it('保留 error case 的 expected 信息', () => {
    const ruleSet = createMockRuleSet({
      rules: [
        createMockRule({
          id: 'rule-1',
          cases: [
            {
              caseType: 'error',
              overrides: {},
              expected: { code: 'INVALID_INPUT' }
            }
          ]
        })
      ]
    })

    const result = generateMockData(ruleSet)

    expect(result.samples).toHaveLength(1)
    expect(result.samples[0].expected).toEqual({ code: 'INVALID_INPUT' })
  })
})
