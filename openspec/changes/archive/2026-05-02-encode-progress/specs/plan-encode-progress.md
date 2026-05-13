# Encode Progress for API and Demo

## TL;DR
> **Summary**: Add `encode` progress reporting that mirrors the existing `decode` call shape, then surface that progress in the demo without changing current non-progress callers.
> **Deliverables**:
> - `PdfParser.encode(input, options?, onProgress?)` public API
> - Exported `EncodeProgressEvent` and `EncodeProgressReporter` types
> - Demo encode progress text and state updates
> - Jest coverage for progress sequence and backward compatibility
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 → Task 4 → Task 5

## Context
### Original Request
- 给 `encode` 也加上进度
- 函数参数格式跟 `decode` 相同
- demo 中也加上进度显示

### Interview Summary
- Existing `decode` already uses the three-argument shape `(document, options?, onProgress?)` in `src/pdfParser.ts:184`.
- Existing `encode` only accepts `(fileOrBuffer, options?)` in `src/pdfParser.ts:138`.
- Demo already has decode progress formatting and UI state transitions in `demo/demo.js:192` and `demo/demo.js:406`.
- Test strategy is **tests-after** using the existing Jest setup in `jest.config.js:1` and `package.json:7`.

### Metis Review (gaps addressed)
- Fix the progress contract up front: use `encode:start`, `encode:page`, `encode:complete` with the same payload shape as decode (`stage`, `current`, `total`, optional `message`).
- Preserve backwards compatibility: existing `PdfParser.encode(arrayBuffer)` and `PdfParser.encode(arrayBuffer, options)` must continue to work unchanged.
- Keep callback semantics aligned with decode: invoke the reporter directly and do not introduce callback swallowing, wrapping, or callback-in-options overloads.
- Restrict scope to API, progress emission, tests, and demo display; no cancellation, no shared abstraction rewrite, no decode refactor.

## Work Objectives
### Core Objective
- Make `encode` expose deterministic page-level progress using the same third-argument reporter pattern as `decode`, then show that progress in the browser demo.

### Deliverables
- New exported progress types for encode.
- Updated `PdfParser.encode` signature and implementation.
- Updated demo encode progress formatter and state wiring.
- Updated Jest tests for contract, sequence, and compatibility.

### Definition of Done (verifiable conditions with commands)
- `lsp_diagnostics` on changed files reports no unresolved errors.
- `npm test` passes with new encode-progress assertions.
- `npm run lint` passes with the API and demo changes.
- `npm run verify:vite` passes so the demo fixture still builds.
- Agent-executed browser QA confirms encode progress text advances from start → page(s) → complete.

### Must Have
- `encode` accepts `(fileOrBuffer, options?, onProgress?)`.
- `EncodeProgressEvent` matches decode payload structure and uses encode-specific stages.
- `src/index.ts` exports the new encode progress types.
- Demo encode path clears stale state, shows progress while encoding, and ends in success or failure text.
- Existing no-callback callers remain valid.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT change encode return type or output shape.
- Must NOT move the progress callback into `EncodeOptions`.
- Must NOT refactor unrelated decode logic or demo architecture.
- Must NOT add cancellation, worker progress, or byte-level progress.
- Must NOT break existing `PdfParser.encode(input)` or `PdfParser.encode(input, options)` call sites.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: **tests-after** using Jest from `jest.config.js:1`.
- QA policy: Every implementation task includes targeted QA scenarios and artifact paths.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 2-8 tasks per wave for this medium-scope plan.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: API contract and demo helper definitions
Wave 2: Core encode instrumentation, contract/integration tests, demo UI wiring

