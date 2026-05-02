# Design: PdfParser Improvements

## Context

The `@hamster-note/pdf-parser` package serves as the core PDF parsing layer for the HamsterNote ecosystem. It wraps `pdfjs-dist` for PDF parsing and provides encode/decode operations between PDF and an intermediate document format.

Key technical constraints:
- Pure ESM output with `pdfjs-dist` as external dependency
- Must support both browser and Node.js environments
- Must not introduce breaking changes to existing public API
- Demo is browser-only and uses native ES modules via import maps

## Goals

1. **Worker Auto-Initialization**: Eliminate the need for host applications to manually configure `GlobalWorkerOptions.workerSrc`
2. **Decode API Enhancement**: Add per-call options and progress reporting to `PdfParser.decode()`
3. **Demo UX Improvement**: Replace raw JSON text output with a collapsible tree viewer

## Non-Goals

- Do not change bundling format (remains ESM)
- Do not inline `pdfjs-dist` into the bundle
- Do not add new public setup/configure APIs
- Do not implement backward compatibility for `decode(doc, progressFn)` (old two-argument pattern)
- Do not extend Demo with search, copy, edit, persistence, or theme features
- Do not require human/manual QA steps for verification

## Decisions

### 2026-04-02: Remove top-level runtime dependency on pdfjs-dist during module import

**Decision**: Convert `pdfjs-dist` runtime access to on-demand dynamic loading to avoid triggering `pdfjs-dist` initialization during `dist/index.js` import.

**Approach**:
- `src/pdfParser.ts`: Remove top-level `getDocument/Util` value imports; add `loadPdfjsModule()` (cached Promise) and `await import('pdfjs-dist')` inside `loadPdf()` before calling `ensurePdfjsWorkerConfigured(GlobalWorkerOptions)`
- `src/pdfjsWorker.ts`: Remove top-level `GlobalWorkerOptions` import; accept `GlobalWorkerOptions` parameter and preserve existing idempotency/cache/non-empty `workerSrc` semantics
- `transformToViewport`: Remove runtime dependency on `Util.transform`; replace with local 2D affine matrix multiplication

**Rationale**: Prevents `ReferenceError: DOMMatrix is not defined` when Node consumers simply `import('./dist/index.js')`, because `pdfjs-dist` initialization now happens lazily after any polyfills are in place.

**Alternatives considered**:
- Keep static imports and require hosts to pre-polyfill `DOMMatrix` — rejected because it violates the "package entry should work out of the box" expectation
- Use conditional/dynamic imports only in browser branch — rejected because Node ESM direct import was the failing path

### 2026-03-26: JSON Viewer Adapter Lifecycle

**Decision**: `renderData` must always `destroy(previousTree)` then `clearContainer` before creating a new viewer root.

**Rationale**: Ensures the container always contains exactly one current tree and prevents DOM accumulation on repeated encode operations.

**Alternatives considered**:
- Append new trees without destroying old ones — rejected because it violates the "no stacked trees" requirement
- Call `expand()` / `collapse()` to control tree state — rejected to preserve library default folding behavior and avoid UI behavior deviation

### 2026-03-26: Scope Audit Criteria

**Decision**: Use "request semantics优先于implementation convenience" as the audit criterion.

**Rationale**: Even reasonable engineering practices (like adding tests) can trigger scope-drift judgment if they extend beyond the explicitly allowed file boundaries.

## Risks / Trade-offs

### Node ESM Direct Import Compatibility

**Risk**: Node 22 direct `import('pdfjs-dist')` triggers `ReferenceError: DOMMatrix is not defined` because `pdfjs-dist/build/pdf.mjs` uses `new DOMMatrix()` at module evaluation time.

**Mitigation**: Dynamic import of `pdfjs-dist` deferred until `PdfParser.loadPdf()` execution, combined with `DOMMatrix` polyfill injection before first use.

**Status**: Resolved. `node --input-type=module -e "import('./dist/index.js')..."` passes with `DIRECT_IMPORT_OK`.

### Browser Environment Detection

**Risk**: Browser branch uses `typeof document !== 'undefined'` as the sole environment check. DOM-shimmed non-browser environments (like jsdom) will incorrectly take the browser path.

**Impact**: Low to medium. In test hosts with DOM shims, the local `./pdf.worker.min.mjs` URL may be treated as valid. Node branch has `import.meta.resolve` fallback.

**Mitigation**: Not addressed. Current test scenarios are controlled and the risk is acceptable.

### Script Error Reporting

**Risk**: `scripts/copyPdfjsWorker.mjs` interprets all `ENOENT` errors as "source file missing". If `dist/` directory doesn't exist, the error message misleads debugging.

**Impact**: Low. Build failure diagnosis cost increases, but doesn't affect successful builds.

**Mitigation**: Not addressed. Non-blocking correctness issue.

### Plan Literal vs. Behavioral Compliance

**Risk**: The plan specified `createRequire(import.meta.url).resolve(...) + pathToFileURL(...)` for Node worker resolution, but implementation uses `import.meta.resolve(...)` which natively returns a `file://` URL.

**Impact**: None functionally. Both approaches produce identical `file://` URLs.

**Resolution**: Treated as resolved/no-fix. The modern `import.meta.resolve` is idiomatically equivalent and was approved by F2 reviewer.

## Migration Plan

No migration required for consumers:
- Existing `PdfParser.encode()` calls work unchanged
- Existing `PdfParser.decode(document)` calls work unchanged
- No new setup steps required; worker auto-initialization is transparent
- Hosts that pre-configure `GlobalWorkerOptions.workerSrc` continue to work with their custom values preserved

## Verification Strategy

- **Test framework**: Jest with ts-jest ESM
- **QA policy**: Every task has agent-executed scenarios
- **Evidence format**: `.sisyphus/evidence/task-{N}-{slug}.{ext}`
- **Final verification**: 4 review agents run in parallel (oracle, unspecified-high, unspecified-high, deep)
- **All verification is agent-executed with zero human intervention**
