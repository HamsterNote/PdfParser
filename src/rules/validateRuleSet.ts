import type { MockRule, MockRuleSet, RuleConstraints, RuleType } from './types'

export type RuleSetValidationIssue = {
  path: string
  message: string
}

export type RuleSetValidationResult = {
  isValid: boolean
  errors: RuleSetValidationIssue[]
}

const ruleTypes: RuleType[] = [
  'string',
  'number',
  'enum',
  'object',
  'array',
  'boolean'
]

const caseTypes = ['normal', 'boundary', 'error'] as const

function pushError(
  errors: RuleSetValidationIssue[],
  path: string,
  message: string
): void {
  errors.push({ path, message })
}

function validateEnumConstraints(
  constraints: RuleConstraints,
  rule: MockRule,
  errors: RuleSetValidationIssue[]
): void {
  if (!constraints.enum) return

  if (rule.type !== 'enum') {
    pushError(
      errors,
      `${rule.path}.constraints.enum`,
      'enum 只能用于 enum 类型规则'
    )
    return
  }

  if (constraints.enum.length === 0) {
    pushError(errors, `${rule.path}.constraints.enum`, 'enum 不能为空')
  }
}

function validatePatternConstraints(
  constraints: RuleConstraints,
  rule: MockRule,
  errors: RuleSetValidationIssue[]
): void {
  if (!constraints.pattern) return

  if (rule.type !== 'string') {
    pushError(
      errors,
      `${rule.path}.constraints.pattern`,
      'pattern 只能用于 string 类型规则'
    )
    return
  }

  try {
    new RegExp(constraints.pattern)
  } catch {
    pushError(
      errors,
      `${rule.path}.constraints.pattern`,
      'pattern 必须是合法正则'
    )
  }
}

function validateNumericConstraints(
  constraints: RuleConstraints,
  rule: MockRule,
  errors: RuleSetValidationIssue[]
): void {
  const hasMin = typeof constraints.min === 'number'
  const hasMax = typeof constraints.max === 'number'

  if (!hasMin && !hasMax) return

  if (rule.type !== 'number') {
    pushError(
      errors,
      `${rule.path}.constraints`,
      'min/max 只能用于 number 类型规则'
    )
    return
  }

  if (hasMin && hasMax && (constraints.min ?? NaN) > (constraints.max ?? NaN)) {
    pushError(errors, `${rule.path}.constraints`, 'min 不能大于 max')
  }
}

function validateLengthConstraints(
  constraints: RuleConstraints,
  errors: RuleSetValidationIssue[],
  path: string
): void {
  if (!constraints.length) return

  const hasMin = typeof constraints.length?.min === 'number'
  const hasMax = typeof constraints.length?.max === 'number'

  if (
    hasMin &&
    hasMax &&
    (constraints.length.min ?? NaN) > (constraints.length.max ?? NaN)
  ) {
    pushError(
      errors,
      `${path}.constraints.length`,
      'length.min 不能大于 length.max'
    )
  }
}

function validateConstraints(
  constraints: RuleConstraints | undefined,
  rule: MockRule,
  errors: RuleSetValidationIssue[]
): void {
  if (!constraints) return

  validateEnumConstraints(constraints, rule, errors)
  validatePatternConstraints(constraints, rule, errors)
  validateNumericConstraints(constraints, rule, errors)

  if (rule.type !== 'string' && constraints.length !== undefined) {
    pushError(
      errors,
      `${rule.path}.constraints.length`,
      'length 只能用于 string 类型规则'
    )
  } else if (rule.type === 'string' && constraints.length !== undefined) {
    validateLengthConstraints(constraints, errors, rule.path)
  }
}

export function validateRuleSet(ruleSet: MockRuleSet): RuleSetValidationResult {
  const errors: RuleSetValidationIssue[] = []

  if (!ruleSet.rules || ruleSet.rules.length === 0) {
    pushError(errors, 'rules', 'rules 不能为空')
  }

  if (!Number.isInteger(ruleSet.seed)) {
    pushError(errors, 'seed', 'seed 必须是整数')
  }

  if (!ruleSet.targetModule || ruleSet.targetModule.trim().length === 0) {
    pushError(errors, 'targetModule', 'targetModule 不能为空')
  }

  if (Array.isArray(ruleSet.rules) && ruleSet.rules.length > 0) {
    ruleSet.rules.forEach((rule, index) => {
      const basePath = `rules[${index}]`
      if (!rule.id) {
        pushError(errors, `${basePath}.id`, '规则 id 不能为空')
      }

      if (!rule.path) {
        pushError(errors, `${basePath}.path`, '规则 path 不能为空')
      }

      if (!ruleTypes.includes(rule.type)) {
        pushError(errors, `${basePath}.type`, '规则 type 不合法')
      }

      if (!rule.cases || rule.cases.length === 0) {
        pushError(errors, `${basePath}.cases`, '规则 cases 不能为空')
      }

      rule.cases.forEach((ruleCase, caseIndex) => {
        const casePath = `${basePath}.cases[${caseIndex}]`
        if (!caseTypes.includes(ruleCase.caseType)) {
          pushError(errors, `${casePath}.caseType`, 'caseType 不合法')
        }

        if (ruleCase.caseType === 'error') {
          const expectedKeys = ruleCase.expected
            ? Object.keys(ruleCase.expected)
            : []
          if (expectedKeys.length === 0) {
            pushError(
              errors,
              `${casePath}.expected`,
              'error 类型必须提供可识别的 expected 信息'
            )
          }
        }
      })

      validateConstraints(rule.constraints, rule, errors)
    })
  }

  return { isValid: errors.length === 0, errors }
}
