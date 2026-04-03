# PdfParser decode：IntermediateDocument → PDF ArrayBuffer

## TL;DR
> **Summary**: 为 `PdfParser` 增加基于 `pdfkit` 的 `decode` 能力，把 `IntermediateDocument` 按页面尺寸与文本坐标重建为标准可读 PDF，并返回 `ArrayBuffer`。整个执行采用 TDD：先落失败测试，再补内部渲染服务与 `PdfParser.decode`，最后做 encode/decode 回归验证。
> **Deliverables**:
> - `pdfkit` 依赖接入与类型配套
> - `PdfParser.decode()` 的正式实现
> - 内部 PDF 渲染服务，负责页面创建、文本绘制与 `ArrayBuffer` 收集
> - decode 单测、失败路径测试、round-trip 集成测试
> - lint / test / build 全链路验证
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 5

## Context
### Original Request
引用一些 NPM 包依赖来实现 `PdfParser` 的 `decode` 函数功能，入参为 `IntermediateDocument`，输出 `ArrayBuffer`。

### Interview Summary
- 成功标准锁定为“标准可读 PDF”，不是高保真还原原始 PDF。
- 允许新增 npm 依赖。
- 测试策略锁定为 TDD。
- 首期保真范围只覆盖“页面尺寸 + 文本内容”，不要求恢复 outline、bookmark、复杂字体、颜色、旋转或 skew。

### Metis Review (gaps addressed)
- 默认运行时按 Node/Jest/CI 规划，不额外承诺浏览器端 `decode` 兼容性。
- 文本布局以 `IntermediateText.x/y/fontSize` 为主，不退化为顺序流式排版。
- `pageCount === 0` 视为非法输入，显式抛错，不生成语义失真的空白 PDF。
- 首期不写 document metadata、不恢复 `outline`、不尝试字体嵌入与样式重建，避免范围失控。

## Work Objectives
### Core Objective
让 `PdfParser.decode(intermediateDocument)` 能把一个 `IntermediateDocument` 重建为标准可读的 PDF 二进制，并以 `ArrayBuffer` 返回，且该输出可被现有 `PdfParser.encode()` 再次解析出正确的页数、页面尺寸与关键文本内容。

### Deliverables
- 在 `package.json` / `yarn.lock` 中引入 `pdfkit` 运行时依赖与 `@types/pdfkit` 类型依赖。
- 新增内部服务 `src/services/pdfDocumentRenderer.ts`，专职完成 PDFKit 文档创建、逐页绘制、文本过滤与 `ArrayBuffer` 收集。
- 在 `src/pdfParser.ts` 中实现静态 `decode`，包含输入校验、页面遍历与服务调用。
- 新增 decode 合同测试、非法输入测试、round-trip 集成测试。
- 确认 `yarn lint`、`yarn test`、`yarn build:all` 全通过。

### Definition of Done (verifiable conditions with commands)
- `yarn test --runInBand src/__tests__/pdfParserDecode.test.ts` 通过。
- `yarn test --runInBand src/__tests__/pdfParserDecode.integration.test.ts` 通过。
- `yarn lint` 通过。
- `yarn build:all` 通过。
- `npm pack --dry-run` 通过。
- `PdfParser.decode()` 返回值为 `ArrayBuffer`，且传给 `PdfParser.encode()` 后可验证页数、页面尺寸、文本命中。

### Must Have
- `PdfParser.decode()` 保持静态方法形态，不新增平行公开 API。
- 默认技术路线固定为 `pdfkit`，不在首期同时接入 `jspdf` 或 `pdf-lib`。
- 页面顺序严格按 `intermediateDocument.pageNumbers` 升序遍历。
- 页面尺寸使用 `intermediateDocument.getPageSizeByPageNumber(pageNumber)` 或页面对象的 `width/height`，不可写死默认纸张。
- 文本绘制优先使用 `IntermediateText.x` / `y` / `fontSize`，对空字符串、非有限坐标、非正数字体大小做安全过滤或回退。
- PDF 输出统一在内部转换为干净的 `ArrayBuffer`，不能把 `Buffer` 或 `Uint8Array` 直接泄露为最终返回值。

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- 不恢复 `outline`、bookmark、metadata、颜色、字体族、粗细、italic、rotate、skew、vertical text。
- 不改 `PdfParser.encode()`、`buildOutline()`、`renderThumbnail()` 等 decode 以外逻辑。
- 不在 `src/index.ts:1-58` 新增额外导出；内部渲染服务保持私有。
- 不把 `pdfkit` 相关代码散落到测试或 mock 文件里；渲染逻辑必须集中在独立内部服务。
- 不为“空文档”自动补一张空白页；该输入应报错。
- 不引入 `any` 或宽泛未约束类型逃逸。

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: TDD + Jest (`jest.config.js:1-37`)
- QA policy: Every task has agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Wave 0 / Preflight Bootstrap
> Mandatory before any numbered task.
- 在开始 Wave 1 前，先执行一次 `yarn install --frozen-lockfile`，确保 Jest、ts-jest、ESLint、mock 映射依赖与当前锁文件完全可用。
- 这一步不是实现任务，不写业务代码；它只是让后续红测与构建命令在干净 workspace 中可执行。
- Task 2 在修改 `package.json` / `yarn.lock` 后，仍需再次执行自己的安装校验，以验证新增依赖没有破坏锁文件一致性。

### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 decode 红测合同；Task 2 依赖接入与渲染服务骨架
Wave 2: Task 3 文本绘制与坐标回退逻辑；Task 4 `PdfParser.decode` 接线与失败路径
Wave 3: Task 5 round-trip 集成回归；Task 6 全链路收口（lint/test/build）并清理测试辅助重复
Wave 4: Final verification wave only

### Dependency Matrix (full, all tasks)
- Preflight Bootstrap → required before Task 1-6
- Task 1 → blocks Task 4, Task 5
- Task 2 → blocks Task 3, Task 4, Task 5, Task 6
- Task 3 → blocks Task 4, Task 5
- Task 4 → blocks Task 5, Task 6
- Task 5 → blocks Task 6
- Task 6 → required before F1-F4
- F1-F4 → after Task 1-6 all green

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `quick`, `unspecified-high`, `unspecified-high`
- Wave 2 → 2 tasks → `quick`, `unspecified-high`
- Wave 3 → 1 task → `quick`
- Wave 4 → 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. 先落 decode 红测合同与 fixture builder

  **What to do**: 新增 `src/__tests__/pdfParserDecode.test.ts`，并在同目录新增仅供测试使用的 fixture builder（推荐 `src/__tests__/helpers/intermediateDocumentBuilder.ts`）。测试必须固定覆盖四类合同：① 单页文档 decode 返回 `ArrayBuffer`；② 多页文档 decode 后再 `encode` 回来仍保持页数与页面尺寸；③ 关键文本内容可在 round-trip 后被重新解析出来；④ 空文档调用 decode 时抛出明确错误（固定断言错误文案包含 `cannot decode empty document`）。此任务是 TDD 红阶段：在实现前，测试必须因 `decode` 未实现/空返回而失败，且失败点精准落在 decode 合同，不允许出现 fixture 构造错误或导入错误。
  **Must NOT do**: 不在这里实现生产代码；不把 fixture builder 放到 `src/services/`；不依赖真实 PDF 文件作为 decode 输入；不为通过测试而弱化断言为“非 undefined 即可”。

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 以测试文件和构造器为主，改动面小但要求断言精确
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 非 UI 任务

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 5] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/__tests__/pdfParserIntegration.test.ts:15-231` — 现有 Jest 组织方式、`beforeAll`、断言风格、文本归一化检查模式
  - Pattern: `jest.config.js:1-37` — Jest 走 ts-jest ESM，且 `@hamster-note/types` / `@hamster-note/document-parser` 会映射到 mock 实现
  - API/Type: `src/__mocks__/@hamster-note/types.ts:35-124` — 测试环境下 `IntermediateText` 构造参数的真实需求
  - API/Type: `src/__mocks__/@hamster-note/types.ts:146-295` — `IntermediatePage` / `IntermediatePageMap.makeByInfoList()` 的测试构造方式
  - API/Type: `src/__mocks__/@hamster-note/types.ts:366-447` — `IntermediateDocument` 的 mock 构造与页面访问接口
  - Pattern: `src/pdfParser.ts:69-73` — 当前 decode 为空实现，红测应直接覆盖这里的待实现行为
  - Pattern: `src/__mocks__/@hamster-note/types.ts:395-423` — 测试环境下 `pageCount` / `pageNumbers` / `getPageByPageNumber()` / `getPageSizeByPageNumber()` 的可调用契约

  **Acceptance Criteria** (agent-executable only):
  - [ ] 新增 decode 测试文件能独立构造单页、多页、空文档 `IntermediateDocument`
  - [ ] 红测失败原因来自 `PdfParser.decode()` 未满足合同，而不是测试夹具或导入问题
  - [ ] 失败路径断言固定包含 `cannot decode empty document`
  - [ ] 测试中对 round-trip 文本命中采用现有 `join('') + replace(/\s+/g, '') + toLowerCase()` 风格

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: decode 合同红测按预期失败
    Tool: Bash
    Steps: 运行 `bash -o pipefail -c "yarn test --runInBand src/__tests__/pdfParserDecode.test.ts | tee .sisyphus/evidence/task-1-decode-red.txt"`
    Expected: 命令失败，且输出中的失败点来自 `PdfParser.decode` 返回空值/未实现，不出现 import error、fixture error、type error
    Evidence: .sisyphus/evidence/task-1-decode-red.txt

  Scenario: 空文档失败路径已被锁定
    Tool: Bash
    Steps: 运行 `bash -o pipefail -c "yarn test --runInBand src/__tests__/pdfParserDecode.test.ts -t 'empty document' | tee .sisyphus/evidence/task-1-decode-red-error.txt"`
    Expected: 命令失败，但日志中可以看到测试名称与预期错误文案 `cannot decode empty document`
    Evidence: .sisyphus/evidence/task-1-decode-red-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`src/__tests__/pdfParserDecode.test.ts`, `src/__tests__/helpers/intermediateDocumentBuilder.ts`]

- [x] 2. 接入 pdfkit 依赖并建立内部 PDF 渲染服务骨架

  **What to do**: 修改 `package.json` / `yarn.lock`，新增运行时依赖 `pdfkit` 与开发类型依赖 `@types/pdfkit`。同时新建内部文件 `src/services/pdfDocumentRenderer.ts`，导出单一内部异步函数（固定命名建议：`renderIntermediateDocumentToPdfBuffer`），签名固定为 `(document: IntermediateDocument) => Promise<ArrayBuffer>`。服务骨架内先完成：创建 `PDFDocument` 实例时设置 `autoFirstPage: false`；建立 `data` / `end` / `error` 事件收集逻辑；把 `Buffer.concat(chunks)` 安全切片为独立 `ArrayBuffer` 返回；暂时保留逐页绘制的 TODO 钩子或私有空实现。此任务结束后允许测试尚未全绿，但渲染服务必须可被 import，且基础类型编译通过。
  **Must NOT do**: 不在 `src/index.ts` 导出该服务；不把 `pdfkit` 直接耦合到测试 builder；不把最终返回类型写成 `Buffer`、`Uint8Array` 或 `Promise<File>`；不引入第二个备选 PDF 库。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 涉及依赖、Node 流、ArrayBuffer 边界与内部服务抽象
  - Skills: [] — 无需额外技能
  - Omitted: [`frontend-ui-ux`] — 非前端界面任务

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3, 4, 5, 6] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `package.json:15-44` — 当前运行时依赖与 devDependencies 位置
  - Pattern: `package.json:5-14` — 最终必须继续兼容 `yarn test` / `yarn lint` / `yarn build:all`
  - Pattern: `tsconfig.json:1-10` — TypeScript 路径别名与编译入口约束
  - Pattern: `src/services/mockGenerationService.ts:13-27` — 仓内 service 文件的简洁函数式组织模式
  - Pattern: `src/index.ts:51-58` — services 当前只经由 index 暴露公开服务，本任务新增服务保持私有
  - External: `https://pdfkit.org/` — 首选库官方文档
  - External: `https://www.npmjs.com/package/pdfkit` — 包元数据与 Node 定位

  **Acceptance Criteria** (agent-executable only):
  - [ ] `package.json` 包含 `pdfkit` 与 `@types/pdfkit`
  - [ ] `yarn.lock` 已同步更新且安装不报锁文件错误
  - [ ] `src/services/pdfDocumentRenderer.ts` 存在，内部导出函数返回类型为 `Promise<ArrayBuffer>`
  - [ ] 文档流结束后返回的是去除 `byteOffset` 污染的独立 `ArrayBuffer`

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: 依赖与类型接入后可以通过安装校验
    Tool: Bash
    Steps: 运行 `yarn install --frozen-lockfile | tee .sisyphus/evidence/task-2-pdfkit-deps.txt`
    Expected: 命令成功，不出现 lockfile mismatch 或缺少类型声明报错
    Evidence: .sisyphus/evidence/task-2-pdfkit-deps.txt

  Scenario: 渲染服务骨架可通过 TypeScript/Jest 编译路径
    Tool: Bash
    Steps: 运行 `yarn build:all | tee .sisyphus/evidence/task-2-pdfkit-deps-error.txt`
    Expected: 构建成功，说明 `pdfkit` 依赖、类型声明与 `src/services/pdfDocumentRenderer.ts` 骨架可被当前工程正确解析
    Evidence: .sisyphus/evidence/task-2-pdfkit-deps-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`package.json`, `yarn.lock`, `src/services/pdfDocumentRenderer.ts`]

