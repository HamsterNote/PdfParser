import { GenerationError } from '../errors/generationErrors'
import type {
  MockDataSample,
  MockRule,
  MockRuleCase,
  MockRuleSet
} from '../rules/types'
import { createSeededRandom, normalizeSeed } from './seededRandom'
import { filterRuleSetScenarios } from './scenarioFilter'

export type GenerateMockDataOptions = {
  seed?: number
  includeScenarios?: string[]
  excludeScenarios?: string[]
}

export type GenerateMockDataResult = {
  seedUsed: number
  samples: MockDataSample[]
  filteredRuleSet: MockRuleSet
}

type PlainRecord = Record<string, unknown>

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function setPathValue(target: PlainRecord, path: string, value: unknown): void {
  const segments = path.split('.').filter(Boolean)
  if (segments.length === 0) return
  let cursor: PlainRecord = target
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value
      return
    }
    const next = cursor[segment]
    if (!isPlainRecord(next)) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as PlainRecord
  })
}

function deepMerge(target: PlainRecord, source: PlainRecord): void {
  Object.entries(source).forEach(([key, value]) => {
    const current = target[key]
    if (isPlainRecord(current) && isPlainRecord(value)) {
      deepMerge(current, value)
      return
    }
    target[key] = value
  })
}

function applyOverrides(
  payload: PlainRecord,
  path: string,
  overrides: PlainRecord
): void {
  const overrideKeys = Object.keys(overrides)
  if (overrideKeys.length === 0) return

  const leaf = path.split('.').filter(Boolean).pop()
  const usedKeys = new Set<string>()
  if (leaf && Object.prototype.hasOwnProperty.call(overrides, leaf)) {
    setPathValue(payload, path, overrides[leaf])
    usedKeys.add(leaf)
  }

  const remaining: PlainRecord = {}
  overrideKeys.forEach((key) => {
    if (!usedKeys.has(key)) {
      remaining[key] = overrides[key]
    }
  })

  if (Object.keys(remaining).length > 0) {
    deepMerge(payload, remaining)
  }
}

function generateValue(
  rule: MockRule,
  random: ReturnType<typeof createSeededRandom>
): unknown {
  switch (rule.type) {
    case 'string': {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
      const min = rule.constraints?.length?.min ?? 1
      const max = rule.constraints?.length?.max ?? Math.max(min, 12)
      const length = random.nextInt(min, max)
      let value = ''
      for (let i = 0; i < length; i += 1) {
        const idx = random.nextInt(0, alphabet.length - 1)
        value += alphabet[idx]
      }
      return value
    }
    case 'number': {
      const min = rule.constraints?.min ?? 0
      const max = rule.constraints?.max ?? Math.max(min, 100)
      return random.nextInt(Math.floor(min), Math.floor(max))
    }
    case 'enum': {
      const choices = rule.constraints?.enum ?? []
      if (choices.length === 0) return ''
      return choices[random.nextInt(0, choices.length - 1)]
    }
    case 'boolean': {
      return random.next() > 0.5
    }
    case 'array': {
      return []
    }
    case 'object': {
      return {}
    }
    default: {
      return null
    }
  }
}

function buildSample(
  ruleSetId: string,
  rule: MockRule,
  ruleCase: MockRuleCase,
  index: number,
  seedUsed: number,
  random: ReturnType<typeof createSeededRandom>
): MockDataSample {
  const payload: PlainRecord = {}
  const baseValue = generateValue(rule, random)
  setPathValue(payload, rule.path, baseValue)
  applyOverrides(payload, rule.path, ruleCase.overrides)

  return {
    id: `${ruleSetId}-${rule.id}-${ruleCase.caseType}-${index}`,
    ruleSetId,
    caseType: ruleCase.caseType,
    payload,
    seedUsed,
    generatedAt: new Date().toISOString()
  }
}

export function generateMockData(
  ruleSet: MockRuleSet,
  options: GenerateMockDataOptions = {}
): GenerateMockDataResult {
  const seedUsed = normalizeSeed(options.seed ?? ruleSet.seed)
  const filteredRuleSet = filterRuleSetScenarios(ruleSet, {
    includeScenarios: options.includeScenarios,
    excludeScenarios: options.excludeScenarios
  })

  if (!filteredRuleSet.rules || filteredRuleSet.rules.length === 0) {
    throw new GenerationError({
      code: 'EMPTY_SCENARIO',
      message: '过滤后没有可用规则'
    })
  }

  const random = createSeededRandom(seedUsed)
  const samples: MockDataSample[] = []
  let index = 0
  filteredRuleSet.rules.forEach((rule) => {
    rule.cases.forEach((ruleCase) => {
      samples.push(
        buildSample(ruleSet.id, rule, ruleCase, index, seedUsed, random)
      )
      index += 1
    })
  })

  if (samples.length === 0) {
    throw new GenerationError({
      code: 'EMPTY_SCENARIO',
      message: '未生成任何 mock 数据样本'
    })
  }

  return { seedUsed, samples, filteredRuleSet }
}
