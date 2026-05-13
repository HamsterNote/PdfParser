# Design: PdfParser Sisyphus Workspace Archive

## Context

This archive captures three completed development tracks for the `@hamster-note/pdf-parser` package, a TypeScript library that wraps `pdfjs-dist` to parse PDF documents into an intermediate representation suitable for note-taking applications.

### Project Background
- **Tech stack**: TypeScript 5.0.2, `pdfjs-dist` (peer dependency), `@hamster-note/document-parser`, `@hamster-note/types`
- **Build system**: Rolldown with ESM output, `pdfjs-dist` and `node:*` modules marked as external
- **Test framework**: Jest with ESM support, ts-jest
- **Demo**: Plain ESM JS browser demo using Vite for local development
- **Package**: Published to npm as `@hamster-note/pdf-parser`

### Development Tracks

#### Track 1: Demo JSON Pretty View (Archived)
The original request was to improve the Demo experience by adding a JSON beautification component. The scope was strictly limited to demo-only changes with no production dependency additions.

#### Track 2: PDFJS Worker Initialization
A critical gap was identified: the published npm package required consumers to manually configure `GlobalWorkerOptions.workerSrc`, which was only done in `demo/demo.js` and test utilities. This meant the package was not truly "ready to use" out of the box.

#### Track 3: Demo Encode Performance
User feedback indicated that clicking `Encode` in the demo caused long UI freezes. Investigation revealed eager serialization of all page data via `Promise.all` before any UI update, and serial page-by-page info collection in the parser.

## Goals

### Track 1: Demo JSON Pretty View
- Replace raw JSON `<pre>` output with collapsible tree viewer
- Keep changes strictly inside `demo/*` surface
- Preserve existing encode/error flow semantics
- Add automated test coverage for renderer lifecycle

### Track 2: PDFJS Worker Initialization
- Provide automatic worker initialization without requiring manual setup
- Support both browser and Node.js environments
- Ship browser worker asset with npm package
- Preserve existing ESM/external bundling model
- Maintain backward compatibility with pre-configured `workerSrc`

### Track 3: Demo Encode Performance
- Make `Encode` click responsive immediately with visible progress
- Decouple JSON presentation from full page materialization
- Reduce parser page-scan latency without changing encode/decode semantics
- Preserve final JSON output shape and field ordering
- Add regression coverage for all new behaviors

## Non-Goals

- No changes to `src/` parser implementation for Track 1
- No new public setup/configure APIs for Track 2
- No worker-based architecture, streaming public APIs, or pdf.js internal patches for Track 3
- No framework dependencies (React/Vue/Playwright/jsdom) introduced
- No redesign of unrelated Demo features (search, copy, edit, persistence, themes)

## Decisions

### Track 1: Demo JSON Pretty View

1. **2026-03-26**: `renderData` always destroys previous tree, clears container, and creates new viewer root to ensure container has only current tree.
2. **2026-03-26**: Do not call `expand()` / `collapse()`; preserve `@pgrabovets/json-view` default collapsed state to avoid UI behavior deviation in adapter layer.
3. **2026-03-26**: Scope audit adopts "request semantics priority over implementation convenience" criterion; even reasonable engineering practices like adding tests are REJECTed if they exceed "demo files only" boundary.
4. **2026-03-26**: Manual QA conclusion: APPROVE; success, failure, and repeated render browser scenarios all passed, with evidence archived in `.sisyphus/evidence/`.

### Track 2: PDFJS Worker Initialization

1. **2026-04-02**: Remove top-level runtime dependency on `pdfjs-dist` during module import.
   - **Decision**: Defer `pdfjs-dist` runtime access to on-demand dynamic loading to avoid triggering `pdfjs-dist` initialization during `dist/index.js` import phase.
   - **Implementation**: 
     - `src/pdfParser.ts`: Remove top-level `getDocument/Util` imports; add `loadPdfjsModule()` (cached Promise) and `await import('pdfjs-dist')` inside `loadPdf()` before calling `ensurePdfjsWorkerConfigured(GlobalWorkerOptions)`.
     - `src/pdfjsWorker.ts`: Remove top-level `GlobalWorkerOptions` import, accept `GlobalWorkerOptions` parameter, preserve existing idempotency/cache/non-empty `workerSrc` semantics.
     - `transformToViewport`: Remove runtime dependency on `Util.transform`, use local 2D affine matrix multiplication.
   - **Rationale**: Prevent `DOMMatrix is not defined` error in Node ESM direct import scenarios.
   - **Alternatives considered**: Pre-import polyfill (rejected - requires consumer action); keep static imports (rejected - causes crash).

