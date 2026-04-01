# PDFJS Worker 自动初始化与随包发布

## TL;DR
> **Summary**: 在不改变现有 ESM / external bundling 形态的前提下，为 `PdfParser` 增加懒执行的 `pdfjs-dist` worker 自动初始化；浏览器侧自动指向随 npm 包发布的 `pdf.worker.min.mjs`，Node/Jest 侧继续使用 `legacy` worker 路径以保持兼容。
> **Deliverables**:
> - 内部 `pdfjs-dist` worker 自动初始化辅助模块
> - `PdfParser` 首次加载 PDF 前的懒初始化接入
> - 构建后复制 `pdf.worker.min.mjs` 到 `dist/` 的发布链路
> - 覆盖浏览器/Node/Jest 分支的回归测试与打包验证
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3

## Context
### Original Request
用户指出当前只有 `demo/demo.js:7` 和 `src/__tests__/utils.ts:9` / `src/__tests__/utils.ts:28` 显式设置了 `GlobalWorkerOptions.workerSrc`，导致发布后的 npm 包没有内建声明，`pdfjs-dist` 初始化失败。要求在 npm 包内处理该初始化，必要时可按 Node.js 环境分支，且产物要同时支持浏览器与 Node.js，不改变现有 ESM / bundling 模式。

### Interview Summary
- 自动初始化是强约束：不新增要求宿主显式调用的公开 setup API。
- 浏览器端默认策略是把 `pdfjs-dist` 自带的 `pdf.worker.min.mjs` 一并发布到 npm 包，而不是依赖 CDN。
- 测试策略采用“测试后补”，但最终交付必须包含回归测试和打包验证。
- 默认采用惰性初始化：只在 `PdfParser` 实际调用 `pdfjs-dist` 前设置 worker，不在入口模块顶层产生副作用。

### Metis Review (gaps addressed)
- 保持 `pdfjs-dist` external 与纯 ESM 输出不变，不引入新的公开 API，不依赖 `document.currentScript` 自动推导。
- 浏览器端使用随包发布的静态 worker 资产；Node/Jest 端继续保留 `legacy` worker 路径，避免回归当前测试兼容性。
- 计划中显式加入 tarball 内容验证、消费者覆盖优先级验证、缺失资产失败路径验证与幂等初始化验证。
- 不扩展到 SSR 框架适配、demo 清理或额外构建模式调整。

## Work Objectives
### Core Objective
让 `@hamster-note/pdf-parser` 在浏览器与 Node.js 环境下都能在不要求宿主手动配置的前提下，为 `pdfjs-dist` 提供稳定、自动且可重复调用的 worker 初始化路径，并确保发布到 npm 的包内包含浏览器所需 worker 资产。

### Deliverables
- 新增内部 worker 初始化模块，封装环境识别、幂等逻辑、宿主已有配置保留逻辑。
- 在 `PdfParser` 的 `loadPdf` 调用链上接入自动初始化。
- 新增构建后复制脚本，将 `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` 发布到 `dist/pdf.worker.min.mjs`。
- 新增/更新 Jest 测试，覆盖浏览器分支、Node 分支、已预配置分支与实际解析回归。
- 新增打包校验步骤，确认 `npm pack --dry-run` 包含 worker 资产。

### Definition of Done (verifiable conditions with commands)
- `npm test` 通过，且新增测试覆盖自动初始化分支与兼容行为。
- `npm run lint` 通过。
- `npm run build:all` 后存在 `dist/pdf.worker.min.mjs`。
- `npm pack --dry-run` 输出中包含 `dist/pdf.worker.min.mjs`。
- 通过 Node ESM 脚本导入构建产物时，`PdfParser` 首次解析前能自动设置 `GlobalWorkerOptions.workerSrc`，且不覆盖宿主预先设置的值。

