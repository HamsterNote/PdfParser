import type {
  CoverageBaseline,
  CoverageComparison,
  CoverageSummary,
  GenerationRun,
  MockDataSample,
  MockRule,
  MockRuleCase,
  MockRuleSet,
  RuleConstraints,
  TestCase
} from '../rules/types'

let idCounter = 0

const defaultTimestamp = '1970-01-01T00:00:00.000Z'

function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export function resetFactoryCounters(): void {
  idCounter = 0
}

export function createRuleConstraints(
  overrides: Partial<RuleConstraints> = {}
): RuleConstraints {
  return {
    ...overrides
  }
}

export function createMockRuleCase(
  overrides: Partial<MockRuleCase> = {}
): MockRuleCase {
  return {
    caseType: 'normal',
    overrides: {},
    ...overrides
  }
}

export function createMockRule(overrides: Partial<MockRule> = {}): MockRule {
  return {
    id: nextId('rule'),
    path: 'payload.value',
    type: 'string',
    constraints: createRuleConstraints(),
    cases: [createMockRuleCase()],
    ...overrides
  }
}

export function createMockRuleSet(
  overrides: Partial<MockRuleSet> = {}
): MockRuleSet {
  return {
    id: nextId('ruleset'),
    name: 'default-ruleset',
    version: '1.0.0',
    targetModule: '@PdfParser',
    seed: 1,
    rules: [createMockRule()],
    exclusions: [],
    createdAt: defaultTimestamp,
    updatedAt: defaultTimestamp,
    ...overrides
  }
}

export function createMockDataSample(
  overrides: Partial<MockDataSample> = {}
): MockDataSample {
  return {
    id: nextId('sample'),
    ruleSetId: nextId('ruleset'),
    caseType: 'normal',
    payload: {},
    seedUsed: 1,
    generatedAt: defaultTimestamp,
    ...overrides
  }
}

export function createTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: nextId('testcase'),
    ruleSetId: nextId('ruleset'),
    targetModule: '@PdfParser',
    caseType: 'normal',
    input: {},
    expected: {},
    filePath: 'test/generated/cases/sample.test.ts',
    ...overrides
  }
}

export function createCoverageSummary(
  overrides: Partial<CoverageSummary> = {}
): CoverageSummary {
  return {
    lines: 0,
    statements: 0,
    functions: 0,
    branches: 0,
    ...overrides
  }
}

export function createCoverageBaseline(
  overrides: Partial<CoverageBaseline> = {}
): CoverageBaseline {
  return {
    id: nextId('baseline'),
    targetModule: '@PdfParser',
    summary: createCoverageSummary(),
    capturedAt: defaultTimestamp,
    ...overrides
  }
}

export function createCoverageComparison(
  overrides: Partial<CoverageComparison> = {}
): CoverageComparison {
  return {
    id: nextId('comparison'),
    baselineId: nextId('baseline'),
    afterId: nextId('after'),
    delta: createCoverageSummary(),
    generatedAt: defaultTimestamp,
    ...overrides
  }
}

export function createGenerationRun(
  overrides: Partial<GenerationRun> = {}
): GenerationRun {
  return {
    id: nextId('run'),
    ruleSetId: nextId('ruleset'),
    status: 'running',
    caseCount: 0,
    failureCount: 0,
    startedAt: defaultTimestamp,
    ...overrides
  }
}
