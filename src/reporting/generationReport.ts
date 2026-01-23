export type GenerationReport = {
  runId: string
  ruleSetId: string
  caseCount: number
  failureCount: number
  startedAt: string
  finishedAt: string
  errors?: string[]
}

export function createGenerationReport(
  input: Omit<GenerationReport, 'finishedAt'>,
  finishedAt: string = new Date().toISOString()
): GenerationReport {
  return {
    ...input,
    finishedAt
  }
}