### Dependency Matrix (full, all tasks)
- Task 1 blocks Task 4 and Task 6.
- Task 2 blocks Task 5.
- Task 3 depends on Task 4 because it validates the new runtime contract.
- Task 4 depends on Task 1.
- Task 5 depends on Task 2 and the Task 4 contract.
- Task 6 depends on Tasks 1 and 4.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 2 tasks → `quick`, `quick`
- Wave 2 → 4 tasks → `quick`, `quick`, `visual-engineering`, `quick`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Define encode progress API contract

  **What to do**: Add `EncodeProgressEvent` and `EncodeProgressReporter` beside the existing decode progress types in `src/pdfParser.ts`; use stages `'encode:start' | 'encode:page' | 'encode:complete'` and the same payload shape as decode (`stage`, `current`, `total`, optional `message`). Export both from `src/index.ts` and update any public type surfaces that need to expose the new contract.
  **Must NOT do**: Must NOT rename or reshape decode progress types; must NOT put the reporter into `EncodeOptions`; must NOT change the `EncodeOptions` fields themselves.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small, localized TypeScript API contract changes.
  - Skills: `[]` - No special workflow is needed.
  - Omitted: `review-work` - Final verification wave already covers review.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 6] | Blocked By: []

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts:79` - Existing decode progress event shape to mirror exactly.
  - Pattern: `src/pdfParser.ts:86` - Existing decode reporter alias naming pattern.
  - Pattern: `src/index.ts:6` - Public type export block that must include encode progress types.
  - API/Type: `src/pdfParser.ts:74` - Existing `EncodeOptions` location; keep options and reporter separate.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `src/pdfParser.ts` declares `EncodeProgressEvent` and `EncodeProgressReporter` with encode-specific stages and decode-parity payload fields.
  - [ ] `src/index.ts` exports both new encode progress types without removing existing exports.
  - [ ] TypeScript imports used by tests/build remain valid after the export change.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Public type exports compile
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/encodeSafeguards.test.ts`
    Expected: Jest resolves `@PdfParser` exports without module/type errors.
    Evidence: .sisyphus/evidence/task-1-encode-progress-api.txt

  Scenario: Existing decode exports remain intact
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/pdfParserIntegration.test.ts`
    Expected: Existing integration imports still compile and execute.
    Evidence: .sisyphus/evidence/task-1-encode-progress-api-regression.txt
  ```

  **Commit**: NO | Message: `feat(pdf-parser): add encode progress types` | Files: [`src/pdfParser.ts`, `src/index.ts`]

