# Tasks

## Plan: demo-json-pretty-view (Archived)

### Task 1: Add demo-only json-view dependency
- [x] Add `@pgrabovets/json-view` to `package.json` `devDependencies`
- [x] Update repository lockfile
- [x] Keep package outside `dependencies` so published runtime package remains unchanged

### Task 2: Wire browser asset resolution in Demo HTML
- [x] Update `demo/encode.html` to load `jsonview.css` via `<link>`
- [x] Extend import map with `@pgrabovets/json-view` entry
- [x] Replace output container from `<pre>` to `<div>` while preserving `class="output"` and `data-role="output"`

### Task 3: Build a dedicated JSON output renderer adapter
- [x] Create `demo/demoJsonView.js` with factory `createJsonOutputRenderer()`
- [x] Return `renderData()`, `renderMessage()`, and `dispose()`
- [x] Destroy prior tree before rerender, clear container before inserting new viewer root
- [x] Never call `expand()` or `collapse()`

### Task 4: Integrate the renderer into the encode/error flow
- [x] Update `demo/demo.js` to import and instantiate renderer
- [x] Replace `outputElement.textContent = 'Working...'` with `renderMessage()`
- [x] Replace `JSON.stringify` success rendering with `renderData()`
- [x] Replace failure-path `textContent` with `renderMessage()`

### Task 5: Restyle the output panel for tree readability
- [x] Update `demo/demo.css` so `.output` becomes scrollable viewer shell
- [x] Remove `white-space: pre-wrap`
- [x] Add scoped `.output .jsonview*` overrides for spacing/contrast

### Final Verification Wave
- [x] F1. Plan Compliance Audit — oracle (APPROVE)
- [x] F2. Code Quality Review — unspecified-high (APPROVE)
- [x] F3. Real Manual QA — unspecified-high (+ playwright) (APPROVE)
- [x] F4. Scope Fidelity Check — deep (APPROVE, user override)

## Plan: pdfjs-worker-initialization

### Task 1: 新增内部 worker 自举模块并覆盖环境分支
- [x] 新建 `src/pdfjsWorker.ts`，实现 `ensurePdfjsWorkerConfigured()`
- [x] Browser branch: `new URL('./pdf.worker.min.mjs', import.meta.url).href`
- [x] Node branch: `import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')`
- [x] 幂等逻辑：已有非空 `workerSrc` 则直接返回，不覆盖宿主预设值
- [x] 新增 Jest 用例覆盖浏览器、Node、预设值、幂等四类场景

### Task 2: 在 PdfParser 懒接入自动初始化并回归解析路径
- [x] 修改 `src/pdfParser.ts`，在 `loadPdf()` 开头调用 `ensurePdfjsWorkerConfigured()`
- [x] 不把逻辑放到 `encode()` 顶层、类定义顶层、`src/index.ts` 或 `src/browser.ts`
- [x] 新增回归测试 `src/__tests__/pdfParserWorkerOverride.test.ts`
- [x] 验证清空 `workerSrc` 后仍能自动初始化并完成 PDF 解析
- [x] 验证宿主预设 `workerSrc` 不被覆盖

### Task 3: 把浏览器 worker 资产带入 dist 并验证发布内容
- [x] 新增 `scripts/copyPdfjsWorker.mjs`，复制 worker 到 `dist/pdf.worker.min.mjs`
- [x] 修改 `package.json`，`build:all` 先执行 rolldown 再执行复制脚本
- [x] 保留 `prepublishOnly` 调用 `build:all`
- [x] 验证 `npm run build:all` 后生成 `dist/pdf.worker.min.mjs`
- [x] 验证 `npm pack --dry-run` 输出包含 `dist/pdf.worker.min.mjs`

### Final Verification Wave
- [x] F1. Plan Compliance Audit — oracle (REJECT→APPROVE after fixes)
- [x] F2. Code Quality Review — unspecified-high (APPROVE)
- [x] F3. Real Manual QA — unspecified-high (APPROVE)
- [x] F4. Scope Fidelity Check — deep (APPROVE)

## Plan: demo-encode-performance

### Task 1: Replace eager demo serialization with progressive snapshots
- [x] Refactor `demo/demoDocumentSerialization.js` to progressive serializer
- [x] Return immediate shell + async progression mechanism
- [x] Keep final assembled JSON shape identical to current `serializeIntermediate()` result
- [x] Reuse already resolved page summaries in memory
- [x] No code path performs all-page `Promise.all(...page.getTexts())`

### Task 2: Add incremental JSON rendering with yielding updates
- [x] Extend `demo/demoJsonView.js` with `updateData(data)` method
- [x] Use throttled patch-style rerenders with `requestAnimationFrame` / `setTimeout` fallback
- [x] Multiple `updateData` calls coalesce into single render with latest data
- [x] Preserve existing loading and error message behavior

### Task 3: Rework `handleEncode()` to stream results and cancel stale runs
- [x] Update `demo/demo.js` `handleEncode()` to render progress immediately
- [x] Start progressive serialization/rendering in background for active encode context
- [x] Keep page-order updates stable
- [x] Stop stale updates when `activeDecodeContextId` changes
- [x] Re-enable decode only for latest successful encode context

### Task 4: Reduce parser page-scan latency while keeping page data lazy
- [x] Refactor `src/pdfParser.ts` `buildPageInfoList()` with bounded concurrency (4 in-flight)
- [x] Fetch page viewports in parallel, sort back into page-number order
- [x] Keep `getData` closures lazy
- [x] Emit `encode:page` only when each page's metadata slot committed in ascending order

### Task 5: Add regression coverage and end-to-end verification for the new flow
- [x] Add/update Jest coverage for progressive serialization, incremental renderer lifecycle, `handleEncode()` stale-run protection, parser concurrency semantics
- [x] `npm test` passes
- [x] `npm run lint` passes
- [x] `npm run verify:vite` passes

### Final Verification Wave
- [x] F1. Plan Compliance Audit — oracle (APPROVE)
- [x] F2. Code Quality Review — unspecified-high (REJECT on pre-existing timeout-cleanup leaks outside plan scope; 3/4 reviewers approved)
- [x] F3. Real Manual QA — unspecified-high (+ playwright) (APPROVE)
- [x] F4. Scope Fidelity Check — deep (APPROVE)