### Must Have
- 浏览器分支通过 `new URL('./pdf.worker.min.mjs', import.meta.url).href` 推导随包发布的 worker URL。
- Node/Jest 分支通过 `createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')` 解析 legacy worker 的真实路径，再转成 `file://` URL 写入 `GlobalWorkerOptions.workerSrc`。
- 初始化逻辑必须幂等，且如果宿主已预先设置 `GlobalWorkerOptions.workerSrc`，库内不覆盖该值。
- 自动初始化必须只挂在 `PdfParser.loadPdf()` 之前，不在 `src/index.ts:1` 或 `src/browser.ts:1` 的顶层执行。
- 构建脚本必须保持 `rolldown.config.ts:1-9` 的 ES 输出与 `external: ['pdfjs-dist', /^node:/]` 不变。

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- 不新增公开 `setupPdfjsWorker` / `configureWorker` API。
- 不把 `pdfjs-dist` 内联进 bundle，不改成 CJS，不新增额外 bundle 产物。
- 不依赖 CDN、`document.currentScript`、宿主手动 copy 资源或手工配置路径。
- 不重构与 worker 初始化无关的 demo、CLI、生成器、规则系统。
- 不把测试专用 `src/__tests__/utils.ts:9-40` 直接搬进生产逻辑；生产逻辑需独立实现。

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after + Jest (`jest.config.js:1-37`)
- QA policy: Every task has agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 internal runtime bootstrap；Task 2 parser lazy wiring（依赖 Task 1）；Task 3 build/publish asset copy（可与 Task 2 并行，依赖 Task 1 的目标路径约定）
Wave 2: Final verification wave only

### Dependency Matrix (full, all tasks)
- Task 1 → blocks Task 2, Task 3
- Task 2 → required before F1-F4
- Task 3 → required before F1-F4
- F1-F4 → after Task 1-3 all green

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `unspecified-high`, `quick`, `quick`
- Wave 2 → 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

## TODOs
- [x] 1. 新增内部 worker 自举模块并覆盖环境分支

  **What to do**: 新建 `src/pdfjsWorker.ts`，只供内部使用。模块中实现 `ensurePdfjsWorkerConfigured(): string` 与私有辅助函数，逻辑固定为：先读取 `GlobalWorkerOptions.workerSrc`，若已有非空字符串则直接返回该值；否则判断运行时环境。浏览器分支使用 `new URL('./pdf.worker.min.mjs', import.meta.url).href` 生成默认值；Node 分支使用 `createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')` 定位 legacy worker，再通过 `pathToFileURL` 转成 `file://` URL；将结果写入 `GlobalWorkerOptions.workerSrc` 并缓存，保证重复调用不重复解析。环境判断顺序固定为：`typeof document !== 'undefined'` 视为浏览器分支，否则视为 Node/非浏览器分支。测试同时覆盖：浏览器默认路径、Node legacy 路径、宿主预设值不被覆盖、重复调用幂等。
  **Must NOT do**: 不导出到 `src/index.ts:1-55` 或 `src/browser.ts:1`；不复用 `src/__tests__/utils.ts:9-40` 作为生产代码；不在模块顶层直接写 `GlobalWorkerOptions.workerSrc`；不依赖 `document.currentScript`、CDN 或硬编码绝对文件系统路径。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 需要同时处理浏览器/Node ESM、worker 解析与幂等逻辑
  - Skills: [] — 无需额外技能，重点在仓内一致性实现
  - Omitted: [`git-master`] — 非 git 任务

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 3] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/pdfParser.ts:75` — `loadPdf()` 是唯一必须在 `getDocument()` 前接入自动初始化的入口链路起点
  - Pattern: `src/pdfParser.ts:77` — 当前 `getDocument()` 调用未做 worker 配置
  - Pattern: `src/pdfParser.ts:446` — 现有浏览器环境判断模式使用 `typeof document === 'undefined'`
  - Pattern: `src/__tests__/utils.ts:9` — 测试中已有标准 worker 路径计算方式，可参考但不可直接复用
  - Pattern: `src/__tests__/utils.ts:28` — 测试中已有 legacy worker 路径计算方式，可参考 Node 兼容方向
  - API/Type: `jest.config.js:10` — Jest 当前把 `pdfjs-dist` 映射到 `legacy/build/pdf.mjs`
  - Test: `test/setupTests.ts:7` — 现有全局测试初始化依赖 legacy worker
  - Test: `src/__tests__/pdfParserIntegration.test.ts:19` — 现有集成测试使用 `beforeAll` 先解析 PDF，可据此补 worker 自举断言
  - External: `https://github.com/mozilla/pdf.js/blob/master/src/display/worker_options.js#L45-L50` — 官方要求始终设置 `GlobalWorkerOptions.workerSrc`
  - External: `https://github.com/mozilla/pdf.js/blob/master/src/display/api.js#L2348-L2350` — 未设置 `workerSrc` 时会抛错

  **Acceptance Criteria** (agent-executable only):
  - [ ] `src/pdfjsWorker.ts` 存在且只包含内部自动初始化逻辑，不新增公共导出
  - [ ] 当 `GlobalWorkerOptions.workerSrc` 已有值时，`ensurePdfjsWorkerConfigured()` 返回原值且不重写
  - [ ] 浏览器分支默认值以 `pdf.worker.min.mjs` 结尾
  - [ ] Node 分支默认值解析到 `pdfjs-dist/legacy/build/pdf.worker.min.mjs` 的 `file://` URL
  - [ ] 新增 Jest 用例可覆盖浏览器、Node、预设值、幂等四类场景

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Node 分支与幂等逻辑通过
    Tool: Bash
    Steps: 运行 `npm test -- --runInBand src/__tests__/pdfjsWorkerInitialization.test.ts | tee .sisyphus/evidence/task-1-worker-bootstrap.txt`
    Expected: 新增测试文件通过，且输出无 `No "GlobalWorkerOptions.workerSrc" specified.` 报错
    Evidence: .sisyphus/evidence/task-1-worker-bootstrap.txt

  Scenario: 预设值不被覆盖
    Tool: Bash
    Steps: 在同一测试命令结果中校验包含预设值场景断言通过；如使用测试名过滤，则运行 `npm test -- --runInBand src/__tests__/pdfjsWorkerInitialization.test.ts -t "preserves preconfigured workerSrc" | tee .sisyphus/evidence/task-1-worker-bootstrap-error.txt`
    Expected: 预设值场景通过，说明库内逻辑不会覆盖宿主已设置的 `workerSrc`
    Evidence: .sisyphus/evidence/task-1-worker-bootstrap-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`src/pdfjsWorker.ts`, `src/__tests__/pdfjsWorkerInitialization.test.ts`]