- [x] 2. Add demo encode progress formatting helpers

  **What to do**: Introduce encode-side progress text/state helper(s) in `demo/demo.js` that mirror the decode UX pattern from `formatDecodeProgressText`, but with fixed encode strings. Derive `pageLabel` exactly as `total === 1 ? 'page' : 'pages'`. Use these exact outputs: for `encode:start`, `Encoding started. Preparing ${total} ${pageLabel}...` when `total > 0`, otherwise `Encoding started.`; for `encode:page`, `Encoding page ${Math.min(current, total)} of ${total}...` when `total > 0`, otherwise `Encoding PDF pages...`; for `encode:complete`, `Encoding complete. Processed ${total} ${pageLabel}.` when `total > 0`, otherwise `Encoding complete.`. Define the note string to report `Processed ${current} / ${total} ${pageLabel} so far.` during page events and the exact finalizing message `Finalizing the restored PDF preview...` immediately before the ready state.
  **Must NOT do**: Must NOT rewrite decode helpers; must NOT redesign the demo state model; must NOT add new UI containers unless the existing status/decode state areas are truly insufficient.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small helper-only UI text/state additions.
  - Skills: [] - Existing demo patterns are sufficient.
  - Omitted: `frontend-ui-ux` - This is a consistency update, not a redesign.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5] | Blocked By: []

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `demo/demo.js:192` - `formatDecodeProgressText` provides the exact stage-to-text mapping style to mirror.
  - Pattern: `demo/demo.js:344` - Existing encode reset state before work starts.
  - Pattern: `demo/demo.js:426` - Existing decode loading state shape (`name`, `statusText`, `previewMessage`, `note`).
  - Pattern: `demo/demo.js:457` - Decode progress callback updates UI state incrementally.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `demo/demo.js` contains encode-specific formatter/helper logic for `encode:start`, `encode:page`, and `encode:complete`.
  - [ ] Helper output strings exactly match the plan-defined strings and are usable by `handleEncode` without touching decode-specific helpers.
  - [ ] Encode helper logic preserves current demo state object shape.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Demo helper code remains buildable
    Tool: Bash
    Steps: Run `npm run verify:vite`
    Expected: The demo Vite fixture builds without syntax errors in `demo/demo.js`.
    Evidence: .sisyphus/evidence/task-2-encode-demo-helpers.txt

  Scenario: Decode helper remains untouched functionally
    Tool: Bash
    Steps: Run `npm run lint`
    Expected: Lint passes with both decode and new encode helper logic present.
    Evidence: .sisyphus/evidence/task-2-encode-demo-helpers-regression.txt
  ```

  **Commit**: NO | Message: `feat(demo): add encode progress helpers` | Files: [`demo/demo.js`]

- [x] 3. Add encode contract regression tests

  **What to do**: Extend the Jest suite to lock in the new encode call shape and compatibility rules. Add tests that verify `PdfParser.encode(input)` still works, `PdfParser.encode(input, options)` still works, and `PdfParser.encode(input, reporter)` is rejected with the exact TypeError message `PdfParser.encode() no longer accepts a progress function as the second argument. Use PdfParser.encode(input, options, reporter) instead.`. In the invalid-second-argument test, pass the reporter through a runtime cast such as `as any` so the rejection is verified at runtime rather than blocked by TypeScript. Also assert that a reporter-thrown exception bubbles to the caller unchanged.
  **Must NOT do**: Must NOT weaken existing safeguard assertions; must NOT create new test infrastructure; must NOT rely on browser-only demo behavior.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: localized Jest additions around existing encode safeguards.
  - Skills: [] - Existing test patterns are sufficient.
  - Omitted: `playwright` - This task is API contract coverage, not UI testing.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [4]

  **References** (executor has NO interview context - be exhaustive):
  - Test: `src/__tests__/encodeSafeguards.test.ts:8` - Existing focused encode behavior tests.
  - Test: `src/__tests__/pdfParserIntegration.test.ts:117` - Existing integration-level encode coverage and fixture setup.
  - Pattern: `src/pdfParser.ts:189` - Decode's current second-argument function rejection pattern to mirror for encode.
  - API/Type: `package.json:7` - Jest command used for targeted test runs.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Jest includes encode signature-compatibility coverage for `PdfParser.encode(input)`, `PdfParser.encode(input, options)`, and invalid second-argument reporter usage.
  - [ ] The invalid second-argument case asserts a deterministic TypeError message that points callers to the third argument.
  - [ ] Existing encode safeguard tests remain green after the additions.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Encode contract tests pass
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/encodeSafeguards.test.ts`
    Expected: New encode contract assertions pass alongside existing safeguard tests.
    Evidence: .sisyphus/evidence/task-3-encode-contract-tests.txt

  Scenario: Integration entrypoints still compile
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/pdfParserIntegration.test.ts`
    Expected: Integration test file still imports and executes with the updated API surface.
    Evidence: .sisyphus/evidence/task-3-encode-contract-tests-regression.txt
  ```

  **Commit**: NO | Message: `test(pdf-parser): cover encode progress contract` | Files: [`src/__tests__/encodeSafeguards.test.ts`, `src/__tests__/pdfParserIntegration.test.ts`]