- [x] 3. 完成逐页文本绘制、坐标回退与文本过滤规则

  **What to do**: 在 `src/services/pdfDocumentRenderer.ts` 内补齐实际渲染逻辑。固定规则如下：按 `document.pageNumbers` 升序遍历页面；每页通过 `document.getPageByPageNumber(pageNumber)` 与 `document.getPageSizeByPageNumber(pageNumber)` 获取页面对象和尺寸；使用 `doc.addPage({ size: [width, height], margin: 0 })` 创建页面；按页面 `texts` 原始顺序绘制文本。文本绘制策略固定为：`content.trim().length === 0` 的文本直接跳过；`x/y` 非有限数值时跳过；`fontSize <= 0` 时回退到 `Math.max(text.height, text.lineHeight, 12)`；坐标直接使用 `x/y`，不做 y 轴翻转；宽度不做强制换行，仅调用 `doc.fontSize(size).text(content, x, y, { lineBreak: false })`。若单个文本绘制抛错，捕获后跳过该文本并继续整页渲染，避免整个文档失败。为该服务新增专用单测（推荐 `src/__tests__/pdfDocumentRenderer.test.ts`），覆盖多页尺寸、空文本过滤、非法坐标跳过、字体大小回退四类行为。
  **Must NOT do**: 不尝试恢复字体族、粗细、颜色、旋转、vertical text；不做坐标排序重排；不把单个文本绘制失败上升为整个文档失败；不把 `outline` 写入 PDF。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 这是 decode 成败核心，涉及坐标与容错策略
  - Skills: [] — 无需额外技能
  - Omitted: [`refactor`] — 当前不是通用重构任务

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [4, 5] | Blocked By: [2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/pdfParser.ts:335-379` — encode 侧如何把 PDF 文本映射为 `IntermediateText`，决定 decode 应尊重现有文本顺序与字段
  - Pattern: `src/pdfParser.ts:395-406` — 现有坐标通过 viewport transform 得到；首期 decode 直接消费这些 viewport 坐标
  - API/Type: `node_modules/@hamster-note/types/dist/index.d.ts:13-77` — `IntermediateText` 真实字段定义
  - API/Type: `node_modules/@hamster-note/types/dist/index.d.ts:99-131` — `IntermediatePage.getTexts()` / `texts` 访问模型
  - API/Type: `node_modules/@hamster-note/types/dist/index.d.ts:215-240` — `IntermediateDocument` 页访问契约
  - Test: `src/__tests__/pdfParserIntegration.test.ts:78-123` — 文本命中校验与归一化方式
  - External: `https://pdfkit.org/` — `PDFDocument`, `addPage`, `text` API 的官方来源

  **Acceptance Criteria** (agent-executable only):
  - [ ] 每一页都按指定宽高创建，页面 margin 固定为 0
  - [ ] 非法文本（空内容、非有限坐标）被安全跳过，不影响整页输出
  - [ ] `fontSize <= 0` 时按照 `Math.max(text.height, text.lineHeight, 12)` 回退
  - [ ] 渲染服务专用单测通过，覆盖多页、过滤、回退三类规则

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: 渲染服务规则测试通过
    Tool: Bash
    Steps: 运行 `yarn test --runInBand src/__tests__/pdfDocumentRenderer.test.ts | tee .sisyphus/evidence/task-3-renderer-rules.txt`
    Expected: 测试通过，证明页面尺寸、文本过滤与字体回退规则都已固定
    Evidence: .sisyphus/evidence/task-3-renderer-rules.txt

  Scenario: 非法文本不会导致整个文档失败
    Tool: Bash
    Steps: 运行 `yarn test --runInBand src/__tests__/pdfDocumentRenderer.test.ts -t "skips invalid text" | tee .sisyphus/evidence/task-3-renderer-rules-error.txt`
    Expected: 测试通过，说明单个文本异常被跳过而不是让渲染服务 reject
    Evidence: .sisyphus/evidence/task-3-renderer-rules-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`src/services/pdfDocumentRenderer.ts`, `src/__tests__/pdfDocumentRenderer.test.ts`]

