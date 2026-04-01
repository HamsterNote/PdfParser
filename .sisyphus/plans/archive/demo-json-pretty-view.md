# Demo JSON Pretty View

## TL;DR
> **Summary**: Replace the Demo’s raw JSON `<pre>` output with a collapsible tree viewer backed by `@pgrabovets/json-view`, while keeping the change strictly inside the Demo surface and preserving existing encode/error flows.
> **Deliverables**:
> - Demo-only JSON viewer dependency wired through local browser assets
> - Dedicated Demo renderer module with deterministic rerender/cleanup behavior
> - Updated Demo markup, encode flow, and scoped styling for readable tree output
> - Automated adapter coverage plus manual browser evidence for the Demo path
> **Effort**: Short
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 5

## Context
### Original Request
优化一下 Demo 的体验，JSON Output 内容增加一个 JSON 美化展示的组件（只在 Demo 中使用，所以是个 dev 依赖）

### Interview Summary
- 展示形态已定：使用可折叠树视图，替换当前 `demo/encode.html:58` 的纯文本 JSON 输出，而不是做双视图。
- 依赖边界已定：仅允许 demo-only `devDependency`，不得引入生产运行时依赖，也不得改动发布包内容（`package.json:49`）。
- 集成边界已定：沿用 `demo/demoPreview.js:1` 的模块化模式与 `data-role` 选择器模式，避免把 JSON 展示逻辑继续塞进 `demo/demo.js`。
- 验证策略已定：`tests-after + 手工 QA`，并以 `yarn lint`、`yarn test`、`yarn build:all` 作为强制关卡，对 Demo 再补浏览器级证据。

### Metis Review (gaps addressed)
- 锁定容器契约：保留 `data-role="output"`，允许把标签从 `<pre>` 改为更适合树视图的 `<div>`。
- 锁定生命周期：每次成功编码前先销毁上一棵树并清空容器；失败时同样清理树并显示纯文本错误，禁止叠加旧 DOM。
- 锁定初始展开策略：不在代码中调用 `expand()` / `collapse()`，使用库默认折叠行为，避免大 JSON 默认全展开。
- 锁定测试接缝：通过独立 Demo 渲染适配器模块做自动化覆盖，使用可注入的 `jsonview` API mock，避免引入新的浏览器测试框架。
- 锁定样式范围：只调整 Demo 输出面板与其内部 viewer 的必要样式，不扩展为整页 UI 重设计。

## Work Objectives
### Core Objective
让 `demo/encode.html` 的 JSON Output 从静态 `JSON.stringify` 文本升级为可折叠树形查看器，同时保持 Demo 其他能力与核心解析逻辑完全不变。

### Deliverables
- `package.json` 与锁文件新增 `@pgrabovets/json-view` devDependency。
- `demo/encode.html` 完成本地 CSS 与 import map 接线，并保留 `data-role="output"`。
- `demo/demoJsonView.js` 提供唯一的 Demo JSON 展示适配层。
- `demo/demo.js` 接入适配层，替换成功/加载中/失败时的输出渲染方式。
- `demo/demo.css` 调整输出面板样式，使树视图在现有卡片布局中可读、可滚动。
- `src/__tests__/demoJsonView.test.ts` 提供渲染、重渲染、错误消息清理的自动化覆盖。

### Definition of Done (verifiable conditions with commands)
- `yarn lint` 通过。
- `yarn test` 通过，且新增 Demo renderer 测试文件执行通过。
- `yarn build:all` 通过。
- `yarn dev` 后访问 `http://127.0.0.1:5577/demo/encode.html`，可完成样例 PDF 编码并看到可折叠 JSON 树。
- 同一路径下重复编码不同 PDF 或重复点击编码，不会叠加多棵树，也不会残留旧结果。
- 失败路径仍在 JSON Output 区显示纯文本错误信息，不出现破碎树节点或空白输出。

