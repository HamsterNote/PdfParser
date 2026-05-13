# Proposal: PdfParser Sisyphus Workspace Archive

## Why

The `.sisyphus` directory contained three major development tracks for the `@hamster-note/pdf-parser` project:

1. **Demo JSON Pretty View** (completed, archived in `.sisyphus/plans/archive/`):  
   Replaced the Demo's raw JSON `<pre>` output with a collapsible tree viewer backed by `@pgrabovets/json-view`, keeping changes strictly inside the Demo surface and preserving existing encode/error flows.

2. **PDFJS Worker Initialization** (completed):  
   Users reported that the published npm package lacked built-in `pdfjs-dist` worker initialization, causing failures when consumers imported the package without manually setting `GlobalWorkerOptions.workerSrc`. The goal was to provide automatic, lazy worker initialization for both browser and Node.js environments without changing the existing ESM/external bundling model.

3. **Demo Encode Performance** (completed):  
   Users reported that the demo became very slow after clicking `Encode`. The root cause was eager serialization of all page data before any UI update. The goal was to make the demo responsive immediately after `Encode` by decoupling JSON presentation from full page materialization, then reduce parser-side page scan latency without changing encode/decode semantics.

## What Changes

### Track 1: Demo JSON Pretty View
- Added `@pgrabovets/json-view` as a devDependency (demo-only)
- Wired local browser assets (`jsonview.css`, `jsonview.js`) in `demo/encode.html`
- Created `demo/demoJsonView.js` adapter with deterministic rerender/cleanup behavior
- Integrated renderer into `demo/demo.js` encode/error flow
- Restyled output panel in `demo/demo.css` for tree readability
- Added automated adapter coverage in `src/__tests__/demoJsonView.test.ts`

### Track 2: PDFJS Worker Initialization
- Created internal `src/pdfjsWorker.ts` module with `ensurePdfjsWorkerConfigured()`
- Browser branch: uses `new URL('./pdf.worker.min.mjs', import.meta.url).href`
- Node branch: uses `import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')`
- Integrated lazy initialization into `PdfParser.loadPdf()` before `getDocument()`
- Added build script `scripts/copyPdfjsWorker.mjs` to ship worker asset with npm package
- Added regression tests covering browser, Node, preconfigured, and idempotent scenarios

### Track 3: Demo Encode Performance
- Refactored `demo/demoDocumentSerialization.js` to progressive serializer (immediate shell + async page-by-page updates)
- Extended `demo/demoJsonView.js` with throttled incremental updates via `requestAnimationFrame` / `setTimeout` fallback
- Reworked `demo/demo.js` `handleEncode()` to stream results and cancel stale runs via `activeDecodeContextId`
- Optimized `src/pdfParser.ts` `buildPageInfoList()` with bounded concurrency (4 in-flight) and monotonic progress events
- Added regression coverage for progressive serialization, renderer lifecycle, stale-run protection, and parser concurrency semantics

## Capabilities

- [x] Demo JSON output renders as collapsible tree instead of raw text
- [x] `PdfParser` auto-initializes `pdfjs-dist` worker without manual setup in both browser and Node.js
- [x] Published npm package includes `dist/pdf.worker.min.mjs` browser worker asset
- [x] Demo `Encode` click shows immediate progress and partial JSON shell
- [x] Stale encode runs are safely cancelled without mutating current UI state
- [x] Parser page-info collection uses bounded concurrency while preserving lazy page data semantics
- [x] All changes preserve existing API contracts and final JSON output shape

## Impact

- **Demo surface**: JSON viewer, encode flow responsiveness, output styling
- **Parser internals**: Worker auto-initialization, page scan concurrency, lazy page resolution
- **Build/publish**: New build script, worker asset shipping, tarball verification
- **Tests**: New test files for renderer, worker initialization, parser concurrency, and demo orchestration
- **No breaking changes**: All existing APIs remain unchanged

## Verification Summary

All three tracks passed final verification waves (F1-F4):
- **F1 Plan Compliance**: APPROVE (demo-json-pretty-view, pdfjs-worker-initialization), FAIL→APPROVE (demo-encode-performance after fixes)
- **F2 Code Quality**: APPROVE
- **F3 Manual QA**: APPROVE
- **F4 Scope Fidelity**: APPROVE

Test coverage: 242/242 tests passed, lint: 0 errors.
