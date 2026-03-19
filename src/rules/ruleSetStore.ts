import { promises as fs } from 'node:fs'
import path from 'node:path'
import { GenerationError } from '../errors/generationErrors'
import { writeOutputFile } from '../generator/outputWriter'
import { validateRuleSet } from './validateRuleSet'
import type { MockRuleSet } from './types'

export type RuleSetStoreOptions = {
  validate?: boolean
  overwrite?: boolean
}

function getTimestamp(now?: string): string {
  return now ?? new Date().toISOString()
}

export async function loadRuleSet(filePath: string): Promise<MockRuleSet> {
  try {
    const contents = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(contents) as MockRuleSet
    return parsed
  } catch (error) {
    throw new GenerationError({
      code: 'RULE_SET_STORE_ERROR',
      message: `无法读取规则集: ${filePath}`,
      cause: error
    })
  }
}

export async function saveRuleSet(
  ruleSet: MockRuleSet,
  filePath: string,
  options: RuleSetStoreOptions = {}
): Promise<void> {
  const { validate = true, overwrite = false } = options
  if (validate) {
    const result = validateRuleSet(ruleSet)
    if (!result.isValid) {
      throw new GenerationError({
        code: 'INVALID_RULE_SET',
        message: `规则集校验失败: ${result.errors
          .map((item) => `${item.path}:${item.message}`)
          .join(', ')}`
      })
    }
  }

  const payload = JSON.stringify(ruleSet, null, 2)
  await writeOutputFile(filePath, payload, { overwrite })
}

export function updateRuleSet(
  ruleSet: MockRuleSet,
  updates: Partial<MockRuleSet>,
  now?: string
): MockRuleSet {
  return {
    ...ruleSet,
    ...updates,
    updatedAt: getTimestamp(now)
  }
}

export async function upsertRuleSet(
  ruleSet: MockRuleSet,
  filePath: string,
  options: RuleSetStoreOptions = {}
): Promise<void> {
  const { overwrite = true, validate = true } = options
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  await saveRuleSet(ruleSet, filePath, { overwrite, validate })
}