### Must Have
- Demo-only 变更：只允许修改 `demo/*`、`package.json`、锁文件、以及新增测试文件。
- 维持 `serializeIntermediate` 合同不变（`demo/demoDocumentSerialization.js:42`）。
- 保持现有状态/错误/预览逻辑语义不变（`demo/demo.js:173`、`demo/demo.js:196`）。
- 使用 `@pgrabovets/json-view` 本地包资源，不使用 CDN。
- 浏览器模块接线采用 import map + 本地 CSS `<link>`，避免为 Demo 引入 bundler 改造。
- 所有浏览器级 QA 在启动 `yarn dev` 之前，必须先执行 `yarn build:all`，因为 `demo/demo.js:1` 依赖运行时存在的 `../dist/browser.js`。

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- 不改 `src/` 下解析器实现、导出 API、序列化结构或 CI 工作流逻辑。
- 不为 Demo 增加搜索、复制、编辑、持久化、主题切换等额外功能。
- 不引入 React/Vue/Playwright/jsdom 等与当前需求无关的新框架级依赖。
- 不依赖人工判断“看起来差不多”；所有完成条件都必须可执行或可截图取证。

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after + Jest (`jest.config.js:1`) with a mockable adapter seam.
- QA policy: Every task includes an agent-executable validation step; browser verification uses Playwright against the Demo page.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Task count is intentionally small because this is a bounded Demo-only enhancement; keep conflicts low and favor merge-safe sequencing over artificial parallelism.

Wave 1: dependency wiring, browser asset wiring, renderer adapter + tests
Wave 2: encode-flow integration, output styling + browser QA

