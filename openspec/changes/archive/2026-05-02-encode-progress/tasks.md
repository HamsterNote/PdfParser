## Tasks

### Plan: Encode Progress for API and Demo

- [x] 1. Define encode progress API contract

  **What to do**: Add `EncodeProgressEvent` and `EncodeProgressReporter` beside the existing decode progress types in `src/pdfParser.ts`; use stages `'encode:start' | 'encode:page' | 'encode:complete'` and the same payload shape as decode (`stage`, `current`, `total`, optional `message`). Export both from `src/index.ts` and update any public type surfaces that need to expose the new contract.
  **Must NOT do**: Must NOT rename or reshape decode progress types; must NOT put the reporter into `EncodeOptions`; must NOT change the `EncodeOptions` fields themselves.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 6] | Blocked By: []

- [x] 2. Add demo encode progress formatting helpers

  **What to do**: Introduce encode-side progress text/state helper(s) in `demo/demo.js` that mirror the decode UX pattern from `formatDecodeProgressText`, but with fixed encode strings. Derive `pageLabel` exactly as `total === 1 ? 'page' : 'pages'`. Use these exact outputs: for `encode:start`, `Encoding started. Preparing ${total} ${pageLabel}...` when `total > 0`, otherwise `Encoding started.`; for `encode:page`, `Encoding page ${Math.min(current, total)} of ${total}...` when `total > 0`, otherwise `Encoding PDF pages...`; for `encode:complete`, `Encoding complete. Processed ${total} ${pageLabel}.` when `total > 0`, otherwise `Encoding complete.`. Define the note string to report `Processed ${current} / ${total} ${pageLabel} so far.` during page events and the exact finalizing message `Finalizing the restored PDF preview...` immediately before the ready state.
  **Must NOT do**: Must NOT rewrite decode helpers; must NOT redesign the demo state model; must NOT add new UI containers unless the existing status/decode state areas are truly insufficient.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5] | Blocked By: []

- [x] 3. Add encode contract regression tests

  **What to do**: Extend the Jest suite to lock in the new encode call shape and compatibility rules. Add tests that verify `PdfParser.encode(input)` still works, `PdfParser.encode(input, options)` still works, and `PdfParser.encode(input, reporter)` is rejected with the exact TypeError message `PdfParser.encode() no longer accepts a progress function as the second argument. Use PdfParser.encode(input, options, reporter) instead.`. In the invalid-second-argument test, pass the reporter through a runtime cast such as `as any` so the rejection is verified at runtime rather than blocked by TypeScript. Also assert that a reporter-thrown exception bubbles to the caller unchanged.
  **Must NOT do**: Must NOT weaken existing safeguard assertions; must NOT create new test infrastructure; must NOT rely on browser-only demo behavior.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [4]

- [x] 4. Instrument encode lifecycle progress emission

  **What to do**: Update `PdfParser.encode` in `src/pdfParser.ts` to accept `onProgress?: EncodeProgressReporter` as the third argument, reject a function passed as the second argument with a decode-style TypeError, emit `encode:start` after page count is known, emit `encode:page` once per processed page in deterministic order, and emit `encode:complete` after the `IntermediateDocument` is fully assembled. Use `Math.min(pdf.numPages, resolvedOptions.maxPages)` as the `total`, and keep current return/error behavior unchanged. Ensure page cleanup still runs even if the reporter throws by placing `page.cleanup?.()` before the reporter call or in a `finally` path that is guaranteed to execute first.
  **Must NOT do**: Must NOT change the encode return type; must NOT emit decode-prefixed stages; must NOT swallow callback exceptions; must NOT emit progress before `pdf` and effective total pages are known.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [5, 6] | Blocked By: [1]

- [x] 5. Wire encode progress into the demo flow

  **What to do**: Update `handleEncode` in `demo/demo.js` to pass the third-argument encode reporter into `PdfParser.encode`, map each event through the new encode formatter/helper, and keep state resets aligned with the existing context-id invalidation logic. On start, clear stale decode preview state exactly as today; while encoding, update only the top-level encode status region (`[data-role="status"]`) and existing preview-note messaging per progress event; leave decode-specific status text owned by decode-state/reset logic; on completion, end with the existing success state; on failure, restore the existing error pathway without leaving stale encode-progress text behind.
  **Must NOT do**: Must NOT interfere with `handleDecode`; must NOT re-enable decode before encode success; must NOT leak progress updates from stale encode contexts after a newer encode starts.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [2, 4]

- [x] 6. Extend integration coverage for encode progress behavior

  **What to do**: Add or extend integration-oriented Jest coverage so encode progress is asserted against a real multi-page fixture. Capture the emitted event list when encoding `test_github.pdf`, verify `start.total === pageCount`, verify page events increment from `1..N`, and verify `complete.current === complete.total === N`. Also cover a capped `maxPages` case so totals reflect the effective limit rather than the original PDF size.
  **Must NOT do**: Must NOT convert the suite into browser tests; must NOT depend on demo DOM state; must NOT loosen existing content assertions in the integration suite.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [] | Blocked By: [1, 3, 4]

### Final Verification Wave

- [x] F1. Plan Compliance Audit
- [x] F2. Code Quality Review (includes `lsp_diagnostics` on changed files)
- [x] F3. Real Manual QA (rerun `npm test`, `npm run lint`, `npm run verify:vite`)
- [x] F4. Scope Fidelity Check
