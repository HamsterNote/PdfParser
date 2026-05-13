## Conventions & Patterns

- Encode method signature: `static async encode(fileOrBuffer, options = {})` at src/pdfParser.ts:138
- Decode method signature with progress: `static async decode(document, options = {}, onProgress?)` at src/pdfParser.ts:184
- Decode rejects function as second arg with TypeError pointing to third arg usage
- Decode progress stages: `decode:start`, `decode:page`, `decode:complete`
- Decode progress payload: `{ stage, current, total, message? }`
- Encode options resolved with `resolveEncodeOptions(options, pdf.numPages)` which clamps maxPages
- buildPageInfoList iterates pages up to `Math.min(pdf.numPages, options.maxPages)` and calls `page.cleanup?.()` after each page
- Demo formatDecodeProgressText mirrors the decode stage pattern
- Demo handleEncode uses `activeDecodeContextId` for context invalidation

## Key File Locations
- src/pdfParser.ts:138 - encode entry point
- src/pdfParser.ts:158 - resolveEncodeOptions
- src/pdfParser.ts:772 - buildPageInfoList loop
- src/index.ts:6 - public type exports
- demo/demo.js:192 - formatDecodeProgressText
- demo/demo.js:334 - handleEncode
- demo/demo.js:406 - handleDecode with callback pattern

## Tests
- encodeSafeguards.test.ts: New signature compatibility tests added
- Tests use test_github.pdf fixture (path.resolve(__dirname, 'test_github.pdf'))
- Signature: `PdfParser.encode(fileOrBuffer, options = {}, onProgress?)`
