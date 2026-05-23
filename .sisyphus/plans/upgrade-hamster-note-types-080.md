# Upgrade @hamster-note/types to 0.8.0 and Wire IntermediateImage API

## TL;DR
> **Summary**: Upgrade `@hamster-note/types` from `^0.7.0` to exact `0.8.0`, migrate all page text APIs to the new `content/getContent` model, and implement as-complete-as-practical `IntermediateImage` extraction/serialization/decode support with explicit spike gates and fallbacks.
> **Deliverables**:
> - Exact dependency/lockfile upgrade for `@hamster-note/types@0.8.0` and compatibility check for `@hamster-note/document-parser@^0.2.1`.
> - Rewritten Jest mock for the 0.8.0 type surface.
> - Full migration from `texts/getTexts/hasLoadedTexts` to `content/getContent/hasLoadedContent`.
> - Image extraction architecture using pdfjs operator lists, graphics-state/CTM tracking, object resolution, data URL conversion, and fallback warnings for unsupported constructs.
> - Decode path that renders `IntermediateText` and `IntermediateImage` in preserved content order.
> - Demo serialization updates, image-aware tests/fixtures, `check:types`, and full verification command coverage.
> **Effort**: XL
> **Parallel**: YES - 5 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 6 → Task 8 → Task 11 → Final Verification

## Context
### Original Request
用户原始请求："升级 `@hamster-note/types` 到 0.8.0 并接上最新的 API"

### Interview Summary
- 用户确认这不是 text-only 兼容迁移，必须支持图片内容。
- 测试策略：先完成迁移，再更新/补充测试。
- 类型验证：新增独立 `check:types` / `tsc --noEmit` 脚本。
- 图片范围：选择“尽量完整”，即尽可能覆盖 masks、patterns、Form XObject、复杂 transform，但计划必须设置 spike gate、fallback 和非目标边界，避免无边界重写 PDF renderer。
- 依赖策略：默认不引入 native `canvas`/`sharp`；如 RGBA/bitmap 编码必须新增依赖，优先纯 JS，例如 `pngjs` 或 `upng-js`。

### Metis Review (gaps addressed)
- Guardrail: first verify `@hamster-note/document-parser@^0.2.1` compatibility with `@hamster-note/types@0.8.0`; if incompatible, stop and report exact peer/type conflict before broader migration.
- Guardrail: lock `IntermediateImage.src` as `data:image/*;base64` for this implementation unless real 0.8.0 `.d.ts` proves another required format.
- Guardrail: preserve `IntermediatePage.content` order according to PDF drawing/operator order as far as the chosen extraction model can observe; do not group all images before/after all text in decode.
- Guardrail: unsupported masks/patterns/Form XObject/SMask/inline image edge cases must produce deterministic warning metadata/logging and must not crash encode/decode.
- Guardrail: do not introduce native image dependencies as the first option; if pure JS encoding is impossible, create an explicit dependency decision note in the implementation result.

## Work Objectives
### Core Objective
Upgrade the package to `@hamster-note/types@0.8.0` and make the parser, tests, demo serializer, and verification pipeline conform to the latest API, including `IntermediateContent` pages with both text and image entries.

### Deliverables
- `package.json` and lockfile updated to exact `@hamster-note/types@0.8.0` with stale `^0.7.0` override removed or replaced.
- `package.json` script `check:types` added as `tsc --noEmit`.
- `src/__mocks__/@hamster-note/types.ts` rewritten to match 0.8.0 actual API, with no 0.7 compatibility aliases unless a test explicitly documents why.
- `src/pdfParser.ts` migrated to `content/getContent/hasLoadedContent` and extended for image extraction and ordered decode drawing.
- `demo/demoDocumentSerialization.js` and related demo tests migrated to content-aware serialization.
- New or updated fixtures/tests proving pages can contain both `IntermediateText` and `IntermediateImage`.
- Verification evidence under `.sisyphus/evidence/` for every task.

### Definition of Done (verifiable conditions with commands)
- `yarn check:types` exits `0` and output contains no `error TS`.
- `yarn test --runTestsByPath src/__tests__/mapTextContentToIntermediate.test.ts` exits `0` and output contains `PASS`.
- `yarn test --runTestsByPath src/__tests__/pdfParserIntegration.test.ts demo/__tests__/demoDocumentSerialization.test.ts` exits `0` and output contains `PASS`.
- `yarn test` exits `0`.
- `yarn lint` exits `0`.
- `yarn build:all` exits `0`.
- `yarn verify:package` exits `0`.
- `yarn verify:vite` exits `0`.
- `npm pack --dry-run` exits `0`.

