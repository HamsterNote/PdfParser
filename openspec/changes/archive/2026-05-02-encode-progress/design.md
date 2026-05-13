# Design: Encode Progress Reporting

## Context

The PdfParser library provides bidirectional PDF processing: `decode` converts PDF to an intermediate document format, and `encode` converts the intermediate document back to PDF. The `decode` method already supports progress reporting via a third-argument callback with stages `decode:start`, `decode:page`, and `decode:complete`. This design extends the same pattern to `encode`.

Key file locations:
- `src/pdfParser.ts:138` — encode entry point
- `src/pdfParser.ts:158` — `resolveEncodeOptions` (clamps `maxPages`)
- `src/pdfParser.ts:772` — `buildPageInfoList` loop (iterates pages deterministically)
- `src/pdfParser.ts:184` — decode signature with progress callback (pattern to mirror)
- `src/index.ts:6` — public type exports
- `demo/demo.js:192` — `formatDecodeProgressText` (formatter pattern to mirror)
- `demo/demo.js:334` — `handleEncode` control flow

## Goals / Non-Goals

**Goals:**
- Add progress reporting to `PdfParser.encode` with the same callback semantics as `decode`
- Export `EncodeProgressEvent` and `EncodeProgressReporter` types
- Update the browser demo to display encode progress
- Maintain full backward compatibility for existing callers

**Non-Goals:**
- Do not change the encode return type or output shape
- Do not move the progress callback into `EncodeOptions`
- Do not refactor unrelated decode logic or demo architecture
- Do not add cancellation, worker progress, or byte-level progress
- Do not break existing `PdfParser.encode(input)` or `PdfParser.encode(input, options)` call sites

## Decisions

### Progress stages mirror decode exactly
- **Decision**: Use `'encode:start'`, `'encode:page'`, `'encode:complete'` stages with payload shape `{ stage, current, total, message? }`
- **Reason**: Maintains API consistency and allows consumers to reuse progress UI components
- **Alternatives considered**: Different payload shape, stages prefixed differently
- **Not chosen**: Would introduce inconsistency and force consumers to handle two progress formats

### Third-argument callback (not options-based)
- **Decision**: Place the reporter as the third argument, matching decode's `(input, options?, reporter?)` shape
- **Reason**: Consistent with existing decode API; avoids polluting `EncodeOptions`
- **Alternatives considered**: Adding `onProgress` field to `EncodeOptions`
- **Not chosen**: Plan explicitly guards against callback-in-options overloads to preserve API clarity

### Page count derived from `Math.min(pdf.numPages, resolvedOptions.maxPages)`
- **Decision**: Use the clamped page count as the `total` for progress events
- **Reason**: Progress should reflect actual work performed, not raw input size
- **Alternatives considered**: Using raw `pdf.numPages` regardless of `maxPages`
- **Not chosen**: Would misreport progress when `maxPages` caps the output

### Reporter-thrown exceptions propagate to caller
- **Decision**: Do not swallow callback exceptions; let them bubble up
- **Reason**: Matches decode behavior and follows Node.js callback conventions
- **Alternatives considered**: Catching and ignoring reporter errors
- **Not chosen**: Would hide bugs in consumer callback code

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Existing callers passing function as second arg break | Add runtime check: reject function second arg with `TypeError` pointing to third arg |
| Demo state leaks between encode runs | Use `activeDecodeContextId` invalidation pattern already present in `handleEncode` |
| Page cleanup skipped if reporter throws | Place `page.cleanup?.()` before reporter call or in guaranteed `finally` path |
| Test coverage gaps for backward compatibility | Add dedicated contract regression tests for all three call shapes |

## Migration Plan

No consumer migration required — this is a backward-compatible additive change. Existing code continues to work without modification.

Consumers who want to adopt progress reporting can opt in by adding a third argument:

```typescript
// Before (still works)
const doc = await PdfParser.encode(buffer);

// After (new capability)
const doc = await PdfParser.encode(buffer, options, (event) => {
  console.log(`${event.stage}: ${event.current}/${event.total}`);
});
```
