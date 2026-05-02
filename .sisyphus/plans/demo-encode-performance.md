# Demo Encode Performance Plan

## TL;DR
> **Summary**: Make the demo responsive immediately after `Encode` by decoupling JSON presentation from full page materialization, then reduce parser-side page scan latency without changing encode/decode semantics.
> **Deliverables**:
> - Progressive JSON output flow for the demo
> - Responsive `Encode` click path with cancellation-safe updates
> - Parser-side page-info collection optimization that keeps `getData` lazy
> - Automated regression coverage plus explicit demo verification steps
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2 → 3 → 4

## Context
### Original Request
User reports that the demo becomes very slow after clicking `Encode`. They observed `encode` should mostly return `getData` closures instead of eagerly resolved content, so the demo likely should not block this long. They want the demo to stop feeling stuck or overly slow after clicking `Encode`.

### Interview Summary
- Chosen UX: progressive JSON display after `Encode`
- Scope: `Demo+Parser`
- Test strategy: tests-after
- Default responsiveness target: immediate progress text and initial JSON shell, with no obvious long main-thread stall while page details continue loading asynchronously

### Metis Review (gaps addressed)
- Guardrails added to preserve final JSON semantics and avoid scope creep into workers, streaming parser APIs, or pdf.js internals
- Acceptance criteria include repeated clicks, large PDFs, page resolution failures, and final output equivalence
- Parser work is constrained to page-info collection and lazy page resolution behavior, not broad parser redesign

## Work Objectives
### Core Objective
Make the demo feel responsive on `Encode` by ensuring the click path quickly yields visible progress and partial JSON output, while preserving the final serialized document shape and improving parser-side page scanning where it directly affects wait time.

### Deliverables
- A progressive serializer for demo JSON output
- Incremental JSON rendering with throttled/yielding updates
- `handleEncode()` orchestration that starts rendering before all pages resolve and safely cancels stale runs
- Parser page-info collection optimization with stable ordering and lazy page data semantics
- Regression tests covering final JSON equivalence, lazy behavior, and repeated-click safety

### Definition of Done (verifiable conditions with commands)
- `npm test` passes
- `npm run lint` passes
- Automated demo/controller verification proves status/progress and an initial JSON shell appear before all pages finish resolving
- Final rendered JSON matches the prior serialized structure for equivalent input data

### Must Have
- Preserve `PdfParser.encode()` return type and external API
- Preserve final JSON field names and page ordering in demo output
- Keep stale encode runs from mutating current UI state after a newer click
- Keep parser page data lazy until explicitly requested by demo serialization

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT add worker-based architecture, streaming public APIs, or pdf.js internal patches
- Must NOT change decode behavior or unrelated preview behavior
- Must NOT replace the JSON viewer library unless required for incremental rendering compatibility
- Must NOT rely on manual-only validation

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after with `jest` + `eslint`
- QA policy: Every task includes agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: demo progressive serialization, JSON renderer incremental updates, encode flow orchestration
Wave 2: parser page-info optimization, regression coverage, cleanup/polish