- [x] 2. 在 PdfParser 懒接入自动初始化并回归解析路径

  **What to do**: 修改 `src/pdfParser.ts`，仅在 `private static async loadPdf(data: ArrayBuffer)` 开头调用 `ensurePdfjsWorkerConfigured()`，确保每次首次解析 PDF 前完成自动初始化。不要把逻辑放到 `encode()` 顶层、类定义顶层、`src/index.ts` 或 `src/browser.ts`。新增专门回归测试文件 `src/__tests__/pdfParserWorkerOverride.test.ts`：在每个用例开始时先把 `GlobalWorkerOptions.workerSrc` 重置为 `''` 或自定义字符串，避免依赖 `test/setupTests.ts:7-8` 的全局 legacy 初始化值；其中一类断言验证 `PdfParser.encode()` 在未手动 setup 的前提下仍可通过解析，另一类断言验证当测试预先写入自定义 `GlobalWorkerOptions.workerSrc` 时，解析过程不会覆盖该值。保留 `test/setupTests.ts` 不变，以确保旧测试继续覆盖既有环境。
  **Must NOT do**: 不改变 `PdfParser.decode()`、`renderThumbnail()` 或任何与 worker 初始化无关的逻辑；不修改 `src/index.ts:1-55`、`src/browser.ts:1` 的导出面；不把自动初始化提前到模块 import 时机。

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 变更点集中在单一调用链，依赖已由 Task 1 固定
  - Skills: [] — 无需额外技能
  - Omitted: [`frontend-ui-ux`] — 非界面任务

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/pdfParser.ts:44` — `PdfParser.encode()` 走入 `loadPdf()` 的主入口
  - Pattern: `src/pdfParser.ts:75` — 这里是唯一应接入懒初始化的位置
  - Pattern: `src/pdfParser.ts:77` — `getDocument()` 调用前必须先确保 `workerSrc` 已就绪
  - Pattern: `src/__tests__/pdfParserIntegration.test.ts:19` — 当前集成测试在 `beforeAll` 中直接 `PdfParser.encode()`，适合作为回归基线
  - Pattern: `test/setupTests.ts:7-8` — 当前测试环境在全局 setup 中写 legacy worker，回归时需确保新自动逻辑不会与之冲突
  - Pattern: `src/index.ts:1` — 主入口当前仅导出 `PdfParser`
  - Pattern: `src/browser.ts:1` — 浏览器入口当前仅导出 `PdfParser`

  **Acceptance Criteria** (agent-executable only):
  - [ ] `loadPdf()` 在 `getDocument()` 之前调用 `ensurePdfjsWorkerConfigured()`
  - [ ] 自动初始化逻辑不会改变 `src/index.ts` / `src/browser.ts` 的现有导出面
  - [ ] 在测试内主动清空 `GlobalWorkerOptions.workerSrc` 的场景下，解析回归测试仍能通过
  - [ ] 当 `GlobalWorkerOptions.workerSrc` 先由测试写入自定义值时，解析过程后该值保持不变

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: 清空 workerSrc 后仍能自动初始化并完成 PDF 解析
    Tool: Bash
    Steps: 运行 `npm test -- --runInBand src/__tests__/pdfParserWorkerOverride.test.ts -t "auto initializes when workerSrc is empty" | tee .sisyphus/evidence/task-2-parser-lazy-init.txt`
    Expected: 专用回归测试通过，证明在测试内先清空 `GlobalWorkerOptions.workerSrc` 后，`PdfParser.encode()` 仍会自动补齐并成功解析
    Evidence: .sisyphus/evidence/task-2-parser-lazy-init.txt

  Scenario: 宿主预设 workerSrc 不被覆盖
    Tool: Bash
    Steps: 运行包含预设值断言的回归测试，例如 `npm test -- --runInBand src/__tests__/pdfParserWorkerOverride.test.ts | tee .sisyphus/evidence/task-2-parser-lazy-init-error.txt`
    Expected: 断言通过，证明解析路径尊重宿主已有配置
    Evidence: .sisyphus/evidence/task-2-parser-lazy-init-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`src/pdfParser.ts`, `src/__tests__/pdfParserIntegration.test.ts`, `src/__tests__/pdfParserWorkerOverride.test.ts`]

- [x] 3. 把浏览器 worker 资产带入 dist 并验证发布内容

  **What to do**: 新增 `scripts/copyPdfjsWorker.mjs`，只负责在构建完成后把 `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` 复制到 `dist/pdf.worker.min.mjs`。修改 `package.json:5-14`，将 `build:all` 固定为先执行 `rolldown --config rolldown.config.ts` 再执行 `node ./scripts/copyPdfjsWorker.mjs`；保留 `prepublishOnly` 仍然调用 `npm run build:all`。不修改 `rolldown.config.ts:1-9`。本任务不新增 Jest 测试文件，构建产物存在性与 tarball 内容完全通过 QA 步骤验证。
  **Must NOT do**: 不把 worker 复制到 `src/`；不引入 copy bundler 插件；不改 `files: ["dist"]`；不新增第二套 bundle；不把 `legacy` worker 也一并发布到 npm 包，除非实现过程中发现浏览器标准 worker 无法满足需求且需回到规划阶段。

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 变更集中在构建脚本和发布产物校验
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 非浏览器自动化任务

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `package.json:5-14` — 当前 `build:all` 只跑 rolldown，`prepublishOnly` 依赖它
  - Pattern: `package.json:50-52` — 发布内容只包含 `dist`
  - Pattern: `rolldown.config.ts:1-9` — 必须保持现有 ES 输出和 `pdfjs-dist` external 策略
  - Pattern: `demo/demo.js:7-8` — demo 当前用 CDN worker，可作为浏览器 worker 文件名对照
  - API/Type: `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` — 浏览器标准 worker 来源文件
  - External: `https://github.com/mozilla/pdf.js/blob/master/src/display/api.js#L2190-L2198` — 跨域 CDN worker 存在额外包装逻辑，本任务目标是避免继续依赖 CDN

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm run build:all` 后生成 `dist/pdf.worker.min.mjs`
  - [ ] `rolldown.config.ts` 未改变输出格式与 external 配置
  - [ ] `npm pack --dry-run` 输出包含 `dist/pdf.worker.min.mjs`
  - [ ] 构建脚本在本仓库当前 Node 版本下可重复执行而不报错

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: 构建后 worker 资产存在
    Tool: Bash
    Steps: 运行 `npm run build:all | tee .sisyphus/evidence/task-3-packaged-worker.txt`，随后运行 `ls dist/pdf.worker.min.mjs >> .sisyphus/evidence/task-3-packaged-worker.txt`
    Expected: 命令成功，且证据文件中包含 `dist/pdf.worker.min.mjs`
    Evidence: .sisyphus/evidence/task-3-packaged-worker.txt

  Scenario: npm tarball 包含 worker 资产
    Tool: Bash
    Steps: 运行 `npm pack --dry-run | tee .sisyphus/evidence/task-3-packaged-worker-error.txt`
    Expected: 输出中列出 `dist/pdf.worker.min.mjs`
    Evidence: .sisyphus/evidence/task-3-packaged-worker-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`scripts/copyPdfjsWorker.mjs`, `package.json`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle

  **What to do**: 让 `oracle` 审核已落地变更是否逐项满足本计划：检查是否只改了计划允许的文件范围、是否实现了 Task 1-3 的核心决策、是否没有引入公开 setup API、是否仍保持 ES/external bundling 不变。把审查结论保存为文字证据。
  **Acceptance Criteria**:
  - [x] `oracle` 明确给出“符合计划 / 不符合计划”的结论
  - [x] 结论中逐项覆盖 Task 1-3 与 Must Have / Must NOT Have
  - [x] 证据文件落到 `.sisyphus/evidence/f1-plan-compliance.txt`
  **QA Scenario**:
  ```
  Scenario: Oracle 审核计划符合性
    Tool: task
    Steps: 启动 `task(subagent_type="oracle", load_skills=[], run_in_background=false, description="Audit plan compliance", prompt="Review the implemented changes against .sisyphus/plans/pdfjs-worker-initialization.md. Confirm whether Task 1-3, Must Have, and Must NOT Have were followed. Return PASS/FAIL with concrete file-level reasons.")`，将返回结果写入 `.sisyphus/evidence/f1-plan-compliance.txt`
    Expected: 输出为 PASS，且没有指出公开 API、bundling 模式或 worker 路径决策偏离计划
    Evidence: .sisyphus/evidence/f1-plan-compliance.txt
  ```
- [x] F2. Code Quality Review — unspecified-high

  **What to do**: 让高强度代码审查代理检查实现质量、回归风险、类型安全与异常处理，重点确认 `src/pdfjsWorker.ts`、`src/pdfParser.ts`、`scripts/copyPdfjsWorker.mjs` 与新增测试文件之间没有隐含破坏面。
  **Acceptance Criteria**:
  - [x] 审查结果无 blocking 级问题
  - [x] 审查明确覆盖类型、环境分支、幂等逻辑、脚本稳定性
  - [x] 证据文件落到 `.sisyphus/evidence/f2-code-quality.txt`
  **QA Scenario**:
  ```
  Scenario: 高强度代码审查
    Tool: task
    Steps: 启动 `task(category="unspecified-high", load_skills=[], run_in_background=false, description="Review worker changes", prompt="Review the implemented pdfjs worker initialization changes for correctness, type safety, environment branching, idempotency, script reliability, and regression risk. Return PASS/FAIL with prioritized findings.")`，将返回结果写入 `.sisyphus/evidence/f2-code-quality.txt`
    Expected: 输出为 PASS，且没有 blocking correctness / type-safety / regression findings
    Evidence: .sisyphus/evidence/f2-code-quality.txt
  ```
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)

  **What to do**: 这里不使用人工点击；改为代理执行真实命令链路，覆盖测试、lint、build、pack 与运行时 smoke 验证。必须在同一轮验收里确认：测试全绿、lint 全绿、构建后 worker 资产存在、tarball 包含 worker、以及基于构建产物的 Node ESM smoke 脚本能看到自动设置后的 `workerSrc`。
  **Acceptance Criteria**:
  - [x] `npm test`、`npm run lint`、`npm run build:all` 全部通过
  - [x] `npm pack --dry-run` 输出包含 `dist/pdf.worker.min.mjs`
  - [x] Node ESM smoke 脚本能证明实现后的自动初始化逻辑会在 `workerSrc` 为空时补齐配置
  - [x] 证据文件落到 `.sisyphus/evidence/f3-manual-qa.txt`
  **QA Scenario**:
  ```
  Scenario: 真实命令链路验收
    Tool: Bash
    Steps: 依次运行 `npm test && npm run lint && npm run build:all && npm pack --dry-run`，然后运行 `node --input-type=module -e "import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { GlobalWorkerOptions } from 'pdfjs-dist'; import { PdfParser } from './dist/index.js'; const pdfPath = path.resolve('src/__tests__/test_github.pdf'); const fileBuffer = await readFile(pdfPath); const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength); GlobalWorkerOptions.workerSrc = ''; await PdfParser.encode(arrayBuffer); if (!GlobalWorkerOptions.workerSrc || !GlobalWorkerOptions.workerSrc.includes('pdf.worker.min.mjs')) { throw new Error('workerSrc was not auto-filled'); } console.log(GlobalWorkerOptions.workerSrc);"`，将完整输出写入 `.sisyphus/evidence/f3-manual-qa.txt`
    Expected: 全部命令成功，tarball 列出 `dist/pdf.worker.min.mjs`，且 Node 命令输出的 `workerSrc` 非空并包含 `pdf.worker.min.mjs`
    Evidence: .sisyphus/evidence/f3-manual-qa.txt
  ```
- [x] F4. Scope Fidelity Check — deep

  **What to do**: 让 `deep` 审核最终改动是否只覆盖本需求：自动初始化 + 随包发布 worker + Node/Jest 兼容，不带出 demo 重构、打包模式调整、额外 API 或无关文件改动。
  **Acceptance Criteria**:
  - [x] 审核结果确认改动没有超出本计划范围
  - [x] 若存在额外改动，必须被标记为 out-of-scope 并要求回退
  - [x] 证据文件落到 `.sisyphus/evidence/f4-scope-fidelity.txt`
  **QA Scenario**:
  ```
  Scenario: 深度范围一致性检查
    Tool: task
    Steps: 启动 `task(category="deep", load_skills=[], run_in_background=false, description="Check scope fidelity", prompt="Review the final changes for scope fidelity against .sisyphus/plans/pdfjs-worker-initialization.md. Flag any out-of-scope edits, stealth API additions, bundling changes, or unrelated refactors. Return PASS/FAIL with file-level reasoning.")`，将返回结果写入 `.sisyphus/evidence/f4-scope-fidelity.txt`
    Expected: 输出为 PASS，且没有指出 demo/CLI/构建模式/公开 API 的额外改动
    Evidence: .sisyphus/evidence/f4-scope-fidelity.txt
  ```

## Commit Strategy
- 默认不提交 git commit，除非用户显式要求。
- 如果用户要求提交，按实现任务拆成最多 3 个原子提交：`fix(pdf): add internal worker bootstrap`、`fix(pdf): auto configure worker before parsing`、`build(pdf): ship packaged pdf worker`。

## Success Criteria
- 发布后的 npm 包包含浏览器 worker 资产，且浏览器侧不再依赖 demo/CDN 才能初始化 `pdfjs-dist`。
- `PdfParser.encode()` 在 Node/Jest 场景下继续工作，不因新逻辑破坏现有 `legacy` 兼容路径。
- 宿主若提前设置 `GlobalWorkerOptions.workerSrc`，库不抢占配置。
- 所有验证命令与打包检查都可由代理自动执行，无需人工补步骤。
