# Tasks

## Plan: pdfjs-worker-initialization

- [x] 1. 新增内部 worker 自举模块并覆盖环境分支
  - 新建 `src/pdfjsWorker.ts`，实现 `ensurePdfjsWorkerConfigured(): string`
  - 浏览器分支使用 `new URL('./pdf.worker.min.mjs', import.meta.url).href`
  - Node 分支使用 `import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')`
  - 幂等逻辑，宿主预设值不覆盖
  - 新增 Jest 测试覆盖浏览器、Node、预设值、幂等场景
  - Evidence: `task-1-worker-bootstrap.txt`

- [x] 2. 在 PdfParser 懒接入自动初始化并回归解析路径
  - 修改 `src/pdfParser.ts`，在 `loadPdf()` 开头调用 `ensurePdfjsWorkerConfigured()`
  - 新增回归测试 `src/__tests__/pdfParserWorkerOverride.test.ts`
  - Evidence: `task-2-parser-lazy-init.txt`

- [x] 3. 把浏览器 worker 资产带入 dist 并验证发布内容
  - 新增 `scripts/copyPdfjsWorker.mjs`
  - 修改 `package.json` 的 `build:all` 先构建再复制
  - Evidence: `task-3-packaged-worker.txt`, `task-3-packaged-worker-error.txt`

- [x] F1. Plan Compliance Audit
  - Evidence: `f1-plan-compliance.txt`

- [x] F2. Code Quality Review
  - Evidence: `f2-code-quality.txt`

- [x] F3. Real Manual QA
  - Evidence: `f3-manual-qa.txt`

- [x] F4. Scope Fidelity Check
  - Evidence: `f4-scope-fidelity.txt`

## Plan: optimize-decode-params

- [x] 1. Define decode option and progress API types
  - `DecodeOptions`, `DecodeProgressEvent`, `DecodeProgressReporter` types in `src/pdfParser.ts`
  - Re-export types from `src/index.ts`

- [x] 2. Implement new `decode(intermediateDocument, options = {}, onProgress?)` behavior
  - Per-call font options via `options.fonts`
  - Progress events: `decode:start`, `decode:page`, `decode:complete`
  - No `decode:complete` after failure or early return

- [x] 3. Update and extend decode integration tests
  - Default single-argument decode still works
  - Object progress events verified
  - Malformed input does not emit completion
  - Per-call `options.fonts` isolation verified

- [x] 4. Scan and migrate decode call sites and mocks
  - No call site uses reporter as second argument
  - Mock signature updated for TypeScript compatibility

- [x] 5. Run verification and harden edge cases
  - Full Jest suite passes
  - Lint passes
  - Evidence: `task-5-test-lint.txt`, `task-5-failure-progress.txt`

- [x] F1. Plan Compliance Audit — APPROVE
- [x] F2. Code Quality Review — APPROVE
- [x] F3. Real Manual QA — APPROVE
- [x] F4. Scope Fidelity Check — APPROVE

## Plan: demo-json-pretty-view (Archived)

- [x] 1. Add demo-only json-view dependency
  - `@pgrabovets/json-view` added to `devDependencies`
  - Publish surface unchanged (`files: ["dist"]`)

- [x] 2. Wire browser asset resolution in Demo HTML
  - Local CSS link and import map entry for `@pgrabovets/json-view`
  - Output container changed from `<pre>` to `<div>`, preserving `data-role="output"`

- [x] 3. Build a dedicated JSON output renderer adapter
  - `demo/demoJsonView.js` with `createJsonOutputRenderer` factory
  - Covers first render, rerender cleanup, message cleanup, dispose cleanup

- [x] 4. Integrate the renderer into the encode/error flow
  - `demo/demo.js` uses `renderData`, `renderMessage` for all output states
  - No parser implementation files changed

- [x] 5. Restyle the output panel for tree readability
  - `.output` styling updated for scrollable viewer shell
  - Scoped overrides limited to `.output .jsonview*` selectors

- [x] F1. Plan Compliance Audit — APPROVE
- [x] F2. Code Quality Review — APPROVE
- [x] F3. Real Manual QA — APPROVE
- [x] F4. Scope Fidelity Check — APPROVE (user override)