### Dependency Matrix (full, all tasks)
- 1 blocks 2 and 3
- 2 blocks 3
- 3 blocks 5
- 4 blocks 5
- 5 blocks Final Verification Wave

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → `visual-engineering`, `quick`, `unspecified-low`
- Wave 2 → 2 tasks → `quick`, `unspecified-high`
- Final Verification → 4 tasks → `oracle`, `unspecified-high`, `deep`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Replace eager demo serialization with progressive snapshots

  **What to do**: Refactor `demo/demoDocumentSerialization.js` so it no longer returns only a single `await`-all object. Introduce a progressive serializer contract for the demo layer that returns an immediate shell (`id`, `title`, `pageCount`, `hasOutline`, `pageNumbers`, `coverAvailable` placeholder, `pages` placeholders) plus an async progression mechanism that resolves page summaries one page at a time in page order. Keep the final assembled JSON shape identical to the current `serializeIntermediate()` result. Reuse already resolved page summaries in memory so rerenders do not re-fetch page data.
  **Must NOT do**: Must NOT change `PdfParser.encode()` API, must NOT change final field names, and must NOT resolve all pages via one `Promise.all(...)` call.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused file-level refactor in demo serialization logic
  - Skills: `[]` - no extra skill required
  - Omitted: `review-work` - reserved for final verification, not implementation

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `demo/demoDocumentSerialization.js:19` - current eager `resolvePages()` implementation to replace
  - Pattern: `demo/demoDocumentSerialization.js:44` - current final JSON shape that must remain stable
  - API/Type: `src/pdfParser.ts:147` - `PdfParser.encode()` must continue returning `IntermediateDocument`
  - Test: `src/__tests__/pdfParserIntegration.test.ts:117` - integration-test style and fixture usage patterns
  - External: `package.json:7` - primary verification command entry for Jest

  **Acceptance Criteria** (agent-executable only):
  - [ ] Demo serializer exposes an immediate shell object before all page summaries resolve
  - [ ] Final resolved JSON remains shape-equivalent to the pre-refactor serializer output for the same `IntermediateDocument`
  - [ ] No code path in demo serialization performs all-page `Promise.all(...page.getTexts())`

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Progressive shell is available immediately
    Tool: Bash
    Steps: Run targeted Jest coverage for the serializer tests added/updated for the demo progressive flow
    Expected: Test proves the first serializer result contains shell metadata and unresolved page placeholders before any full page text materialization completes
    Evidence: .sisyphus/evidence/task-1-progressive-serializer.txt

  Scenario: Final JSON remains equivalent
    Tool: Bash
    Steps: Run targeted Jest test that compares the final assembled JSON with the previous serializer contract using the same fixture document
    Expected: Deep equality passes for final shape, ordering, and page summary content
    Evidence: .sisyphus/evidence/task-1-progressive-serializer-equivalence.txt
  ```

  **Commit**: YES | Message: `feat(demo): serialize encode output progressively` | Files: `demo/demoDocumentSerialization.js`, related tests

- [x] 2. Add incremental JSON rendering with yielding updates

  **What to do**: Extend `demo/demoJsonView.js` so the renderer can update an existing JSON view incrementally without blocking the UI on a single giant render. Use throttled patch-style rerenders or scheduled full rerenders at bounded intervals after each page summary arrives; schedule updates through browser yielding (`setTimeout(0)`, `requestAnimationFrame`, or equivalent already-supported browser primitive) so large page batches do not monopolize the main thread. Destroy/recreate the tree only when required by the library; otherwise prefer a controlled render cadence driven by progressive serializer updates.
  **Must NOT do**: Must NOT render on every micro-update without throttling, and must NOT swap out `@pgrabovets/json-view` unless incremental updates prove impossible within current integration.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI responsiveness and incremental rendering behavior
  - Skills: `[]` - existing demo stack is plain JS
  - Omitted: `frontend-ui-ux` - no redesign work required, only behavior tuning

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3 | Blocked By: 1

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `demo/demoJsonView.js:22` - current one-shot `renderData()` implementation to evolve
  - Pattern: `demo/demoJsonView.js:37` - message rendering/reset behavior to preserve for loading and error states
  - Pattern: `demo/demo.js:382` - current `Working...` message displayed before JSON render starts
  - External: `package.json:33` - JSON view library dependency currently in use

  **Acceptance Criteria** (agent-executable only):
  - [ ] JSON output renderer supports multiple controlled updates during one encode cycle
  - [ ] Update cadence is throttled/yielded so repeated page arrivals do not cause tight-loop rerenders
  - [ ] Existing loading and error message behavior remains intact

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Renderer accepts incremental updates
    Tool: Bash
    Steps: Run targeted Jest tests for the JSON renderer using a mocked json-view API and multiple progressive updates
    Expected: Tests show prior tree disposal rules remain correct and the renderer can apply multiple updates in one session
    Evidence: .sisyphus/evidence/task-2-json-renderer.txt

  Scenario: Loading/error behavior is preserved
    Tool: Bash
    Steps: Run targeted Jest test covering transition from message state to progressive data updates to error/reset state
    Expected: Output container state matches expected lifecycle without stale tree leakage
    Evidence: .sisyphus/evidence/task-2-json-renderer-errors.txt
  ```

  **Commit**: YES | Message: `feat(demo): throttle progressive json rendering` | Files: `demo/demoJsonView.js`, related tests

