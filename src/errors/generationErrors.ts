export type GenerationErrorCode =
  | 'INVALID_RULE_SET'
  | 'OUTPUT_WRITE_FAILED'
  | 'EMPTY_SCENARIO'
  | 'RULE_SET_STORE_ERROR'
  | 'UNKNOWN'

export type GenerationErrorDetails = {
  code: GenerationErrorCode
  message: string
  suggestion?: string
  cause?: unknown
}

const defaultSuggestions: Record<GenerationErrorCode, string> = {
  INVALID_RULE_SET: '请检查规则集结构、类型与约束是否满足要求。',
  OUTPUT_WRITE_FAILED: '请确认输出目录权限与覆盖策略。',
  EMPTY_SCENARIO: '请检查 include/exclude 设置，确保至少包含一个场景。',
  RULE_SET_STORE_ERROR: '请确认规则集文件可读写且 JSON 结构正确。',
  UNKNOWN: '请查看详细日志以定位问题。'
}

export class GenerationError extends Error {
  readonly code: GenerationErrorCode
  readonly suggestion: string
  readonly cause?: unknown

  constructor(details: GenerationErrorDetails) {
    super(details.message)
    this.name = 'GenerationError'
    this.code = details.code
    this.suggestion =
      details.suggestion ?? defaultSuggestions[details.code] ?? ''
    this.cause = details.cause
  }
}

export function toGenerationError(
  error: unknown,
  fallback: GenerationErrorDetails
): GenerationError {
  if (error instanceof GenerationError) return error
  return new GenerationError({
    ...fallback,
    cause: error
  })
}
