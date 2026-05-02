# Encode Progress for API and Demo

## Why

The PdfParser library currently supports progress reporting for the `decode` operation using a three-argument call shape `(document, options?, onProgress?)`. However, the `encode` operation only accepts `(fileOrBuffer, options?)` and provides no way for consumers to track encoding progress. This creates an inconsistent API surface and prevents users from building responsive UI experiences during PDF encoding operations.

Key drivers:
- Functional parity: encode should mirror decode's progress reporting capability
- Demo experience: the browser demo already shows decode progress but cannot show encode progress
- API consistency: consumers expect the same callback semantics across both operations

## What Changes

This change adds deterministic page-level progress reporting to `PdfParser.encode` using the same third-argument reporter pattern as `decode`, then surfaces that progress in the browser demo.

Core deliverables:
- New `EncodeProgressEvent` and `EncodeProgressReporter` types with encode-specific stages
- Updated `PdfParser.encode` signature: `encode(fileOrBuffer, options?, onProgress?)`
- Demo encode progress text formatting and state updates
- Jest test coverage for progress sequence and backward compatibility

## Capabilities

- `encode` accepts `(fileOrBuffer, options?, onProgress?)`
- `EncodeProgressEvent` matches decode payload structure (`stage`, `current`, `total`, optional `message`) using encode-specific stages: `'encode:start'`, `'encode:page'`, `'encode:complete'`
- New types exported from `src/index.ts`
- Demo encode path clears stale state, shows progress while encoding, and ends in success or failure text
- Existing no-callback callers remain valid — `PdfParser.encode(input)` and `PdfParser.encode(input, options)` continue to work unchanged

## Impact

- **API surface**: Two new exported types and one new optional parameter on `PdfParser.encode`
- **Demo UI**: New encode progress formatter helpers and state wiring in `demo/demo.js`
- **Test coverage**: Extended Jest tests in `encodeSafeguards.test.ts` and `pdfParserIntegration.test.ts`
- **Backward compatibility**: Fully preserved — no breaking changes to existing callers
