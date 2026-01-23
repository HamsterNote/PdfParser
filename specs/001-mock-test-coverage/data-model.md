# Data Model

本文件描述 mock 数据与用例生成体系的核心实体、字段、关系与校验规则。

## MockRuleSet

- **字段**
  - `id: string`（唯一标识）
  - `name: string`（规则集名称）
  - `version: string`（规则版本）
  - `targetModule: string`（目标模块/入口标识）
  - `seed: number`（默认随机种子）
  - `rules: MockRule[]`
  - `exclusions: string[]`（排除的场景/路径标识）
  - `createdAt: string`（ISO 8601）
  - `updatedAt: string`（ISO 8601）

- **校验**
  - `rules` 不为空
  - `seed` 为整数
  - `targetModule` 指向可解析的模块入口

## MockRule

- **字段**
  - `id: string`
  - `path: string`（作用字段或对象路径）
  - `type: string`（string/number/enum/object/array/boolean）
  - `constraints: RuleConstraints`
  - `cases: MockRuleCase[]`

- **校验**
  - `path` 在目标输入结构中可解析
  - `constraints` 与 `type` 一致（例如 number 不允许 string pattern）

## RuleConstraints

- **字段**（根据 `type` 可选）
  - `min?: number`
  - `max?: number`
  - `enum?: string[]`
  - `pattern?: string`
  - `nullable?: boolean`
  - `length?: { min?: number; max?: number }`

- **校验**
  - `min <= max`
  - `enum` 非空
  - `pattern` 为合法正则

## MockRuleCase

- **字段**
  - `caseType: 'normal' | 'boundary' | 'error'`
  - `overrides: Record<string, unknown>`
  - `expected: Record<string, unknown>`（用于断言的期望结果片段）

- **校验**
  - `caseType` 必须覆盖至少一种类型
  - `error` 类型必须描述错误码或错误信息片段

## MockDataSample

- **字段**
  - `id: string`
  - `ruleSetId: string`
  - `caseType: 'normal' | 'boundary' | 'error'`
  - `payload: Record<string, unknown>`
  - `seedUsed: number`
  - `generatedAt: string`

- **关系**
  - `MockRuleSet (1) -> MockDataSample (N)`

## TestCase

- **字段**
  - `id: string`
  - `ruleSetId: string`
  - `targetModule: string`
  - `caseType: 'normal' | 'boundary' | 'error'`
  - `input: Record<string, unknown>`
  - `expected: Record<string, unknown>`
  - `filePath: string`

- **关系**
  - `MockRuleSet (1) -> TestCase (N)`

## CoverageBaseline

- **字段**
  - `id: string`
  - `targetModule: string`
  - `summary: CoverageSummary`
  - `capturedAt: string`

## CoverageSummary

- **字段**
  - `lines: number`
  - `statements: number`
  - `functions: number`
  - `branches: number`

## CoverageComparison

- **字段**
  - `id: string`
  - `baselineId: string`
  - `afterId: string`
  - `delta: CoverageSummary`
  - `generatedAt: string`

## GenerationRun

- **字段**
  - `id: string`
  - `ruleSetId: string`
  - `status: 'running' | 'succeeded' | 'failed'`
  - `caseCount: number`
  - `failureCount: number`
  - `errorMessage?: string`
  - `startedAt: string`
  - `finishedAt?: string`

- **校验**
  - `status=failed` 时必须有 `errorMessage`
