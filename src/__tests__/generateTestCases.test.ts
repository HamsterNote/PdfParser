import { describe, expect, it } from '@jest/globals'
import path from 'node:path'
import { createMockDataSample, createMockRuleSet } from '@PdfParser'
import { generateTestCases } from '@PdfParser/node'

describe('generateTestCases', () => {
  it('传播样本 expected 并生成跨平台路径', () => {
    const ruleSet = createMockRuleSet({ id: 'ruleset-001' })
    const samples = [
      createMockDataSample({
        id: 'sample-001',
        ruleSetId: ruleSet.id,
        expected: { code: 'INVALID_INPUT' }
      })
    ]

    const cases = generateTestCases(ruleSet, samples, {
      outputDir: 'test/generated/cases'
    })

    expect(cases).toHaveLength(1)
    expect(cases[0].expected).toEqual({ code: 'INVALID_INPUT' })
    expect(cases[0].filePath).toBe(
      path.join('test/generated/cases', 'sample-001.test.json')
    )
  })

  it('在样本没有 expected 时回退为空对象', () => {
    const ruleSet = createMockRuleSet({ id: 'ruleset-001' })
    const samples = [
      createMockDataSample({
        id: 'sample-002',
        ruleSetId: ruleSet.id
      })
    ]

    const cases = generateTestCases(ruleSet, samples)

    expect(cases[0].expected).toEqual({})
  })
})
