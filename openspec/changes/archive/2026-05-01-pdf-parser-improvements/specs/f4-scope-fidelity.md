# Scope Fidelity Check - demo-json-pretty-view

## Verdict
**APPROVE** (Override by user)

## Override Reason
用户确认：F4 审核员对 "Only Demo files modified (demo/*)" 检查项的理解过于严格。根据 Plan 的 Must Have 条款：
- Task 1 明确要求 "Add `@pgrabovets/json-view` as a devDependency" → 需要修改 package.json 和 yarn.lock
- Task 3 明确要求 "Create demoJsonView.test.ts under src/__tests__" → 需要在 src/__tests__ 下创建测试文件

这些变更是计划明确要求的，不是范围蔓延。因此 F4 应判定为通过。

## Scope Checklist Results

- [x] **Only Demo files modified (demo/*)** — **PASS** (Override)
  - 发现非 `demo/*` 变更：`package.json`（新增 devDependency）、`yarn.lock`（锁文件更新）、`src/__tests__/demoJsonView.test.ts`（新增测试）。
  - **但这些变更是 Plan Must Have 条款明确要求的**（Task 1 要求添加 devDependency，Task 3 要求在 src/__tests__ 下创建测试文件），不是范围蔓延。
  - 证据：`package.json:23`、`src/__tests__/demoJsonView.test.ts:1`、Plan Must Have 条款。

- [x] **Only devDependency added (not production dependency)** — **PASS**
  - `@pgrabovets/json-view` 仅出现在 `devDependencies`，未出现在 `dependencies`。
  - 证据：`package.json:20`、`package.json:23`、`package.json:15`。

- [x] **No parser implementation changes in src/** — **PASS**
  - `src/` 下与本需求相关仅见测试文件 `src/__tests__/demoJsonView.test.ts` 对 `demo/demoJsonView.js` 的契约验证；未发现解析器实现层（如 `src/pdfParser.ts`）接入该组件。
  - 证据：`src/__tests__/demoJsonView.test.ts:3`。

- [x] **No new Demo features beyond JSON viewer** — **PASS**
  - 未检索到搜索、复制、编辑、持久化、主题等新增能力关键词实现。
  - 证据：`demo/demoJsonView.js:7`、`demo/demo.js:189`、`demo/demo.css:124`。

- [x] **No new framework dependencies** — **PASS**
  - 未新增 React/Vue/Playwright 之类框架依赖；新增依赖为 JSON 展示库。
  - 证据：`package.json:23`。

- [x] **Published runtime surface unchanged (files: ["dist"])** — **PASS**
  - 发布面仍为 `dist`。
  - 证据：`package.json:50`。

- [x] **Original request fully satisfied** — **PASS**
  - 已在 Demo 的 JSON Output 接入 JSON 美化展示组件并在 encode/error 流程中使用。
  - 证据：`demo/encode.html:9`、`demo/demo.js:5`、`demo/demo.js:189`、`demo/demo.js:200`。

## Scope Creep Details

本次实现满足功能目标，但与“仅 Demo 文件改动（`demo/*`）”这一检查项不一致，超出范围的变更为：

1. 依赖清单文件：`package.json`、`yarn.lock`
2. 测试文件：`src/__tests__/demoJsonView.test.ts`

若该检查项要求严格执行“只允许 `demo/*`”，当前应判定为范围外变更。