### Must Have
- Exact 0.8.0 type contract verified from installed package before adapting source code.
- All direct `texts`, `getTexts`, and `hasLoadedTexts` usage migrated or removed.
- `IntermediatePage.content` supports mixed text/image content.
- Decode renders content in original content order, not as separate grouped phases.
- Image extraction handles common image XObject and inline image paths and attempts complex paths through a bounded spike.
- Unsupported complex image constructs fail soft with deterministic warning evidence.
- Tests cover no-image PDF, text+image PDF, inline image when fixture/tooling supports it, unsupported mask/pattern fallback, and lazy `getContent()` idempotency.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must not perform a text-only migration.
- Must not leave the mock on the 0.7.0 surface.
- Must not introduce native `canvas` or `sharp` as the default first solution.
- Must not claim 100% PDF image semantic fidelity unless tests prove every supported construct.
- Must not rewrite unrelated subsystems: `src/rules/`, `src/generator/`, `src/pdfjsWorker.ts`, polyfills, outline-only tests, font fallback tests, or transform-only tests.
- Must not use human visual inspection as an acceptance criterion.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: migration-first, then update/add tests using Jest 30 + ts-jest ESM.
- Type decision: add `check:types` as `tsc --noEmit` and run it before broad validation.
- QA policy: Every task has agent-executed scenarios with concrete commands or file inspections.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 dependency/type contract baseline and Task 2 0.8.0 mock rewrite foundation.
Wave 2: Task 3 mechanical content API migration, Task 4 image extraction spike/architecture, Task 5 image encoding utility decision.
Wave 3: Task 6 encode path mixed content implementation, Task 7 ordered decode rendering, Task 8 thumbnail/cover semantics.
Wave 4: Task 9 demo serialization migration, Task 10 fixture/test updates, Task 11 package verification integration.
Wave 5: Task 12 unsupported construct hardening and Task 13 final command/evidence sweep.