- [x] 4. 在 PdfParser 中实现 decode 校验与服务接线

  **What to do**: 修改 `src/pdfParser.ts` 的静态 `decode`，固定行为如下：① 若传入对象为空、`pageCount <= 0` 或 `pageNumbers.length === 0`，抛出 `new Error('cannot decode empty document')`；② 调用内部 `renderIntermediateDocumentToPdfBuffer(intermediateDocument)`；③ 始终返回 `ArrayBuffer`；④ 不新增实例级 `decode` override，不改变 `encode` 相关逻辑。必要时可在 `PdfParser` 内添加私有校验辅助函数，但不要把渲染细节重新写回 `pdfParser.ts`。完成后让 Task 1 的红测转绿。
  **Must NOT do**: 不修改 `PdfParser.encode()`、`loadPdf()`、`mapTextContentToIntermediate()`；不在 `src/index.ts` 暴露内部 helper；不返回 `undefined`、`File` 或 `Uint8Array`。

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 接线点集中在单文件，但要严格遵守前面锁定的契约
  - Skills: [] — 无需额外技能
  - Omitted: [`git-master`] — 非 git 任务

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [5, 6] | Blocked By: [1, 2, 3]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/pdfParser.ts:34-40` — 实例 `encode` 的封装方式，decode 不需要镜像出实例版本
  - Pattern: `src/pdfParser.ts:44-72` — 现有静态 `encode` / `decode` API 位置与返回类型
  - Pattern: `src/index.ts:4` — 公开 API 仍只导出 `PdfParser`
  - API/Type: `node_modules/@hamster-note/types/dist/index.d.ts:233-240` — `pageCount`、`pageNumbers`、`getPageByPageNumber`、`getPageSizeByPageNumber` 的真实契约
  - Test: `src/__tests__/pdfParserDecode.test.ts` — Task 1 已锁定的 decode 合同测试
  - Pattern: `src/services/pdfDocumentRenderer.ts` — 这里只负责接线与校验，不重复渲染逻辑

  **Acceptance Criteria** (agent-executable only):
  - [ ] `PdfParser.decode()` 在非空输入时返回 `ArrayBuffer`
  - [ ] 空文档报错固定为 `cannot decode empty document`
  - [ ] Task 1 中新增的 decode 合同测试全部转绿
  - [ ] `pdfParser.ts` 中没有重复实现页面绘制细节

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: decode 合同测试转绿
    Tool: Bash
    Steps: 运行 `yarn test --runInBand src/__tests__/pdfParserDecode.test.ts | tee .sisyphus/evidence/task-4-decode-wireup.txt`
    Expected: 测试通过，返回类型、空文档错误与基础 round-trip 合同满足
    Evidence: .sisyphus/evidence/task-4-decode-wireup.txt

  Scenario: 空文档错误路径稳定
    Tool: Bash
    Steps: 运行 `yarn test --runInBand src/__tests__/pdfParserDecode.test.ts -t "empty document" | tee .sisyphus/evidence/task-4-decode-wireup-error.txt`
    Expected: 该测试通过，说明空文档路径固定抛出 `cannot decode empty document`
    Evidence: .sisyphus/evidence/task-4-decode-wireup-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`src/pdfParser.ts`]

- [x] 5. 补 round-trip 集成回归，验证 decode 输出可被 encode 重新解析

  **What to do**: 新增 `src/__tests__/pdfParserDecode.integration.test.ts`。不要依赖外部 fixture PDF，而是用测试 builder 构造一个至少两页的 `IntermediateDocument`：第一页放入英文/符号混合文本，第二页放入中文或多段文本，页尺寸使用两种不同尺寸。测试流程固定为：`const pdfBuffer = await PdfParser.decode(doc)` → `const reparsed = await PdfParser.encode(pdfBuffer)`。断言至少覆盖：页数一致；每页尺寸在允许误差范围内匹配（推荐误差 ≤ 1）；第一页/第二页关键文本命中；返回 buffer 的 `byteLength > 0`。同时新增一个“非法文本被过滤但其余页面仍可 round-trip”的集成断言，确保容错策略真实可用。
  **Must NOT do**: 不读取磁盘上的真实 PDF 文件；不把断言降成“能 reparse 即可”；不新增与 decode 无关的 encode 断言范围。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: 需要跨 decode / encode 两条链路做真实回归
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 非浏览器测试

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [6] | Blocked By: [1, 2, 3, 4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/__tests__/pdfParserIntegration.test.ts:54-76` — 页数与页面尺寸断言风格
  - Pattern: `src/__tests__/pdfParserIntegration.test.ts:85-123` — 文本命中与归一化断言风格
  - Pattern: `src/pdfParser.ts:44-67` — `encode` 的返回契约，round-trip 以此为终点验证
  - Pattern: `src/pdfParser.ts:84-150` — encode 侧页面构造逻辑，会决定 round-trip 后可观察到的页尺寸与文本结构
  - API/Type: `src/__mocks__/@hamster-note/types.ts:366-447` — 测试环境下构造 `IntermediateDocument` 的方式

  **Acceptance Criteria** (agent-executable only):
  - [ ] 集成测试不依赖磁盘 PDF 文件，完全由 builder 构造 `IntermediateDocument`
  - [ ] round-trip 后页数一致
  - [ ] round-trip 后每页尺寸误差不超过 1
  - [ ] 关键文本在重新解析后可命中
  - [ ] 非法文本过滤场景不会破坏其余内容的 round-trip

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: 两页 round-trip 集成测试通过
    Tool: Bash
    Steps: 运行 `yarn test --runInBand src/__tests__/pdfParserDecode.integration.test.ts | tee .sisyphus/evidence/task-5-roundtrip.txt`
    Expected: 测试通过，证明 decode 输出的 PDF 可被 encode 正常重新解析
    Evidence: .sisyphus/evidence/task-5-roundtrip.txt

  Scenario: 非法文本过滤后的 round-trip 仍通过
    Tool: Bash
    Steps: 运行 `yarn test --runInBand src/__tests__/pdfParserDecode.integration.test.ts -t "filters invalid text" | tee .sisyphus/evidence/task-5-roundtrip-error.txt`
    Expected: 测试通过，说明单个异常文本被过滤后，其余页面与文本仍可 round-trip
    Evidence: .sisyphus/evidence/task-5-roundtrip-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: [`src/__tests__/pdfParserDecode.integration.test.ts`, `src/__tests__/helpers/intermediateDocumentBuilder.ts`]

