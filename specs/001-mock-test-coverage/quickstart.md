# Quickstart

本指南用于说明计划中的 mock 规则与用例生成流程（以 Jest 为执行环境）。

## 1. 定义规则集

在仓库内新增规则文件（示例路径）：

```text
specs/001-mock-test-coverage/rules/example.rules.json
```

规则示例（简化）：

```json
{
  "id": "ruleset-001",
  "name": "pdf-parser-core",
  "version": "1.0.0",
  "targetModule": "@PdfParser",
  "seed": 12345,
  "rules": [
    {
      "id": "rule-text-content",
      "path": "textItem.str",
      "type": "string",
      "constraints": { "length": { "min": 0, "max": 200 } },
      "cases": [
        { "caseType": "normal", "overrides": {}, "expected": {} },
        { "caseType": "boundary", "overrides": { "str": "" }, "expected": {} },
        { "caseType": "error", "overrides": { "str": null }, "expected": { "error": "invalid" } }
      ]
    }
  ],
  "exclusions": []
}
```

## 2. 生成 mock 数据与测试用例（计划命令）

```bash
yarn test:generate --rules specs/001-mock-test-coverage/rules/example.rules.json --seed 12345
```

预期输出：

```text
test/generated/
├── cases/        # 生成的测试用例
├── data/         # 生成的 mock 数据
└── report.json   # 生成统计与错误报告
```

## 3. 运行覆盖率基线

```bash
yarn test:coverage
```

## 4. 生成后覆盖率对比（计划命令）

```bash
yarn test:coverage:compare --baseline coverage/coverage-summary.json --after coverage/coverage-summary.json
```

## 5. 查看结果

- 用例数量与覆盖路径：`test/generated/report.json`
- 覆盖率对比结果：`test/generated/coverage-diff.json`
