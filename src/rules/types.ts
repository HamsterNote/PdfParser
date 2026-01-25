export type RuleType =
  | 'string'
  | 'number'
  | 'enum'
  | 'object'
  | 'array'
  | 'boolean'

export type RuleCaseType = 'normal' | 'boundary' | 'error'

export type RuleLengthConstraint = {
  min?: number
  max?: number
}

export type RuleConstraints = {
  min?: number
  max?: number
  enum?: string[]
  pattern?: string
  nullable?: boolean
  length?: RuleLengthConstraint
}

export type MockRuleCase = {
  caseType: RuleCaseType
  overrides: Record<string, unknown>
  expected?: Record<string, unknown>
}

export type MockRule = {
  id: string
  path: string
  type: RuleType
  constraints?: RuleConstraints
  cases: MockRuleCase[]
}

export type MockRuleSet = {
  id: string
  name: string
  version: string
  targetModule: string
  seed: number
  rules: MockRule[]
  exclusions?: string[]
  createdAt?: string
  updatedAt?: string
}

export type MockDataSample = {
  id: string
  ruleSetId: string
  caseType: RuleCaseType
  payload: Record<string, unknown>
  seedUsed: number
  generatedAt: string
}

export type TestCase = {
  id: string
  ruleSetId: string
  targetModule: string
  caseType: RuleCaseType
  input: Record<string, unknown>
  expected: Record<string, unknown>
  filePath: string
}

export type CoverageSummary = {
  lines: number
  statements: number
  functions: number
  branches: number
}

export type CoverageBaseline = {
  id: string
  targetModule: string
  summary: CoverageSummary
  capturedAt: string
}

export type CoverageComparison = {
  id: string
  baselineId: string
  afterId: string
  delta: CoverageSummary
  generatedAt: string
}

export type GenerationRun = {
  id: string
  ruleSetId: string
  status: 'running' | 'succeeded' | 'failed'
  caseCount: number
  failureCount: number
  errorMessage?: string
  startedAt: string
  finishedAt?: string
}