- [x] 3. Rework `handleEncode()` to stream results and cancel stale runs

  **What to do**: Update `demo/demo.js` so `handleEncode()` renders progress immediately after `PdfParser.encode()` returns an `IntermediateDocument`, then starts progressive serialization/rendering in the background for the active encode context. Keep page-order updates stable, stop stale updates when `activeDecodeContextId` changes, and re-enable decode only for the latest successful encode context. Keep summary rendering synchronized with the latest fully assembled snapshot; if summary depends only on shell metadata, render that immediately and patch once final values resolve.
  **Must NOT do**: Must NOT let an earlier encode overwrite a newer one, must NOT block `handleEncode()` on full serialization before first visible JSON output, and must NOT regress current error handling or button disable/enable logic.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: orchestration changes across one demo controller file
  - Skills: `[]` - repo-local logic only
  - Omitted: `playwright` - verification is planned later, not needed for implementation task itself

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 5 | Blocked By: 1, 2

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `demo/demo.js:362` - current `handleEncode()` orchestration entry point
  - Pattern: `demo/demo.js:387` - `PdfParser.encode(..., onProgress)` callback handling that must remain visible immediately
  - Pattern: `demo/demo.js:418` - current blocking `await serializeIntermediate(intermediate)` call to remove
  - Pattern: `demo/demo.js:424` - JSON render handoff currently done only once at the end
  - Pattern: `demo/demo.js:430` - error handling branch to preserve
  - Pattern: `demo/demo.js:455` - decode flow starts after successful encode and must remain consistent with active context ownership

  **Acceptance Criteria** (agent-executable only):
  - [ ] `handleEncode()` no longer waits for full page serialization before first JSON output appears
  - [ ] Repeated Encode clicks cancel or ignore stale progressive updates from prior runs
  - [ ] Latest successful encode context remains the only source for decode activation and final JSON state

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Encode shows progress and partial JSON before completion
    Tool: Bash
    Steps: Run targeted Jest tests for `handleEncode()` with mocked serializer stages and progress callbacks
    Expected: Test proves `jsonRenderer.renderData` receives an initial shell/update before final completion and status text updates stay ordered
    Evidence: .sisyphus/evidence/task-3-handle-encode.txt

  Scenario: Repeated clicks do not leak stale updates
    Tool: Bash
    Steps: Run targeted Jest test that triggers two overlapping encode sessions with delayed page updates from the first session
    Expected: Only the latest session mutates summary, JSON output, and decode state
    Evidence: .sisyphus/evidence/task-3-handle-encode-stale.txt
  ```

  **Commit**: YES | Message: `feat(demo): stream encode progress into ui` | Files: `demo/demo.js`, related tests

- [x] 4. Reduce parser page-scan latency while keeping page data lazy

  **What to do**: Refactor `src/pdfParser.ts` `buildPageInfoList()` so encode-time page-info collection is no longer a strict page-by-page serial loop. Use bounded concurrency (default target: 4 in-flight pages, implemented locally inside `buildPageInfoList()` without public API changes) to fetch page viewports in parallel, then sort results back into page-number order before calling `IntermediatePageMap.makeByInfoList(...)`. Keep `getData` closures lazy and make progress events deterministic: emit `encode:page` only when each page's metadata slot has been committed in ascending page order so the demo progress label stays monotonic.
  **Must NOT do**: Must NOT eagerly call `buildIntermediatePage()` during `encode`, must NOT reorder `pageNumbers`, and must NOT add new public options or behavior differences in `PdfParser.encode()`.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: isolated perf-oriented refactor in one parser method
  - Skills: `[]` - existing code patterns are sufficient
  - Omitted: `oracle` - architecture consultation already captured in this plan

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 5 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/pdfParser.ts:175` - encode determines total/maxPages before page-info collection
  - Pattern: `src/pdfParser.ts:180` - `buildPageInfoList()` call site and progress lifecycle
  - Pattern: `src/pdfParser.ts:802` - current serial `for` loop to replace with bounded concurrency
  - Pattern: `src/pdfParser.ts:831` - `getData` closure that must remain lazy
  - Pattern: `src/pdfParser.ts:847` - `withTimeout()` utility to preserve per-page timeout behavior
  - Test: `src/__tests__/pdfParserIntegration.test.ts:166` - page ordering/page count expectations that must continue to pass

  **Acceptance Criteria** (agent-executable only):
  - [ ] `PdfParser.encode()` still returns an `IntermediateDocument` with stable page order and page count
  - [ ] `buildPageInfoList()` no longer uses a single fully serial page-loading loop
  - [ ] Page metadata progress events remain monotonic from page 1 to page N
  - [ ] Page text extraction stays lazy and is not executed as part of page-info collection

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Encode preserves order and laziness
    Tool: Bash
    Steps: Run targeted Jest parser tests that encode a fixture PDF, assert page order/count, and verify page text resolution is still deferred until page access
    Expected: Tests pass without any change to external encode semantics
    Evidence: .sisyphus/evidence/task-4-parser-order.txt

  Scenario: Progress stays monotonic under concurrency
    Tool: Bash
    Steps: Run targeted Jest test with mocked page-loading delays that complete out of order inside the bounded-concurrency pool
    Expected: Emitted `encode:page` events still advance in ascending page order
    Evidence: .sisyphus/evidence/task-4-parser-progress.txt
  ```

  **Commit**: YES | Message: `perf(parser): parallelize encode page scan` | Files: `src/pdfParser.ts`, related tests

- [x] 5. Add regression coverage and end-to-end verification for the new flow

  **What to do**: Add or update Jest coverage for progressive serialization, incremental renderer lifecycle, `handleEncode()` stale-run protection, and parser page-info concurrency semantics. Then run the repo-level verification commands plus demo-oriented verification. If the repo lacks browser automation for the root demo, use deterministic DOM/controller tests and the existing Vite verification command for the demo fixture as supplemental coverage; keep evidence files for every executed check.
  **Must NOT do**: Must NOT introduce flaky timing assertions that depend on exact milliseconds, and must NOT skip repo-wide lint/test verification.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-cutting validation and evidence collection
  - Skills: `[]` - standard repo tooling is enough
  - Omitted: `review-work` - final verification wave handles broader review

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Final Verification Wave | Blocked By: 3, 4

  **References** (executor has NO interview context - be exhaustive):
  - Test: `src/__tests__/pdfParserIntegration.test.ts:117` - integration fixture and async encode test style
  - Test: `src/__tests__/pdfjsWorkerInitialization.test.ts:59` - module-reset/mock pattern for behavior verification
  - Pattern: `package.json:7` - `npm test`
  - Pattern: `package.json:14` - `npm run lint`
  - Pattern: `package.json:15` - `npm run verify:vite`
  - Pattern: `package.json:12` - `npm run verify:roundtrip` if parser semantics need end-to-end confidence

  **Acceptance Criteria** (agent-executable only):
  - [ ] New or updated automated tests cover progressive demo behavior and parser concurrency semantics
  - [ ] `npm test` passes
  - [ ] `npm run lint` passes
  - [ ] `npm run verify:vite` passes or any failure is proven unrelated and documented with evidence

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Repository verification passes
    Tool: Bash
    Steps: Run `npm test` and `npm run lint` from the repo root, saving full output
    Expected: Both commands succeed with zero new failures
    Evidence: .sisyphus/evidence/task-5-repo-verification.txt

  Scenario: Demo build path remains valid
    Tool: Bash
    Steps: Run `npm run verify:vite` and, if parser semantics were touched materially, also run `npm run verify:roundtrip`
    Expected: Demo fixture build succeeds and parser roundtrip either succeeds or any unrelated failure is explicitly captured
    Evidence: .sisyphus/evidence/task-5-demo-verification.txt
  ```

  **Commit**: YES | Message: `test(demo): verify progressive encode flow` | Files: tests covering `demo/*` and `src/pdfParser.ts`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle (APPROVE)
- [x] F2. Code Quality Review — unspecified-high (REJECT on pre-existing timeout-cleanup leaks outside plan scope; 3/4 reviewers approved)
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI) (APPROVE)
- [x] F4. Scope Fidelity Check — deep (APPROVE)

## Commit Strategy
- Commit 1: `feat(demo): stream encode json rendering`
- Commit 2: `perf(parser): reduce encode page scan latency`
- Commit 3: `test(demo): cover progressive encode flow`

## Success Criteria
- `Encode` click updates status and JSON shell without waiting for full page resolution
- Final demo JSON remains semantically equivalent to the current serializer output
- Large or multi-page PDFs no longer feel blocked on all-page eager serialization
- Parser page-info collection contributes less wall-clock delay while keeping page order and lazy page materialization