- [x] 6. 做最终收口：去重测试辅助并跑 lint / full test / build

  **What to do**: 在所有测试与实现稳定后，整理 `src/__tests__/helpers/intermediateDocumentBuilder.ts`，避免与 `pdfDocumentRenderer.test.ts` 或集成测试内重复定义 helper。确认 `pdfDocumentRenderer.ts` 没有遗留 TODO、调试日志或未使用导出。最后统一执行 `yarn lint`、`yarn test`、`yarn build:all`。如果 `pdfkit` 类型或 Node 类型导致 lint/ts-jest 噪音，优先在实现文件内缩小类型边界修正，不新增宽松 eslint disable。
  **Must NOT do**: 不顺手重构 decode 无关文件；不通过跳过测试、放宽断言或关闭 lint 规则来换绿；不新增 changelog/docs 任务到本计划范围。

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 以收口和全链路校验为主
  - Skills: [] — 无需额外技能
  - Omitted: [`refactor`] — 仅做必要去重，不做额外架构重构

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [F1, F2, F3, F4] | Blocked By: [2, 4, 5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `package.json:5-14` — 标准验证命令集合
  - Pattern: `.github/workflows/ci-pr.yml:16-50` — CI 最终要求是 lint → test → build → npm pack dry-run
  - Pattern: `jest.config.js:25-36` — Jest 收口时应继续兼容现有 test match 与 setupFiles
  - Pattern: `src/__tests__/pdfParserDecode.test.ts` — 单测入口
  - Pattern: `src/__tests__/pdfParserDecode.integration.test.ts` — 集成入口
  - Pattern: `src/__tests__/pdfDocumentRenderer.test.ts` — 服务规则测试入口

  **Acceptance Criteria** (agent-executable only):
  - [ ] decode 相关 helper 不重复定义
  - [ ] `yarn lint` 通过
  - [ ] `yarn test` 通过
  - [ ] `yarn build:all` 通过
  - [ ] `npm pack --dry-run` 通过
  - [ ] 不残留 TODO / console 调试输出 / 未使用导出

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: 全量测试通过
    Tool: Bash
    Steps: 运行 `yarn test | tee .sisyphus/evidence/task-6-full-test.txt`
    Expected: 全量 Jest 通过，decode 新增测试与既有测试无回归
    Evidence: .sisyphus/evidence/task-6-full-test.txt

  Scenario: lint 与构建通过
    Tool: Bash
    Steps: 运行 `yarn lint && yarn build:all | tee .sisyphus/evidence/task-6-full-build.txt`
    Expected: 两条命令均成功，无新增 lint 错误、无构建失败
    Evidence: .sisyphus/evidence/task-6-full-build.txt

  Scenario: 打包干跑通过
    Tool: Bash
    Steps: 运行 `npm pack --dry-run | tee .sisyphus/evidence/task-6-pack-dry-run.txt`
    Expected: 命令成功，说明新增依赖与构建产物不会破坏 npm 打包流程
    Evidence: .sisyphus/evidence/task-6-pack-dry-run.txt
  ```

  **Commit**: YES | Message: `feat(pdf-parser): add intermediate document decode support` | Files: [`package.json`, `yarn.lock`, `src/pdfParser.ts`, `src/services/pdfDocumentRenderer.ts`, `src/__tests__/pdfParserDecode.test.ts`, `src/__tests__/pdfParserDecode.integration.test.ts`, `src/__tests__/pdfDocumentRenderer.test.ts`, `src/__tests__/helpers/intermediateDocumentBuilder.ts`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle

  **What to do**: 启动 `oracle` 审查代理，对照本计划逐项核查最终实现是否满足 Task 1-6 的硬约束。审查范围至少包括：依赖是否仅使用 `pdfkit`；`PdfParser.decode()` 是否固定返回 `ArrayBuffer`；是否按 TDD 交付了单测与集成测试；是否错误地扩展到了 metadata / outline / 样式恢复；Task 6 的 `lint` / `test` / `build` / `npm pack --dry-run` 证据是否齐全。产出必须明确列出 PASS / FAIL 项，不允许只给笼统评价。
  **Acceptance Criteria**:
  - [ ] `oracle` 输出逐条覆盖 Task 1-6 的完成情况
  - [ ] 未发现超范围实现
  - [ ] 明确确认 `ArrayBuffer` 返回契约与空文档错误契约
  - [ ] 审查结论为 APPROVE / OKAY 类通过状态

  **QA Scenarios**:
  ```
  Scenario: 计划符合性审查通过
    Tool: task
    Steps: 启动 `task(subagent_type="oracle", load_skills=[], run_in_background=false, prompt="Review implementation against .sisyphus/plans/pdfparser-decode.md. Verify every Task 1-6 acceptance criterion, confirm no scope expansion, and produce PASS/FAIL with evidence references.")`，将输出保存为 `.sisyphus/evidence/f1-plan-compliance.md`
    Expected: 报告中所有关键项为 PASS，且结论为批准通过
    Evidence: .sisyphus/evidence/f1-plan-compliance.md
  ```

- [x] F2. Code Quality Review — unspecified-high

  **What to do**: 启动高强度代码审查代理，对实现代码做静态质量检查，重点看类型安全、异常处理、服务边界、重复逻辑、未使用导出、潜在资源泄漏、以及 `pdfkit` 流转 `ArrayBuffer` 的边界处理是否稳健。必须指出具体文件与问题等级；若无问题，也要明确写出“未发现阻塞问题”。
  **Acceptance Criteria**:
  - [ ] 审查覆盖 `src/pdfParser.ts`、`src/services/pdfDocumentRenderer.ts` 与新增测试文件
  - [ ] 无高严重度类型/资源/异常处理缺陷
  - [ ] 没有因 `pdfkit` 接入带来的未处理流错误或脏 `ArrayBuffer` 风险
  - [ ] 审查结论为 APPROVE / OKAY 类通过状态

  **QA Scenarios**:
  ```
  Scenario: 代码质量审查通过
    Tool: task
    Steps: 启动 `task(category="unspecified-high", load_skills=[], run_in_background=false, prompt="Perform a code quality review for the implementation delivered by .sisyphus/plans/pdfparser-decode.md. Focus on type safety, error handling, stream lifecycle, ArrayBuffer conversion correctness, duplication, and dead code. Produce blocking/non-blocking findings with file paths.")`，将输出保存为 `.sisyphus/evidence/f2-code-quality.md`
    Expected: 报告中无 blocking finding，结论为批准通过
    Evidence: .sisyphus/evidence/f2-code-quality.md
  ```

- [x] F3. Real Manual QA — unspecified-high

  **What to do**: 由独立审查代理执行真实命令级 QA，而不是只读代码。固定执行顺序为：`yarn test --runInBand src/__tests__/pdfParserDecode.test.ts`、`yarn test --runInBand src/__tests__/pdfParserDecode.integration.test.ts`、`yarn test --runInBand src/__tests__/pdfDocumentRenderer.test.ts`、`yarn lint`、`yarn build:all`、`npm pack --dry-run`。同时抽查关键证据文件是否存在且内容与命令结果一致。若任何命令失败，F3 直接失败。
  **Acceptance Criteria**:
  - [ ] 六条命令全部成功
  - [ ] decode 单测、集成测试、renderer 测试均通过
  - [ ] lint / build / pack dry-run 均通过
  - [ ] 审查结论为 APPROVE / OKAY 类通过状态

  **QA Scenarios**:
  ```
  Scenario: 命令级真实 QA 通过
    Tool: task
    Steps: 启动 `task(category="unspecified-high", load_skills=[], run_in_background=false, prompt="Execute real verification for the implementation governed by .sisyphus/plans/pdfparser-decode.md. Run the required test, lint, build, and npm pack dry-run commands. Confirm evidence files exist and match command outcomes. Return PASS/FAIL with exact command results.")`，将输出保存为 `.sisyphus/evidence/f3-real-qa.md`
    Expected: 所有命令 PASS，且证据文件核对一致
    Evidence: .sisyphus/evidence/f3-real-qa.md
  ```

- [x] F4. Scope Fidelity Check — deep

  **What to do**: 启动 `deep` 审查代理，专门检查实现是否严格停留在“页面尺寸 + 文本内容”的首期边界内，且没有偷渡浏览器支持承诺、outline 恢复、metadata 写入、复杂样式恢复、额外公开 API 或与 decode 无关的重构。必须同时确认错误路径与回退策略实现和计划一致：空文档报错、非法文本跳过、字体大小回退、文本顺序不重排。
  **Acceptance Criteria**:
  - [ ] 未发现越界功能或额外公开 API
  - [ ] 空文档、非法文本、字体回退、文本顺序策略与计划一致
  - [ ] 未引入与 decode 无关的重构
  - [ ] 审查结论为 APPROVE / OKAY 类通过状态

  **QA Scenarios**:
  ```
  Scenario: 范围一致性审查通过
    Tool: task
    Steps: 启动 `task(category="deep", load_skills=[], run_in_background=false, prompt="Check scope fidelity for the implementation against .sisyphus/plans/pdfparser-decode.md. Verify it only delivers page size + text content decode support, with no metadata/outline/style restoration, no browser support promise, no extra public APIs, and no unrelated refactors. Return PASS/FAIL with evidence.")`，将输出保存为 `.sisyphus/evidence/f4-scope-fidelity.md`
    Expected: 报告确认实现完全落在计划边界内
    Evidence: .sisyphus/evidence/f4-scope-fidelity.md
  ```

## Commit Strategy
- 单一原子提交，放在 Task 6 完成且 F1-F4 全部批准之后。
- 提交信息固定为：`feat(pdf-parser): add intermediate document decode support`
- 提交前必须确认工作区只包含本计划涉及文件，不夹带无关改动。

## Success Criteria
- `PdfParser.decode()` 已从空实现变为稳定可用的 `ArrayBuffer` 输出。
- 通过 TDD 锁定了空文档错误、多页尺寸、关键文本 round-trip 与非法文本过滤行为。
- 新增内部服务把 PDFKit 使用面限制在单一文件，`pdfParser.ts` 仅承担校验与接线职责。
- CI 所需 `yarn lint`、`yarn test`、`yarn build:all` 均可自动通过。
- 首期范围保持克制：只交付页面尺寸 + 文本内容，不偷渡 outline/metadata/复杂样式恢复。