### Dependency Matrix (full, all tasks)
- Task 1 blocks Task 2 and Task 3 by introducing the package manifest and lockfile entry.
- Task 2 blocks Task 4 by defining the renderer API and cleanup contract.
- Task 3 can start after Task 1 and must finish before Task 4 browser validation.
- Task 4 blocks Task 5 because CSS/manual QA must validate the final integrated UI state.
- Task 5 must complete before Final Verification Wave F1-F4.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `quick`, `quick`, `unspecified-low`
- Wave 2 → 2 tasks → `quick`, `visual-engineering`
- Final Verification → 4 review tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Add demo-only json-view dependency

  **What to do**: Add `@pgrabovets/json-view` to `package.json` `devDependencies`, update the repository lockfile, and keep the package outside `dependencies` so the published runtime package remains unchanged.
  **Must NOT do**: Do not move the library into `dependencies`; do not change `files` publish entries; do not add any unrelated dev tooling.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: single-manifest dependency change with narrow blast radius.
  - Skills: `[]` — No special skill needed beyond surgical manifest editing.
  - Omitted: [`/git-master`] — No git action is required at task execution time.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `package.json:15` — Production runtime dependencies that must remain untouched.
  - Pattern: `package.json:20` — Existing dev-only dependency section where the new library belongs.
  - Pattern: `package.json:49` — Publish surface is limited to `dist`; this is the guardrail that justifies demo-only dependency placement.
  - External: `https://github.com/pgrabovets/json-view` — Official library usage and packaging reference.
  - External: `https://unpkg.com/@pgrabovets/json-view@2.8.1/package.json` — Confirms `dist/jsonview.js` and `dist/jsonview.css` package entries.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `node -e "const p=require('./package.json'); if(!p.devDependencies['@pgrabovets/json-view']) process.exit(1); if(p.dependencies['@pgrabovets/json-view']) process.exit(2)"`
  - [ ] `git diff --name-only -- package.json yarn.lock`

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Dependency is demo-only
    Tool: Bash
    Steps: Run `node -e "const p=require('./package.json'); console.log(p.devDependencies['@pgrabovets/json-view']); console.log(Boolean(p.dependencies['@pgrabovets/json-view']))"`
    Expected: First line prints a version string; second line prints `false`
    Evidence: .sisyphus/evidence/task-1-demo-dependency.txt

  Scenario: Publish surface unchanged
    Tool: Bash
    Steps: Run `node -e "const p=require('./package.json'); console.log(JSON.stringify(p.files))"`
    Expected: Output remains `["dist"]`
    Evidence: .sisyphus/evidence/task-1-publish-surface.txt
  ```

  **Commit**: YES | Message: `chore(demo): add json-view dev dependency` | Files: `package.json`, `yarn.lock`

- [x] 2. Wire browser asset resolution in Demo HTML

  **What to do**: Update `demo/encode.html` to load `../node_modules/@pgrabovets/json-view/dist/jsonview.css` via `<link>`, extend the existing import map with `"@pgrabovets/json-view": "../node_modules/@pgrabovets/json-view/dist/jsonview.js"`, and replace the output container tag from `<pre>` to `<div>` while preserving `class="output"` and `data-role="output"`.
  **Must NOT do**: Do not introduce CDN URLs; do not rename `data-role="output"`; do not alter any non-output sections of the Demo page.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: one HTML file with deterministic asset and container wiring.
  - Skills: `[]` — Plain markup edit; no special skill required.
  - Omitted: [`/frontend-ui-ux`] — This task is structural wiring, not a design pass.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `demo/encode.html:8` — Existing Demo stylesheet insertion point.
  - Pattern: `demo/encode.html:9` — Existing import map for `pdfjs-dist`; extend this map instead of creating a second one.
  - Pattern: `demo/encode.html:56` — Current JSON Output card and placement.
  - Pattern: `demo/encode.html:58` — Current `<pre class="output" data-role="output">` contract that must retain the `class` and `data-role` hooks.
  - External: `https://unpkg.com/@pgrabovets/json-view@2.8.1/package.json` — Confirms exact packaged asset filenames used in local browser wiring.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `rg -n "@pgrabovets/json-view|jsonview.css|data-role=\"output\"" demo/encode.html`
  - [ ] `yarn dev` serves `demo/encode.html` without 404 for the new CSS or JS asset paths.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Demo HTML resolves local viewer assets
    Tool: Playwright
    Steps: Run `yarn build:all`; start `yarn dev`; open `http://127.0.0.1:5577/demo/encode.html`; watch network requests for `jsonview.css`, `jsonview.js`, and `../dist/browser.js`
    Expected: Both assets return HTTP 200 and the page loads without import errors in the console
    Evidence: .sisyphus/evidence/task-2-asset-resolution.png

  Scenario: Output hook remains stable
    Tool: Playwright
    Steps: Run `yarn build:all`; start `yarn dev`; open `http://127.0.0.1:5577/demo/encode.html`; query `[data-role="output"]` and capture its tag name
    Expected: Exactly one element matches; tag name is `DIV`
    Evidence: .sisyphus/evidence/task-2-output-hook.txt
  ```

  **Commit**: YES | Message: `chore(demo): wire local json-view assets in demo html` | Files: `demo/encode.html`

- [x] 3. Build a dedicated JSON output renderer adapter

  **What to do**: Create `demo/demoJsonView.js` with a factory `createJsonOutputRenderer(outputElement, jsonviewApi = jsonview)` that returns `renderData(data)`, `renderMessage(message)`, and `dispose()`; internally track the current tree, call `jsonview.destroy(previousTree)` before any rerender, clear the container before inserting a new viewer root, and never call `expand()` or `collapse()` so the library default tree state is preserved.
  **Must NOT do**: Do not mutate serialization output; do not append multiple viewer roots; do not hard-code success/error strings inside the adapter.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: small new module plus deterministic test seam design.
  - Skills: `[]` — Existing module pattern is enough guidance.
  - Omitted: [`/refactor`] — No architecture-wide rewrite is needed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `demo/demoPreview.js:1` — Follow this file’s small-module style and exported helper-function pattern.
  - Pattern: `demo/demo.js:175` — Current loading-state text rendering that the adapter must replace without changing user-facing copy.
  - Pattern: `demo/demo.js:187` — Current success-state JSON rendering that must move behind the adapter.
  - Pattern: `demo/demo.js:198` — Current failure-state text rendering that must become `renderMessage(message)`.
  - Pattern: `jest.config.js:1` — Existing Jest setup; keep tests compatible with `node` environment.
  - Test: `src/__tests__/pdfParserDemoContract.test.ts:112` — Existing repo style for stable contract assertions.
  - External: `https://github.com/pgrabovets/json-view` — Official API methods `create`, `render`, `destroy`, `expand`, `collapse`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.js src/__tests__/demoJsonView.test.ts`
  - [ ] The new test covers first render, rerender cleanup, and message fallback cleanup with a mock `jsonviewApi`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: First render mounts exactly one tree
    Tool: Bash
    Steps: Run `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.js src/__tests__/demoJsonView.test.ts -t "mounts exactly one tree"`
    Expected: Jest exits 0 and records one viewer root inserted into the fake container
    Evidence: .sisyphus/evidence/task-3-first-render.txt

  Scenario: Rerender destroys old tree before mounting new one
    Tool: Bash
    Steps: Run `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.js src/__tests__/demoJsonView.test.ts -t "destroys previous tree on rerender"`
    Expected: Jest exits 0 and the mock `destroy` call count equals one before the second render completes
    Evidence: .sisyphus/evidence/task-3-rerender.txt
  ```

  **Commit**: YES | Message: `test(demo): cover json output renderer lifecycle` | Files: `demo/demoJsonView.js`, `src/__tests__/demoJsonView.test.ts`

- [x] 4. Integrate the renderer into the encode/error flow

  **What to do**: Update `demo/demo.js` to import `createJsonOutputRenderer`, instantiate it once from the existing `[data-role="output"]` element, replace `outputElement.textContent = 'Working...'` with `renderMessage('Working...')`, replace `JSON.stringify` success rendering with `renderData(serialized)`, and replace failure-path `textContent = message` with `renderMessage(message)` while leaving status, preview, and decode logic untouched.
  **Must NOT do**: Do not modify `serializeIntermediate`; do not change status/error copy strings; do not alter preview, decode, or file-selection behavior except what is strictly required to call the renderer.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: small integration inside a single existing orchestration file.
  - Skills: `[]` — Existing local patterns are sufficient.
  - Omitted: [`/frontend-ui-ux`] — The logic integration should stay separate from styling decisions.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 5 | Blocked By: 2, 3

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `demo/demo.js:13` — Existing DOM element lookups; keep `[data-role="output"]` as the source element.
  - Pattern: `demo/demo.js:168` — `handleEncode` is the only encode flow to update.
  - Pattern: `demo/demo.js:173` — Loading-state transition that must still show `Working...`.
  - Pattern: `demo/demo.js:186` — Serialized data creation point that should feed the renderer directly.
  - Pattern: `demo/demo.js:196` — Failure branch where plain-text message rendering must remain supported.
  - Pattern: `demo/demoDocumentSerialization.js:42` — Serialization contract is fixed and must remain untouched.
  - Pattern: `demo/demoPreview.js:18` — Example of keeping helper calls small and stateful via a dedicated module.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `rg -n "createJsonOutputRenderer|renderData\(|renderMessage\(" demo/demo.js`
  - [ ] `NODE_OPTIONS=--experimental-vm-modules npx jest --config jest.config.js src/__tests__/demoJsonView.test.ts`

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Successful encode shows a tree instead of raw JSON text
    Tool: Playwright
    Steps: Run `yarn build:all`; start `yarn dev`; open `http://127.0.0.1:5577/demo/encode.html`; click `#demo-load-sample`; click `#encode-button`; wait for `[data-role="status"]` to become `Encode ready`; inspect `[data-role="output"]`
    Expected: `[data-role="output"]` contains viewer DOM nodes from `json-view` and does not render the top-level payload as a plain text blob
    Evidence: .sisyphus/evidence/task-4-success-tree.png

  Scenario: Encode failure still shows a plain-text message
    Tool: Playwright
    Steps: Run `yarn build:all`; start `yarn dev`; open `http://127.0.0.1:5577/demo/encode.html`; use Playwright `setInputFiles` with an in-memory file payload named `broken.pdf` whose bytes are invalid PDF content; click `#encode-button`; wait for failure state; inspect `[data-role="error"]` and `[data-role="output"]`
    Expected: Error/status messaging remains readable plain text; no orphaned tree DOM remains in `[data-role="output"]`
    Evidence: .sisyphus/evidence/task-4-error-path.png
  ```

  **Commit**: YES | Message: `feat(demo): use renderer for json output states` | Files: `demo/demo.js`

- [x] 5. Restyle the output panel for tree readability and verify final UX

  **What to do**: Update `demo/demo.css` so `.output` becomes a neutral scrollable viewer shell instead of a preformatted code block: keep `min-height`, `overflow`, padding, and monospace sizing; remove `white-space: pre-wrap`; switch the panel to a light background/border aligned with the rest of the Demo cards; add only scoped `.output .jsonview*` overrides that are strictly needed for spacing or contrast after integrating the library stylesheet.
  **Must NOT do**: Do not redesign unrelated cards; do not add global selectors targeting the viewer outside `.output`; do not chase pixel-perfect restyling beyond readability and layout stability.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: small but user-visible CSS tuning in an existing Demo UI.
  - Skills: `[]` — The task is scoped enough without extra skill loading.
  - Omitted: [`/frontend-ui-ux`] — Avoid scope expansion into a broader redesign.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Final Verification Wave | Blocked By: 4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `demo/demo.css:109` — Current `.output` styles designed for `<pre>` text output.
  - Pattern: `demo/demo.css:145` — Existing panel styling approach for content containers inside cards.
  - Pattern: `demo/encode.html:56` — Output panel placement relative to the rest of the Demo layout.
  - External: `https://github.com/pgrabovets/json-view` — Viewer library ships its own stylesheet; only layer scoped overrides on top of it.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `yarn lint && yarn test && yarn build:all`
  - [ ] `test -f .sisyphus/evidence/task-5-readability.png && test -f .sisyphus/evidence/task-5-rerender.txt`

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Tree remains readable and scrollable in the final panel
    Tool: Playwright
    Steps: Run `yarn build:all`; start `yarn dev`; open `http://127.0.0.1:5577/demo/encode.html`; load the sample PDF; click `#encode-button`; capture `[data-role="output"]` after render; scroll the output panel to the bottom
    Expected: Text and toggles are readable on the panel background; the panel scrolls without clipping content or collapsing layout
    Evidence: .sisyphus/evidence/task-5-readability.png

  Scenario: Repeated encode does not stack multiple trees
    Tool: Playwright
    Steps: Run `yarn build:all`; start `yarn dev`; open `http://127.0.0.1:5577/demo/encode.html`; load the sample PDF; click `#encode-button` twice; count the number of top-level viewer roots inside `[data-role="output"]`
    Expected: Exactly one viewer root exists after the second encode completes
    Evidence: .sisyphus/evidence/task-5-rerender.txt
  ```

  **Commit**: YES | Message: `feat(demo): polish json output viewer styles` | Files: `demo/demo.css`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle

  **Tool**: `task(subagent_type="oracle")`
  **Steps**: Provide `.sisyphus/plans/demo-json-pretty-view.md` plus the final changed-file list; ask Oracle to verify every completed change maps to Tasks 1-5 and no out-of-scope files or behaviors were introduced.
  **Expected**: Oracle returns approval with no scope drift or missing required task outputs.
  **Evidence**: `.sisyphus/evidence/f1-plan-compliance.md`
  **Result**: ✅ **APPROVE** - 所有 Tasks 1-5 交付物已确认存在，无范围外文件修改

- [x] F2. Code Quality Review — unspecified-high

  **Tool**: `task(category="unspecified-high")`
  **Steps**: Review the final diff for cleanup correctness, adapter lifecycle correctness, import-map wiring correctness, and CSS scoping limited to `.output`.
  **Expected**: Reviewer confirms no stale-tree leaks, no global CSS spillover, and no unnecessary complexity.
  **Evidence**: `.sisyphus/evidence/f2-code-quality.md`
  **Result**: ✅ **APPROVE** - 生命周期正确、适配器使用正确、集成正确、样式作用域正确

- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)

  **Tool**: `Playwright`
  **Steps**: Run `yarn build:all`; start `yarn dev`; execute the Task 4 success path, Task 4 malformed-PDF failure path, and Task 5 double-encode rerender path on `http://127.0.0.1:5577/demo/encode.html`.
  **Expected**: All three browser scenarios pass in one clean run with evidence files captured.
  **Evidence**: `.sisyphus/evidence/f3-manual-qa.md`
  **Result**: ✅ **APPROVE** - 成功路径、失败路径、重复渲染场景全部通过，已截图取证

- [x] F4. Scope Fidelity Check — deep

  **Tool**: `task(category="deep")`
  **Steps**: Compare the final diff and resulting behavior against the original request; explicitly confirm the work only improves Demo JSON Output experience via a dev-only dependency and did not introduce unrelated Demo features or parser changes.
  **Expected**: Deep reviewer confirms the result matches the original request exactly and rejects any scope creep.
  **Evidence**: `.sisyphus/evidence/f4-scope-fidelity.md`
  **Result**: ✅ **APPROVE** (用户覆盖) - 初始 REJECT 基于对范围检查项的误解；package.json/yarn.lock/src/__tests__ 变更是 Plan Must Have 条款明确要求的

## Commit Strategy
- `chore(demo): add json-view dev dependency and demo asset wiring`
- `test(demo): cover json output renderer lifecycle`
- `feat(demo): replace raw JSON output with collapsible tree viewer`

## Success Criteria
- Demo JSON Output is a collapsible tree instead of raw pretty-printed text.
- Change remains isolated to Demo and dev tooling; published runtime surface is unchanged.
- Existing lint, test, build, and CI expectations remain green.
- Repeated encode success/failure transitions behave deterministically with no stale tree DOM.