- [x] 4. Instrument encode lifecycle progress emission

  **What to do**: Update `PdfParser.encode` in `src/pdfParser.ts` to accept `onProgress?: EncodeProgressReporter` as the third argument, reject a function passed as the second argument with a decode-style TypeError, emit `encode:start` after page count is known, emit `encode:page` once per processed page in deterministic order, and emit `encode:complete` after the `IntermediateDocument` is fully assembled. Use `Math.min(pdf.numPages, resolvedOptions.maxPages)` as the `total`, and keep current return/error behavior unchanged. Ensure page cleanup still runs even if the reporter throws by placing `page.cleanup?.()` before the reporter call or in a `finally` path that is guaranteed to execute first.
  **Must NOT do**: Must NOT change the encode return type; must NOT emit decode-prefixed stages; must NOT swallow callback exceptions; must NOT emit progress before `pdf` and effective total pages are known.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: localized parser implementation changes with tight acceptance criteria.
  - Skills: [] - No special workflow is needed.
  - Omitted: `git-master` - No git action is needed during implementation.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [5, 6] | Blocked By: [1]

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts:138` - Existing encode method signature and flow entry point.
  - Pattern: `src/pdfParser.ts:158` - Effective encode options are resolved here; use the resulting page cap for progress totals.
  - Pattern: `src/pdfParser.ts:184` - Decode signature and progress callback lifecycle to mirror.
  - Pattern: `src/pdfParser.ts:772` - `buildPageInfoList` iterates pages deterministically; use this loop or a closely adjacent location for page progress accounting.
  - Pattern: `src/pdfParser.ts:834` - Lazy page data extraction occurs later; do not misreport page processing semantics.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `PdfParser.encode(input, options, reporter)` is a valid call shape.
  - [ ] `PdfParser.encode(input, reporterAsSecondArg)` throws a clear TypeError instructing the third-argument usage.
  - [ ] Reporter receives `encode:start`, ordered `encode:page` events, then `encode:complete` with stable `current/total` counts.
  - [ ] If the reporter itself throws, that exception propagates to the caller instead of being swallowed.
  - [ ] Existing no-reporter encode behavior and returned `IntermediateDocument` remain unchanged.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Encode progress sequence is deterministic
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/encodeSafeguards.test.ts src/__tests__/pdfParserIntegration.test.ts`
    Expected: Tests confirm ordered `encode:start` → `encode:page`* → `encode:complete` events with correct totals, and confirm reporter-thrown exceptions are not swallowed.
    Evidence: .sisyphus/evidence/task-4-encode-progress-sequence.txt

  Scenario: Existing encode result remains valid without reporter
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/pdfParserIntegration.test.ts`
    Expected: Existing integration assertions on returned `IntermediateDocument` still pass.
    Evidence: .sisyphus/evidence/task-4-encode-progress-sequence-regression.txt
  ```

  **Commit**: NO | Message: `feat(pdf-parser): emit encode progress events` | Files: [`src/pdfParser.ts`]