### Dependency Matrix (full, all tasks)
- Task 1 blocks Tasks 2-13.
- Task 2 blocks Tasks 3, 6, 7, 8, 9, 10.
- Task 3 blocks Tasks 6, 7, 9, 10.
- Task 4 blocks Tasks 5, 6, 12.
- Task 5 blocks Tasks 6, 7, 8, 10, 12.
- Task 6 blocks Tasks 7, 8, 10, 11, 12, 13.
- Task 7 blocks Tasks 10, 11, 12, 13.
- Task 8 blocks Tasks 9, 10, 11, 13.
- Task 9 blocks Tasks 10, 11, 13.
- Task 10 blocks Tasks 11, 12, 13.
- Task 11 blocks Task 13.
- Task 12 blocks Task 13.
- Task 13 blocks Final Verification Wave.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 2 tasks → `deep`, `quick`
- Wave 2 → 3 tasks → `deep`, `ultrabrain`, `deep`
- Wave 3 → 3 tasks → `deep`, `deep`, `quick`
- Wave 4 → 3 tasks → `quick`, `deep`, `quick`
- Wave 5 → 2 tasks → `deep`, `unspecified-high`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Upgrade dependency baseline and verify 0.8.0 contract

  **What to do**: Update `package.json` dependency and override entries from `@hamster-note/types@^0.7.0` to exact `0.8.0`, update the lockfile with the repo's package manager, add `check:types` as `tsc --noEmit`, and inspect installed `node_modules/@hamster-note/types` `.d.ts` files to record the actual `IntermediateImage`, `IntermediateContent`, `IntermediatePage`, thumbnail, cover, and polygon contracts in implementation notes or test comments.
  **Must NOT do**: Do not migrate source code before confirming the installed 0.8.0 API. Do not upgrade `@hamster-note/document-parser` unless install/type checks prove it is incompatible; if incompatible, update it only to the minimal compatible version and record the reason.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: dependency compatibility and lockfile updates can affect the whole package.
  - Skills: [] - No specialized skill required.
  - Omitted: [`git-master`] - No commit requested during task execution.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: Tasks 2-13 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `package.json` - current `@hamster-note/types` dependency/override is `^0.7.0`; update both to exact `0.8.0`.
  - Pattern: `AGENTS.md` - repository validation command baseline is `npm test && npm run lint`; this repo also uses yarn scripts discovered in test infra.
  - API/Type: `node_modules/@hamster-note/types` - inspect actual installed 0.8.0 `.d.ts` files after install; do not rely on memory.
  - External: `https://registry.npmjs.org/@hamster-note/types/-/types-0.8.0.tgz` - verified package source for 0.8.0.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `node -p "require('./package.json').dependencies['@hamster-note/types']"` prints `0.8.0`.
  - [ ] No `^0.7.0` string remains for `@hamster-note/types` in `package.json`.
  - [ ] `node -p "require('./package.json').scripts['check:types']"` prints `tsc --noEmit`.
  - [ ] Package-manager install/update command exits `0` and lockfile contains `@hamster-note/types@0.8.0`.
  - [ ] A type-contract inspection command confirms exported `IntermediateImage`, `IntermediateContent`, `IntermediatePage.getContent`, and polygon utilities exist.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Dependency baseline resolves
    Tool: Bash
    Steps: Run `yarn install --mode=skip-builds` or the repo-equivalent install command, then run `yarn why @hamster-note/types`.
    Expected: Command exits 0 and shows a single resolved `@hamster-note/types@0.8.0` path.
    Evidence: .sisyphus/evidence/task-1-dependency-baseline.txt

  Scenario: document-parser compatibility fails soft
    Tool: Bash
    Steps: Run `yarn check:types` before source migration and capture dependency/type errors.
    Expected: If `@hamster-note/document-parser` is incompatible, output identifies the exact incompatible import/peer range; otherwise no dependency-resolution error occurs.
    Evidence: .sisyphus/evidence/task-1-document-parser-compat.txt
  ```

  **Commit**: NO | Message: `chore(deps): upgrade hamster note types to 0.8.0` | Files: `package.json`, lockfile

- [x] 2. Rewrite Jest types mock to exact 0.8.0 surface

  **What to do**: Replace `src/__mocks__/@hamster-note/types.ts` with a 0.8.0-compatible mock: `IntermediatePage.content`, `setGetContent`, `getContent`, `hasLoadedContent`, `IntermediateContent`, `IntermediateImage`, `IntermediateImageSerialized`, `IntermediateText.opacity`, thumbnail/cover returning `IntermediateImage | undefined`, and polygon utilities. Keep behavior compatible with existing tests, but remove stale 0.7 aliases unless a test explicitly validates backward compatibility.
  **Must NOT do**: Do not keep `texts`, `getTexts`, `setGetTexts`, or `hasLoadedTexts` as silent compatibility aliases. Do not invent fields that are absent from real 0.8.0 `.d.ts` files.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused single mock file once Task 1 provides the exact contract.
  - Skills: [] - No specialized skill required.
  - Omitted: [`ai-slop-remover`] - Use only after implementation if the file becomes noisy.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: Tasks 3, 6, 7, 8, 9, 10 | Blocked By: Task 1

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/__mocks__/@hamster-note/types.ts` - current 578-line 0.7.0 mock includes `IntermediateText`, `IntermediatePage`, `IntermediatePageMap`, `IntermediateDocument`, outline types, and `Vector2`.
  - Pattern: `jest.config.js` - maps `@hamster-note/types` to the mock file.
  - API/Type: `node_modules/@hamster-note/types` - source of truth for field names and signatures.
  - Test: `src/__tests__/pdfParserIntegration.test.ts` - integration tests construct mocked documents/pages.
  - Test: `demo/__tests__/demoDocumentSerialization.test.ts` - demo serializer tests construct mocked pages and lazy loaders.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `src/__mocks__/@hamster-note/types.ts` exports `IntermediateImage` and `IntermediateContent`.
  - [ ] `src/__mocks__/@hamster-note/types.ts` contains `getContent` and `hasLoadedContent` but no `getTexts` or `hasLoadedTexts` compatibility method.
  - [ ] `yarn test --runTestsByPath src/__tests__/mapTextDir.test.ts` exits `0`.
  - [ ] `yarn check:types` progresses beyond mock export errors; remaining errors, if any, are source migration errors for later tasks.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Mock exposes 0.8.0 content API
    Tool: Bash
    Steps: Run `node -e "const fs=require('fs'); const s=fs.readFileSync('src/__mocks__/@hamster-note/types.ts','utf8'); if(!s.includes('IntermediateImage')||!s.includes('getContent')||s.includes('getTexts')) process.exit(1)"`.
    Expected: Command exits 0.
    Evidence: .sisyphus/evidence/task-2-mock-surface.txt

  Scenario: Basic enum/type tests still run
    Tool: Bash
    Steps: Run `yarn test --runTestsByPath src/__tests__/mapTextDir.test.ts`.
    Expected: Jest exits 0 and output contains `PASS`.
    Evidence: .sisyphus/evidence/task-2-map-text-dir.txt
  ```

  **Commit**: NO | Message: `test(types): update hamster note types mock for 0.8.0` | Files: `src/__mocks__/@hamster-note/types.ts`

- [x] 3. Migrate source and tests from text API to content API

  **What to do**: Replace source/test usage of `IntermediatePage.texts`, `getTexts`, `setGetTexts`, and `hasLoadedTexts` with `content`, `getContent`, `setGetContent`, and `hasLoadedContent`. In `src/pdfParser.ts`, rename `resolvePageTexts` to a content-aware resolver that returns mixed content but initially filters text for unchanged text rendering. Update tests and demo factories to create `content` arrays.
  **Must NOT do**: Do not add image extraction in this task; keep this task focused on mechanical 0.8.0 API migration and compile/test restoration.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: cross-file API migration across implementation, tests, and demo fixtures.
  - Skills: [] - No specialized skill required.
  - Omitted: [`frontend-ui-ux`] - No UI redesign.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Tasks 6, 7, 9, 10 | Blocked By: Tasks 1, 2

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts` - imports and constructs `IntermediatePage`, currently with `texts`; decode consumes `page.texts` and `page.getTexts()`.
  - Pattern: `src/__tests__/pdfParserIntegration.test.ts` - tests serialize/parse and decode mocked pages.
  - Pattern: `src/__tests__/mapTextContentToIntermediate.test.ts` - text extraction tests should remain text-specific.
  - Pattern: `demo/__tests__/demoDocumentSerialization.test.ts` - page factories currently use text arrays/lazy text loaders.
  - API/Type: `node_modules/@hamster-note/types` - `IntermediateContent` union is the new page content contract.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Repository content search finds no `getTexts`, `setGetTexts`, `hasLoadedTexts`, or `.texts` references outside historical artifacts or generated evidence.
  - [ ] `yarn check:types` has no errors related to removed 0.7 page text APIs.
  - [ ] `yarn test --runTestsByPath src/__tests__/mapTextContentToIntermediate.test.ts` exits `0`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Removed page text APIs are gone
    Tool: Bash
    Steps: Run `rg "getTexts|setGetTexts|hasLoadedTexts|\.texts" src demo --glob '!**/node_modules/**'`.
    Expected: Command returns no active source/test matches except comments explicitly documenting migration history.
    Evidence: .sisyphus/evidence/task-3-removed-text-api.txt

  Scenario: Text extraction stays stable after content migration
    Tool: Bash
    Steps: Run `yarn test --runTestsByPath src/__tests__/mapTextContentToIntermediate.test.ts`.
    Expected: Jest exits 0 and output contains `PASS`.
    Evidence: .sisyphus/evidence/task-3-text-extraction.txt
  ```

  **Commit**: NO | Message: `refactor(types): migrate pages to content api` | Files: `src/pdfParser.ts`, `src/__tests__/*.test.ts`, `demo/__tests__/*.test.ts`

- [x] 4. Build bounded pdfjs image extraction spike and graphics-state model

  **What to do**: Add an internal image extraction module/function path in `src/pdfParser.ts` or a nearby private helper that reads `PDFPageProxy.getOperatorList()`, walks operators in order, tracks graphics state stack (`save`/`restore`), CTM transforms, image drawing operators, Form XObject/pattern/mask candidates where exposed, and returns ordered extraction records with `src` status, image dimensions, polygon, opacity, and unsupported warnings. The spike must decide and document the exact supported/fallback classes for: `OPS.paintImageXObject`, `OPS.paintInlineImageXObject`, `OPS.paintImageMaskXObject`, repeat/group variants, Form XObject-contained images, patterns, and soft masks.
  **Must NOT do**: Do not rely on scanning image OPS alone without transform state. Do not block all encode on unsupported complex constructs. Do not introduce native dependencies.

  **Recommended Agent Profile**:
  - Category: `ultrabrain` - Reason: pdfjs operator order, graphics-state transforms, and image placement are the highest-risk logic.
  - Skills: [] - No specialized skill required.
  - Omitted: [`playwright`] - Browser automation is not needed for operator-level unit validation.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Tasks 5, 6, 12 | Blocked By: Task 1

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts` - existing pdfjs usage includes text content extraction and thumbnail rendering.
  - API/Type: `pdfjs-dist` `page.getOperatorList()` and `OPS` constants.
  - External: `https://github.com/mozilla/pdf.js/blob/master/src/shared/util.js#L339-L351` - image-related OPS constants.
  - External: `https://github.com/mozilla/pdf.js/issues/14542` - image extraction caveats and `page.objs.get` async resolution.
  - External: pdfjs tests around `api_spec.js` image extraction - `page.objs.get(imgArgs[0])` returns decoded image data when resolved.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A helper exists that walks operator list order and records image-related operations with transform/polygon data or deterministic unsupported warnings.
  - [ ] The helper uses `page.objs.get(objId, callback)` or a Promise wrapper that cannot hang forever; missing objects produce warnings.
  - [ ] Unit tests or targeted integration tests cover at least one image XObject path and one unsupported/fallback path.
  - [ ] The implementation documents supported and unsupported operator classes in comments near the helper.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Common image operator extracts placement
    Tool: Bash
    Steps: Run the new/updated targeted Jest test for the image extraction helper, using a mocked `getOperatorList()` with transform + `paintImageXObject` and mocked `page.objs.get` callback.
    Expected: Test exits 0; extracted record has `src` or resolvable image data, four-point polygon, width/height, opacity default `1`, and no unsupported warning.
    Evidence: .sisyphus/evidence/task-4-image-operator-happy.txt

  Scenario: Unsupported complex construct fails soft
    Tool: Bash
    Steps: Run the targeted Jest test with mocked mask/pattern/Form XObject operator that the spike cannot fully resolve.
    Expected: Test exits 0; result contains a deterministic warning and encode does not throw.
    Evidence: .sisyphus/evidence/task-4-unsupported-warning.txt
  ```

  **Commit**: NO | Message: `feat(pdf): add image operator extraction spike` | Files: `src/pdfParser.ts`, targeted test files/fixtures

- [x] 5. Implement image data URL conversion policy without native dependencies

  **What to do**: Implement or select the minimal image encoding path required to convert pdfjs decoded image objects into `IntermediateImage.src`. Priority order is: preserve already encoded JPEG/PNG data if exposed by pdfjs; otherwise encode RGBA/RGB/gray data into PNG using a pure-JS path; only if impossible, leave a recorded dependency decision note and fallback warning. `IntermediateImage.src` must be `data:image/*;base64` unless the installed 0.8.0 type contract requires another format.
  **Must NOT do**: Do not add `canvas` or `sharp` by default. Do not store raw binary arrays in `src` if 0.8.0 requires string image source.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: dependency/runtime compatibility and binary encoding correctness affect Node/browser builds.
  - Skills: [] - No specialized skill required.
  - Omitted: [`frontend-ui-ux`] - No visual design work.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Tasks 6, 7, 8, 10, 12 | Blocked By: Task 4

  **References** (executor has NO interview context - be exhaustive):
  - API/Type: `@hamster-note/types@0.8.0` `IntermediateImage.src` and serialized image contract.
  - API/Type: pdfjs image object shape commonly includes `data`, `width`, `height`, `kind`, and optional `bitmap`/`interpolate`.
  - Pattern: `src/pdfParser.ts` `embedPageBackground` currently accepts PNG/JPEG data URLs.
  - Guardrail: Metis directive prefers pure JS dependencies like `pngjs`/`upng-js` before native options.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Converted image sources start with `data:image/` and contain base64 payload.
  - [ ] Pure JS conversion path is covered by tests for at least RGBA and one non-RGBA fallback or warning.
  - [ ] `package.json` does not contain `canvas` or `sharp` unless an explicit documented blocker required escalation.
  - [ ] `yarn check:types` exits `0` for the conversion helper types.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: RGBA image converts to data URL
    Tool: Bash
    Steps: Run targeted Jest test that passes a small RGBA image object into the conversion helper.
    Expected: Output `src` starts with `data:image/png;base64,` and includes non-empty payload.
    Evidence: .sisyphus/evidence/task-5-rgba-data-url.txt

  Scenario: Native dependency guard holds
    Tool: Bash
    Steps: Run `node -e "const p=require('./package.json'); const all={...p.dependencies,...p.devDependencies}; if(all.canvas||all.sharp) process.exit(1)"`.
    Expected: Command exits 0.
    Evidence: .sisyphus/evidence/task-5-no-native-deps.txt
  ```

  **Commit**: NO | Message: `feat(pdf): encode extracted images as data urls` | Files: `src/pdfParser.ts`, `package.json`, lockfile, tests if pure JS dependency added

- [x] 6. Produce mixed `IntermediatePage.content` during encode

  **What to do**: Update `buildIntermediatePage` in `src/pdfParser.ts` to combine mapped `IntermediateText` instances and extracted `IntermediateImage` instances into ordered `IntermediateContent[]`. Text items must include `opacity` defaulting to `1` when appropriate. Images must include stable IDs, `src`, polygon, opacity, and clip data if the real 0.8.0 contract supports it. Preserve existing outline and page map behavior.
  **Must NOT do**: Do not append all images after all text if operator/content order can be determined. Do not regress text extraction fields or outline mapping.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: core encode behavior and ordering semantics.
  - Skills: [] - No specialized skill required.
  - Omitted: [`playwright`] - Tests are Jest/package-level.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Tasks 7, 8, 10, 11, 12, 13 | Blocked By: Tasks 3, 4, 5

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts` `buildIntermediatePage` currently constructs `new IntermediatePage({ id, number, width, height, texts, thumbnail: undefined })`.
  - Pattern: `src/pdfParser.ts` `mapTextContentToIntermediate` currently returns `IntermediateText[]`.
  - API/Type: `@hamster-note/types@0.8.0` `IntermediatePage` constructor contract.
  - Test: `src/__tests__/pdfParserIntegration.test.ts` should prove encode result content includes text and image entries.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Encoded page objects use `content`, not `texts`.
  - [ ] A test fixture PDF with text and image yields `page.getContent()` containing at least one `IntermediateText` and one `IntermediateImage`.
  - [ ] Each image entry has `src` beginning with `data:image/`, a four-point polygon, stable ID, and page association.
  - [ ] `yarn test --runTestsByPath src/__tests__/pdfParserIntegration.test.ts` exits `0`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Text plus image content is emitted
    Tool: Bash
    Steps: Run `yarn test --runTestsByPath src/__tests__/pdfParserIntegration.test.ts` with the new/updated text+image fixture test.
    Expected: Test exits 0 and asserts `getContent()` includes both text-like and image-like entries.
    Evidence: .sisyphus/evidence/task-6-mixed-content-encode.txt

  Scenario: No-image PDFs remain text-compatible
    Tool: Bash
    Steps: Run the integration test case for existing `test_github.pdf` or a no-image fixture.
    Expected: Test exits 0; content contains text entries and no image extraction crash/warning failure.
    Evidence: .sisyphus/evidence/task-6-no-image-pdf.txt
  ```

  **Commit**: NO | Message: `feat(pdf): emit mixed intermediate content` | Files: `src/pdfParser.ts`, `src/__tests__/pdfParserIntegration.test.ts`, fixtures

- [x] 7. Decode mixed content in original order with pdf-lib

  **What to do**: Replace text-only decode planning with content-order rendering. Build a render plan from `IntermediatePage.content`/`getContent()` that preserves array order and dispatches each item to text or image drawing. Reuse existing text rendering helpers for text entries. Add image drawing helpers that embed PNG/JPEG data URLs through pdf-lib and place them using `IntermediateImage.polygon` bounds and opacity where pdf-lib supports it. Preserve thumbnail-background fallback only for page background/cover semantics, not as a substitute for content images.
  **Must NOT do**: Do not draw all images first and all text later. Do not discard unsupported image entries silently; log/record deterministic warning evidence.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: core decode correctness, coordinate conversion, and layering.
  - Skills: [] - No specialized skill required.
  - Omitted: [`frontend-ui-ux`] - PDF output behavior, not UI.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Tasks 10, 11, 12, 13 | Blocked By: Tasks 3, 5, 6

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts` `decode` currently creates `PdfPagePlan` with `texts: RenderableText[]` and optional `background`.
  - Pattern: `src/pdfParser.ts` `buildRenderableTexts`, `drawTextToPdfPage`, `resolveRenderableTextMetrics`, `embedPageBackground`.
  - API/Type: pdf-lib image embedding supports PNG/JPEG data URLs/bytes; use existing `embedPageBackground` style for format branching.
  - API/Type: `@hamster-note/types@0.8.0` `IntermediateImage.polygon`, `opacity`, `clip` if present.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Decode path obtains content through `getContent()`/`content`, not text-only APIs.
  - [ ] Decode renders mixed content according to content array order.
  - [ ] PNG/JPEG `IntermediateImage.src` entries are embedded into output PDF without throwing.
  - [ ] `IntermediateText.opacity` is respected or explicitly defaulted in text drawing tests.
  - [ ] `yarn test --runTestsByPath src/__tests__/pdfParserIntegration.test.ts` exits `0`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Decode mixed content without crashing
    Tool: Bash
    Steps: Run integration test that constructs an `IntermediateDocument` page with ordered text/image/text content and calls `decode`.
    Expected: Test exits 0; produced PDF bytes are non-empty and no unsupported image warning occurs for PNG/JPEG data URL.
    Evidence: .sisyphus/evidence/task-7-decode-mixed-content.txt

  Scenario: Unsupported image source fails soft
    Tool: Bash
    Steps: Run integration test with an unsupported image `src` format.
    Expected: Decode does not throw; warning is captured or output remains valid with skipped unsupported image.
    Evidence: .sisyphus/evidence/task-7-unsupported-image-src.txt
  ```

  **Commit**: NO | Message: `feat(pdf): decode ordered image content` | Files: `src/pdfParser.ts`, `src/__tests__/pdfParserIntegration.test.ts`

- [x] 8. Align thumbnail and cover semantics with 0.8.0 `IntermediateImage`

  **What to do**: Update `renderThumbnail`, page thumbnail lazy loaders, and document cover handling so `getThumbnail()` and `getCover()` return `IntermediateImage | undefined` as defined by 0.8.0. Use full-page rendered thumbnail/cover screenshots as `IntermediateImage.src` with page-size polygon, not arbitrary extracted first image. Ensure existing background decode behavior consumes the new object format.
  **Must NOT do**: Do not treat thumbnail/cover as equivalent to extracted content images. Do not leave code paths expecting raw string thumbnails.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: contained API shape update once image helpers exist.
  - Skills: [] - No specialized skill required.
  - Omitted: [`visual-engineering`] - No UI aesthetics.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Tasks 9, 10, 11, 13 | Blocked By: Tasks 2, 5, 6

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts` `renderThumbnail` currently returns `canvas.toDataURL('image/png')`.
  - Pattern: `src/pdfParser.ts` `resolvePageBackground` currently expects `page.getThumbnail()` string.
  - Pattern: `demo/demoDocumentSerialization.js` `resolveCoverAvailable` currently checks `getCover(0.25)` string-like value.
  - API/Type: `@hamster-note/types@0.8.0` thumbnail/cover return contract.

  **Acceptance Criteria** (agent-executable only):
  - [ ] No active source/test code assumes `getThumbnail()` or `getCover()` returns raw `string`.
  - [ ] Thumbnail and cover `IntermediateImage.src` starts with `data:image/png;base64,` for rendered page previews.
  - [ ] Decode background handling accepts `IntermediateImage` thumbnail objects.
  - [ ] Relevant integration tests for thumbnail decode pass.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Thumbnail returns IntermediateImage
    Tool: Bash
    Steps: Run integration test that calls `page.getThumbnail()` after encode.
    Expected: Returned value is an object with image-like `src`, polygon, opacity, and stable id; not a raw string.
    Evidence: .sisyphus/evidence/task-8-thumbnail-intermediate-image.txt

  Scenario: Cover availability still serializes
    Tool: Bash
    Steps: Run demo serialization test covering `intermediate.getCover(0.25)`.
    Expected: Test exits 0 and cover availability is derived from `IntermediateImage` object.
    Evidence: .sisyphus/evidence/task-8-cover-serialization.txt
  ```

  **Commit**: NO | Message: `refactor(types): return image objects for thumbnails` | Files: `src/pdfParser.ts`, `demo/demoDocumentSerialization.js`, tests

- [x] 9. Update demo progressive serialization for content and image summaries

  **What to do**: Update `demo/demoDocumentSerialization.js` to call `page.getContent()` instead of `getTexts()`, summarize text and image entries separately, preserve existing page summary fields where possible, add `imageCount` and content/cover diagnostics if needed, and ensure `demo/demo.js` consumers remain stable. Update demo tests to use `content` arrays and `IntermediateImage` thumbnail/cover objects.
  **Must NOT do**: Do not redesign demo UI. Do not change `demo/demo.css`, `demo/demoPreview.js`, or HTML files unless a failing test proves a serializer field change requires it.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused demo serializer/test migration.
  - Skills: [] - No specialized skill required.
  - Omitted: [`frontend-ui-ux`] - No visual changes requested.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Tasks 10, 11, 13 | Blocked By: Tasks 3, 8

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `demo/demoDocumentSerialization.js` `createProgressiveSerializer`, `buildPageSummary`, `resolveCoverAvailable`.
  - Pattern: `demo/demo.js` `handleEncode` and `renderSummary` consume serializer snapshots.
  - Test: `demo/__tests__/demoDocumentSerialization.test.ts` has factories using pages/texts and thumbnail strings.
  - Test: `demo/__tests__/demo.test.ts` snapshots include `textCount` and preview text structures.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Demo serializer uses `getContent()` and computes text/image counts from `IntermediateContent[]`.
  - [ ] Existing text summary behavior remains for text entries.
  - [ ] Image entries do not break JSON serialization.
  - [ ] `yarn test --runTestsByPath demo/__tests__/demoDocumentSerialization.test.ts demo/__tests__/demo.test.ts` exits `0`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Demo serializer handles mixed content
    Tool: Bash
    Steps: Run `yarn test --runTestsByPath demo/__tests__/demoDocumentSerialization.test.ts`.
    Expected: Jest exits 0; tests assert text count and image count for mixed content page.
    Evidence: .sisyphus/evidence/task-9-demo-serializer.txt

  Scenario: Demo UI tests remain stable
    Tool: Bash
    Steps: Run `yarn test --runTestsByPath demo/__tests__/demo.test.ts`.
    Expected: Jest exits 0 and output contains `PASS`.
    Evidence: .sisyphus/evidence/task-9-demo-ui.txt
  ```

  **Commit**: NO | Message: `test(demo): serialize intermediate image content` | Files: `demo/demoDocumentSerialization.js`, `demo/demo.js`, `demo/__tests__/*.test.ts`

- [x] 10. Expand fixtures and tests for image/content edge cases

  **What to do**: Add or update minimal PDF fixtures and Jest cases that cover: no-image PDF, common text+image PDF, inline image if fixture generation is feasible without native dependencies, unsupported transparency/mask fallback, lazy `getContent()` idempotency, serialization/parse round-trip of `IntermediateImage`, and decode of mixed ordered content. Prefer deterministic generated fixtures or small checked-in fixtures; if fixture generation requires tooling, keep it pure JS and documented.
  **Must NOT do**: Do not assert brittle pixel-perfect rendering. Do not require manual opening of PDFs. Do not add huge binary fixtures.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: broad test coverage and fixture strategy across encode/decode/demo.
  - Skills: [] - No specialized skill required.
  - Omitted: [`playwright`] - Verification is file/Jest/package based, not browser UI.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Tasks 11, 12, 13 | Blocked By: Tasks 6, 7, 8, 9

  **References** (executor has NO interview context - be exhaustive):
  - Test: `src/__tests__/pdfParserIntegration.test.ts` - existing integration coverage for type serialization round-trip, thumbnail/background behavior, encode/decode progress.
  - Test: `demo/__tests__/demoDocumentSerialization.test.ts` - demo serialization coverage.
  - Fixture: `src/__tests__/test_github.pdf` - existing real PDF fixture.
  - Pattern: `scripts/verify-roundtrip.mjs` - round-trip regression thresholds should remain stable.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Tests assert `page.getContent()` returns both `IntermediateText` and `IntermediateImage` for at least one fixture.
  - [ ] Tests assert image entries have `type === "image"` or the real 0.8.0 discriminant, `src` starting with `data:image/`, four-point polygon, and valid opacity.
  - [ ] Tests cover no-image PDF with no extraction crash.
  - [ ] Tests cover lazy `getContent()` idempotency by calling it twice and comparing stable serialized content.
  - [ ] Tests cover unsupported mask/pattern/transparency fallback warning without thrown error.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Mixed content fixture proves 0.8.0 image path
    Tool: Bash
    Steps: Run `yarn test --runTestsByPath src/__tests__/pdfParserIntegration.test.ts`.
    Expected: Jest exits 0; output includes PASS and assertions verify text+image content fields.
    Evidence: .sisyphus/evidence/task-10-mixed-fixture.txt

  Scenario: Lazy content loading is idempotent
    Tool: Bash
    Steps: Run targeted test that calls `page.getContent()` twice after serialization/parse.
    Expected: Both calls resolve equal content length and stable serialized image/text fields.
    Evidence: .sisyphus/evidence/task-10-lazy-content-idempotent.txt
  ```

  **Commit**: NO | Message: `test(pdf): cover intermediate image content` | Files: `src/__tests__/*`, fixtures, `demo/__tests__/*`

- [x] 11. Integrate verification scripts and package-level checks

  **What to do**: Wire `check:types` into developer verification expectations and ensure existing scripts still work after content/image migration. Run and, if needed, minimally adjust `scripts/verify-roundtrip.mjs`, `scripts/smoke-test.mjs`, package exports, and Vite fixture verification so they validate the 0.8.0 behavior without changing unrelated package semantics.
  **Must NOT do**: Do not relax existing round-trip thresholds unless a failing assertion is proven to be a false regression from expected 0.8.0 structure and the new threshold remains explicit.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: validation script/package integration after implementation.
  - Skills: [] - No specialized skill required.
  - Omitted: [`git-master`] - No commit requested.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Task 13 | Blocked By: Tasks 6, 7, 8, 9, 10

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `scripts/verify-roundtrip.mjs` - token retention, text length ratio, page size delta, keyword checks.
  - Pattern: `scripts/smoke-test.mjs` - package entry-point smoke test.
  - Pattern: `.github/workflows/ci-pr.yml` - CI order: lint → test → build → verify:package → npm pack dry-run.
  - Pattern: `demo/vite-fixture/package.json` - Vite fixture consumes local package.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `yarn check:types` exits `0`.
  - [ ] `yarn test` exits `0`.
  - [ ] `yarn lint` exits `0`.
  - [ ] `yarn build:all` exits `0`.
  - [ ] `yarn verify:package` exits `0`.
  - [ ] `yarn verify:vite` exits `0`.
  - [ ] `npm pack --dry-run` exits `0`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Fast type and unit verification passes
    Tool: Bash
    Steps: Run `yarn check:types && yarn test`.
    Expected: Both commands exit 0; type output has no `error TS` and Jest output contains PASS.
    Evidence: .sisyphus/evidence/task-11-type-and-test.txt

  Scenario: Package verification remains green
    Tool: Bash
    Steps: Run `yarn lint && yarn build:all && yarn verify:package && yarn verify:vite && npm pack --dry-run`.
    Expected: All commands exit 0.
    Evidence: .sisyphus/evidence/task-11-package-verification.txt
  ```

  **Commit**: NO | Message: `chore(test): verify types 0.8.0 package flow` | Files: `package.json`, scripts, CI/docs only if needed

- [x] 12. Harden unsupported image construct fallback behavior

  **What to do**: Convert all spike findings for complex image paths into deterministic behavior. For supported constructs, return `IntermediateImage` entries. For unsupported Form XObject/pattern/mask/SMask/repeat/bitmap edge cases, emit a structured warning with operator type/page/object id when available and continue processing remaining content. Ensure warning behavior is testable without relying on console-only side effects if existing project patterns provide reporter/progress hooks.
  **Must NOT do**: Do not throw for unsupported image constructs unless the entire PDF page cannot be read. Do not hide failures that should be warnings.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: robust error handling and edge-case behavior in core parser flow.
  - Skills: [] - No specialized skill required.
  - Omitted: [`oracle`] - Oracle already identified this risk during planning.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Task 13 | Blocked By: Tasks 4, 5, 6, 7, 10

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts` existing progress/reporter/error handling patterns in encode/decode.
  - API/Type: pdfjs `OPS` image-related constants: image mask, image/group, image XObject, inline image, repeat variants, solid color mask.
  - Guardrail: Unsupported complex constructs must be deterministic warnings, not crashes.
  - Test: `src/__tests__/pdfParserIntegration.test.ts` progress/reporter API tests.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Unsupported image constructs are represented as warnings with stable message/code fields or a stable captured warning string.
  - [ ] Encode continues after unsupported image construct and still returns valid `IntermediateDocument`.
  - [ ] Decode continues after unsupported image source and still returns valid PDF bytes.
  - [ ] Tests cover at least one unsupported extraction case and one unsupported decode source case.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Unsupported extraction warning is deterministic
    Tool: Bash
    Steps: Run targeted Jest test with mocked unsupported mask/pattern operator.
    Expected: Test exits 0; warning includes page number and operator/category, and encode returns document content for remaining items.
    Evidence: .sisyphus/evidence/task-12-extraction-warning.txt

  Scenario: Unsupported decode image source is skipped safely
    Tool: Bash
    Steps: Run targeted Jest test with `IntermediateImage.src` using unsupported scheme.
    Expected: Test exits 0; decode returns non-empty PDF bytes and warning is captured.
    Evidence: .sisyphus/evidence/task-12-decode-warning.txt
  ```

  **Commit**: NO | Message: `fix(pdf): harden unsupported image fallbacks` | Files: `src/pdfParser.ts`, tests

- [x] 13. Final migration sweep and evidence consolidation

  **What to do**: Perform final repository-wide checks for stale 0.7.0 API names, stale dependency ranges, accidental native dependencies, unrelated file changes, and missing evidence artifacts. Run the complete verification command set and save concise outputs to `.sisyphus/evidence/`. Update any implementation notes/comments needed for future maintainers, but do not add unrelated docs.
  **Must NOT do**: Do not broaden scope to unrelated refactors. Do not mark work complete until Final Verification Wave agents approve and user explicitly says okay.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: broad final QA across dependencies, source, tests, package scripts, and evidence.
  - Skills: [] - No specialized skill required.
  - Omitted: [`git-master`] - Commit/PR is outside task execution unless user requests it.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final Verification Wave | Blocked By: Tasks 10, 11, 12

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `package.json` - dependency/script source of truth.
  - Pattern: `src/pdfParser.ts` - primary implementation surface.
  - Pattern: `src/__mocks__/@hamster-note/types.ts` - mock must match 0.8.0.
  - Pattern: `src/__tests__/`, `demo/__tests__/` - verification surface.
  - Pattern: `.github/workflows/ci-pr.yml` - CI-aligned command sequence.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `rg "@hamster-note/types.*0\.7|\^0\.7\.0|getTexts|setGetTexts|hasLoadedTexts|\.texts" package.json yarn.lock package-lock.json src demo` returns no active stale matches except intentionally documented historical artifacts.
  - [ ] `node -e "const p=require('./package.json'); const all={...p.dependencies,...p.devDependencies}; if(all.canvas||all.sharp) process.exit(1)"` exits `0`.
  - [ ] All evidence files for Tasks 1-13 exist under `.sisyphus/evidence/`.
  - [ ] Full validation command sequence exits `0`.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Stale API and dependency sweep is clean
    Tool: Bash
    Steps: Run stale grep command from acceptance criteria and native dependency guard.
    Expected: No stale active matches; native dependency guard exits 0.
    Evidence: .sisyphus/evidence/task-13-final-sweep.txt

  Scenario: Complete verification command sequence passes
    Tool: Bash
    Steps: Run `yarn check:types && yarn test && yarn lint && yarn build:all && yarn verify:package && yarn verify:vite && npm pack --dry-run`.
    Expected: All commands exit 0.
    Evidence: .sisyphus/evidence/task-13-full-verification.txt
  ```

  **Commit**: NO | Message: `feat(types): complete hamster note types 0.8.0 migration` | Files: all intended migration/test/package files

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Use one focused commit after all verification passes.
- Suggested message: `feat(types): upgrade hamster note types to 0.8.0`
- Commit only intended files: dependency manifests/lockfile, `src/pdfParser.ts`, type mock, tests/fixtures, demo serialization/tests, and validation script updates.

## Success Criteria
- Installed and compiled project uses `@hamster-note/types@0.8.0` only; no stale `^0.7.0` dependency/override remains.
- Mixed `IntermediateContent` is produced, serialized, parsed, decoded, and tested.
- Image content extraction attempts comprehensive pdfjs paths within bounded gates and degrades safely for unsupported constructs.
- Existing text, outline, roundtrip, smoke, package, and Vite verification remain green.
