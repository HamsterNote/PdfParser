import './polyfills/promise-withresolvers.polyfill'
import './polyfills/dom-matrix.polyfill'

export { PdfParser } from './pdfParser'

export type {
  CoverageBaseline,
  CoverageComparison,
  CoverageSummary,
  GenerationRun,
  MockDataSample,
  MockRule,
  MockRuleCase,
  MockRuleSet,
  RuleCaseType,
  RuleConstraints,
  RuleLengthConstraint,
  RuleType,
  TestCase
} from './rules/types'
export type {
  RuleSetValidationIssue,
  RuleSetValidationResult
} from './rules/validateRuleSet'
export { validateRuleSet } from './rules/validateRuleSet'
export { createSeededRandom, normalizeSeed } from './generator/seededRandom'
export {
  filterRuleCases,
  filterRuleSetScenarios,
  type ScenarioFilterOptions
} from './generator/scenarioFilter'
export {
  createCoverageBaseline,
  createCoverageComparison,
  createCoverageSummary,
  createGenerationRun,
  createMockDataSample,
  createMockRule,
  createMockRuleCase,
  createMockRuleSet,
  createRuleConstraints,
  createTestCase,
  resetFactoryCounters
} from './generator/factories'
export { GenerationError, toGenerationError } from './errors/generationErrors'
export { generateMockData } from './generator/generateMockData'
export type { GenerationReport } from './reporting/generationReport'
export { createGenerationReport } from './reporting/generationReport'