2. **Node/non-browser Resolution Strategy**: Use `import.meta.resolve()` instead of `createRequire(import.meta.url).resolve() + pathToFileURL()`.
   - **Rationale**: `import.meta.resolve()` in Node ESM natively returns `file://` URL, achieving behavioral equivalence with the two-step plan-specified approach.
   - **Risk**: Plan was written with older Node ESM pattern; modern idiomatic equivalent was not in original author's vocabulary.
   - **Decision**: Treat as resolved/no-fix; changing to plan-literal approach introduces unnecessary churn with zero functional benefit.

### Track 3: Demo Encode Performance

1. **Task 1**: Progressive serializer must return immediate shell + async progression callback mechanism.
   - Shell contains: `id`, `title`, `pageCount`, `hasOutline`, `pageNumbers`, `coverAvailable` placeholder, `pages` placeholders.
   - Reuse already resolved page summaries in memory to avoid re-fetching on rerenders.

2. **Task 2**: JSON renderer needs throttled incremental updates without swapping json-view library.
   - Throttle mechanism: `pendingData` + `scheduled` flag + `rafId` for cancellation.
   - Uses `requestAnimationFrame` when available, falls back to `setTimeout(cb, 0)` in node/tests.
   - Multiple `updateData` calls before scheduled frame fires coalesce into single render with latest data.

3. **Task 3**: `handleEncode()` must use progressive serializer, cancel stale runs via `activeDecodeContextId`.
   - Render `serializer.shell` immediately via `jsonRenderer.renderData(shell)`.
   - Summary rendered twice: immediate shell metadata render, then patched on each `onUpdate(snapshot)` and final resolve snapshot.
   - Stale-run protection centralized with `encodeContextId !== activeDecodeContextId` guard before every UI mutation.

4. **Task 4**: `buildPageInfoList()` needs bounded concurrency (4 in-flight) with monotonic progress events.
   - Algorithm: slots array holds results, `nextToEmit` tracks progress monotonicity, `nextToFetch` and `inFlight` control bounded launching.
   - Progress events emitted via drain loop: `while (nextToEmit <= total && slots[nextToEmit - 1] !== undefined)` ensures strict ascending order.

## Risks / Trade-offs

### Track 1: Demo JSON Pretty View
- **Node test environment**: No real browser DOM; mitigated via lightweight `OutputElementLike` stub object covering `replaceChildren/append/textContent/ownerDocument.createElement`.
- **Scope boundary tension**: `package.json`/`yarn.lock`/`src/__tests__` modifications triggered scope-fidelity REJECT initially, but were overridden since they were explicitly required by Plan Must Have clauses.

### Track 2: PDFJS Worker Initialization
- **Browser branch detection**: Uses `typeof document !== 'undefined'` as sole criterion; DOM shim/jsdom environments may incorrectly take browser path. Risk: low (Node branch has `import.meta.resolve` fallback).
- **Script reliability**: `scripts/copyPdfjsWorker.mjs` interprets all `ENOENT` as missing source file; if `dist/` directory is missing, error message is misleading. Non-blocking but affects debuggability.
- **Node ESM direct import**: Original implementation had top-level static imports of `pdfjs-dist` causing `ReferenceError: DOMMatrix is not defined` in Node 22. Fixed by dynamic import approach.

### Track 3: Demo Encode Performance
- **Renderer throttling complexity**: Coalescing multiple `updateData` calls introduces state management complexity (`pendingData`, `scheduled`, `rafId`).
- **Bounded concurrency in parser**: Promise-based concurrency pool adds algorithmic complexity; must ensure `getData` closures remain lazy and page ordering is preserved.
- **Stale run cancellation**: Centralized guard pattern requires careful placement before every UI mutation; missing a guard site could cause stale updates to leak through.

## Migration Plan

N/A - This is an archive of completed work. All changes have been merged and verified.

## Verification Evidence

All verification evidence has been preserved in the `specs/` directory of this archive, including:
- Plan compliance audits (F1)
- Code quality reviews (F2)
- Manual QA results (F3)
- Scope fidelity checks (F4)
- Task-level test outputs and build verification logs