- [x] 5. Wire encode progress into the demo flow

  **What to do**: Update `handleEncode` in `demo/demo.js` to pass the third-argument encode reporter into `PdfParser.encode`, map each event through the new encode formatter/helper, and keep state resets aligned with the existing context-id invalidation logic. On start, clear stale decode preview state exactly as today; while encoding, update only the top-level encode status region (`[data-role="status"]`) and existing preview-note messaging per progress event; leave decode-specific status text owned by decode-state/reset logic; on completion, end with the existing success state; on failure, restore the existing error pathway without leaving stale encode-progress text behind.
  **Must NOT do**: Must NOT interfere with `handleDecode`; must NOT re-enable decode before encode success; must NOT leak progress updates from stale encode contexts after a newer encode starts.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI state consistency matters more than algorithmic complexity.
  - Skills: [] - Existing demo patterns are sufficient.
  - Omitted: `playwright` - Implementation task only; QA is specified below and in the final wave.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [2, 4]

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `demo/demo.js:334` - `handleEncode` current control flow and context-id invalidation logic.
  - Pattern: `demo/demo.js:352` - Current encode status lifecycle starting point.
  - Pattern: `demo/demo.js:359` - Current `PdfParser.encode(arrayBuffer)` call site that must become the three-argument form.
  - Pattern: `demo/demo.js:406` - `handleDecode` shows the exact callback wiring pattern to mirror.
  - Pattern: `demo/demo.js:446` - Decode chooses stage-sensitive preview messaging; encode should use the same style.
  - Pattern: `demo/encode.html:28` - `#demo-load-sample` is the stable trigger for loading the fixture PDF.
  - Pattern: `demo/encode.html:40` - `[data-role="status"]` is the live encode status region.
  - Pattern: `demo/encode.html:58` - `#encode-button` remains the stable encode action selector.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `handleEncode` passes a third-argument reporter into `PdfParser.encode`.
  - [ ] Demo status text changes during encode start, page progress, and completion.
  - [ ] The demo may end on the existing `Encode ready` success text, but the transient `Encoding complete...` status must appear in the captured status history before that final ready state.
  - [ ] Context-id guards prevent stale progress updates from older encode runs.
  - [ ] Existing success/failure decode enablement behavior remains intact.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Demo build accepts encode progress wiring
    Tool: Bash
    Steps: Run `npm run verify:vite`
    Expected: Demo fixture builds successfully with the updated encode handler.
    Evidence: .sisyphus/evidence/task-5-demo-encode-progress.txt

  Scenario: Encode progress is visible in the browser demo
    Tool: Playwright
    Steps: Start `npm run dev`, open `http://127.0.0.1:5577/demo/encode.html`, click `#demo-load-sample`, wait for `#encode-button` to become enabled, register a `MutationObserver` on `[data-role="status"]` that pushes each mutation record's resulting `textContent` into an array immediately, click `#encode-button`, and wait until the final ready state is rendered.
    Expected: The captured status history contains an encode-start string, at least one page-progress string, the transient `Encoding complete...` string, and then the final ready string in that order, without stale text from older encode runs.
    Evidence: .sisyphus/evidence/task-5-demo-encode-progress-browser.txt
  ```

  **Commit**: NO | Message: `feat(demo): surface encode progress` | Files: [`demo/demo.js`]

- [x] 6. Extend integration coverage for encode progress behavior

  **What to do**: Add or extend integration-oriented Jest coverage so encode progress is asserted against a real multi-page fixture. Capture the emitted event list when encoding `test_github.pdf`, verify `start.total === pageCount`, verify page events increment from `1..N`, and verify `complete.current === complete.total === N`. Also cover a capped `maxPages` case so totals reflect the effective limit rather than the original PDF size.
  **Must NOT do**: Must NOT convert the suite into browser tests; must NOT depend on demo DOM state; must NOT loosen existing content assertions in the integration suite.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: this is targeted Jest integration coverage using existing fixtures.
  - Skills: [] - Existing test patterns are sufficient.
  - Omitted: `oracle` - This is concrete regression coverage, not architecture review.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [1, 3, 4]

  **References** (executor has NO interview context - be exhaustive):
  - Test: `src/__tests__/pdfParserIntegration.test.ts:117` - Existing real-PDF integration setup and reusable fixture loading.
  - Test: `src/__tests__/encodeSafeguards.test.ts:25` - Existing `maxPages` behavior expectations that should inform capped-total assertions.
  - Pattern: `src/pdfParser.ts:158` - Resolved encode options determine the effective total pages.
  - Command: `package.json:7` - Main Jest command.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Integration coverage records and asserts the full encode progress event sequence for the real multi-page fixture.
  - [ ] At least one assertion verifies `maxPages` changes the reported total.
  - [ ] Existing integration assertions on content/page structure remain green.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Real fixture encode progress is covered
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/pdfParserIntegration.test.ts`
    Expected: The integration suite verifies encode progress order and totals against `test_github.pdf`.
    Evidence: .sisyphus/evidence/task-6-encode-progress-integration.txt

  Scenario: Targeted encode suites remain mutually green
    Tool: Bash
    Steps: Run `npm test -- --runTestsByPath src/__tests__/encodeSafeguards.test.ts src/__tests__/pdfParserIntegration.test.ts`
    Expected: Safeguard and integration coverage both pass together.
    Evidence: .sisyphus/evidence/task-6-encode-progress-integration-regression.txt
  ```

  **Commit**: NO | Message: `test(pdf-parser): verify encode progress integration` | Files: [`src/__tests__/pdfParserIntegration.test.ts`, `src/__tests__/encodeSafeguards.test.ts`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high (includes `lsp_diagnostics` on changed files)
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI, and rerun `npm test`, `npm run lint`, `npm run verify:vite` after all task work)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit once after `npm test`, `npm run lint`, and `npm run verify:vite` all pass.
- Recommended message: `feat(pdf-parser): add encode progress reporting`

## Success Criteria
- Consumers can call `PdfParser.encode(input, options, reporter)` with encode progress events.
- Existing encode callers without a reporter continue to work.
- Demo visibly reports encode progress and completion/error states.
- Automated verification passes without introducing decode regressions.
