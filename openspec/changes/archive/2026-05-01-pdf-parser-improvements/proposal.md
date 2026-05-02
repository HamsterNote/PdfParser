# Proposal: PdfParser Improvements

## Why

### Background
The `@hamster-note/pdf-parser` package had several gaps that needed addressing:

1. **PDFJS Worker Initialization Gap**: Published npm packages lacked built-in `pdfjs-dist` worker initialization. Only `demo/demo.js` and test utilities explicitly set `GlobalWorkerOptions.workerSrc`, causing initialization failures for consumers who didn't manually configure the worker path.

2. **Decode API Limitations**: The `PdfParser.decode()` method only accepted a single parameter (the intermediate document). There was no way to pass per-call conversion options or receive progress feedback during the decode operation.

3. **Demo Experience**: The Demo's JSON Output was rendered as raw `<pre>` text, making it difficult to read and navigate structured PDF parse results.

### Goals
- Enable automatic, lazy `pdfjs-dist` worker initialization without requiring host applications to manually configure worker paths
- Extend `PdfParser.decode()` API with per-call options and deterministic progress reporting
- Improve Demo JSON Output readability with a collapsible tree viewer

## What Changes

### 1. PDFJS Worker Auto-Initialization
- Internal `pdfjsWorker.ts` module with environment-aware worker resolution
- Browser branch: uses `new URL('./pdf.worker.min.mjs', import.meta.url).href` for packaged worker
- Node/Jest branch: uses `import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')` for legacy worker
- Lazy initialization hooked into `PdfParser.loadPdf()` before `getDocument()` calls
- Idempotent initialization with host-configured `workerSrc` preservation
- Build script to copy `pdf.worker.min.mjs` into `dist/` for npm publication

### 2. Decode Options and Progress Reporter
- New `DecodeOptions` type with per-call `fonts` override support
- New `DecodeProgressEvent` and `DecodeProgressReporter` types
- Updated `PdfParser.decode(intermediateDocument, options = {}, onProgress?)` signature
- Deterministic progress events: `decode:start`, `decode:page`, `decode:complete`
- Per-call font options isolated from static `configureDecodeFont(...)` state
- Full backward compatibility for single-argument `decode(doc)` calls

### 3. Demo JSON Pretty View
- Added `@pgrabovets/json-view` as devDependency for collapsible tree rendering
- Created `demo/demoJsonView.js` adapter with `renderData`, `renderMessage`, `dispose` API
- Integrated renderer into Demo encode/error flow
- Scoped CSS styling for tree readability within existing Demo layout
- Automated test coverage for renderer lifecycle (first render, rerender cleanup, message cleanup)

## Capabilities

- Browser and Node.js environments can use `PdfParser` without manual `pdfjs-dist` worker setup
- Published npm package includes browser worker asset (`dist/pdf.worker.min.mjs`)
- Host-preconfigured `GlobalWorkerOptions.workerSrc` is never overwritten by library logic
- `PdfParser.decode()` supports per-call font configuration that doesn't leak across calls
- Progress reporter receives structured object events with stage, current page, and total pages
- Demo JSON Output renders as an interactive collapsible tree instead of raw text
- All changes maintain backward compatibility with existing single-argument decode calls

## Impact

### Scope
- `src/pdfjsWorker.ts` — new internal worker initialization module
- `src/pdfParser.ts` — lazy worker initialization hook + decode API expansion
- `src/index.ts` — re-export new decode types
- `scripts/copyPdfjsWorker.mjs` — build-time worker asset copy
- `package.json` — build script updates + optional devDependency
- `demo/*` — JSON viewer integration (Demo-only change)
- `src/__tests__/*` — new and updated test coverage

### Backward Compatibility
- Existing `PdfParser.encode()` behavior unchanged
- Existing `PdfParser.decode(document)` single-argument calls work identically
- Existing `configureDecodeFont(...)` static configuration remains effective
- No new public setup/configure APIs introduced

## References

- Plan: `pdfjs-worker-initialization.md`
- Plan: `optimize-decode-params.md`
- Plan: `demo-json-pretty-view.md` (archived)
