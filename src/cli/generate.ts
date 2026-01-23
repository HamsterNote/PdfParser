import { loadRuleSet } from '../rules/ruleSetStore'
import { runGeneration } from '../generator/runGeneration'

type CliOptions = {
  ruleSetPath?: string
  seed?: number
  includeScenarios?: string[]
  excludeScenarios?: string[]
  outputDir?: string
  overwrite?: boolean
}

const helpText = `Usage: yarn test:generate --rules <path> [options]

Options:
  --rules <path>           规则集文件路径
  --seed <number>          覆盖规则集 seed
  --include <list>         仅包含的场景列表（逗号分隔）
  --exclude <list>         排除的场景列表（逗号分隔）
  --output <dir>           输出目录（默认 test/generated）
  --overwrite              允许覆盖已有输出
  --help                   显示帮助
`

function parseList(value?: string): string[] | undefined {
  if (!value) return undefined
  const list = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return list.length > 0 ? list : undefined
}

function parseArgs(args: string[]): CliOptions | null {
  const options: CliOptions = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    switch (arg) {
      case '--rules':
        options.ruleSetPath = args[i + 1]
        i += 1
        break
      case '--seed':
        options.seed = Number(args[i + 1])
        i += 1
        break
      case '--include':
        options.includeScenarios = parseList(args[i + 1])
        i += 1
        break
      case '--exclude':
        options.excludeScenarios = parseList(args[i + 1])
        i += 1
        break
      case '--output':
        options.outputDir = args[i + 1]
        i += 1
        break
      case '--overwrite':
        options.overwrite = true
        break
      case '--help':
        return null
      default:
        break
    }
  }
  return options
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const options = parseArgs(args)
  if (!options) {
    console.log(helpText)
    return
  }

  if (!options.ruleSetPath) {
    console.error('缺少规则集路径。使用 --rules 指定。')
    console.log(helpText)
    process.exitCode = 1
    return
  }

  if (options.seed !== undefined && !Number.isInteger(options.seed)) {
    console.error('seed 必须是整数')
    process.exitCode = 1
    return
  }

  try {
    const ruleSet = await loadRuleSet(options.ruleSetPath)
    const result = await runGeneration(ruleSet, options)
    console.log(`生成完成，输出用例数: ${result.caseCount}`)
    console.log('输出路径:', result.outputPaths)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('生成失败:', message)
    process.exitCode = 1
  }
}

void main()
