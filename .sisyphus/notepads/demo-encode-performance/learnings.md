## Conventions
- Demo files are plain ESM JS (import/export)
- Jest config: `testMatch: ['**/__tests__/**/*.test.ts']`, uses ts-jest with ESM
- Tests for demo code should be `.test.ts` files under `demo/__tests__/`
- `@hamster-note/types` is mocked in `src/__mocks__/@hamster-note/types.ts`
- `IntermediateDocument` exposes `.pages` (Promise<IntermediatePage[]>), `.pageCount`, `.pageNumbers`, `.getCover()`
- `IntermediatePage` exposes `.number`, `.width`, `.height`, `.getTexts()` (lazy if set via `setGetTexts`), `.texts` (array once loaded)
- Current `serializeIntermediate()` returns: `{ id, title, pageCount, hasOutline, pageNumbers, coverAvailable, pages }`
- `buildPageSummary(page, texts)` returns: `{ number, width, height, textCount, previewText: [{ content, fontSize, fontFamily, color, polygon }] }`

## Key Decisions
- Task 1: Progressive serializer must return immediate shell + async progression callback mechanism
- Task 2: JSON renderer needs throttled incremental updates without swapping json-view library
- Task 3: `handleEncode()` must use progressive serializer, cancel stale runs via `activeDecodeContextId`
- Task 4: `buildPageInfoList()` needs bounded concurrency (4 in-flight) with monotonic progress events
- Task 5: Tests should cover all new behaviors, run `npm test` and `npm run lint`

## Task 2 Findings (JSON Renderer Throttled Updates)
- Added `updateData(data)` to `createJsonOutputRenderer` return object alongside existing methods
- Throttle mechanism: `pendingData` + `scheduled` flag + `rafId` for cancellation
- Uses `requestAnimationFrame` when available, falls back to `setTimeout(cb, 0)` in node/tests
- `dispose()` cancels pending frame via `cancelAnimationFrame` or `clearTimeout`
- Multiple `updateData` calls before the scheduled frame fires coalesce into a single render with the latest data
- `renderData` continues to do immediate full rerender (destroy + recreate) for initial loads/resets
- `renderMessage` continues to destroy tree and show text
- Tests use `jest.useFakeTimers()` to control `setTimeout` fallback since rAF is not available in node test environment
- Mocked `jsonview` API with `create`, `render`, `destroy` functions to avoid DOM dependency
- Mocked output element with `replaceChildren`, `ownerDocument.createElement`, `textContent`, `appendChild`

## Task 3 Findings (Progressive `handleEncode`)
- `handleEncode()` now uses `createProgressiveSerializer(intermediate)` and renders `serializer.shell` immediately via `jsonRenderer.renderData(shell)`
- Summary is rendered twice in progressive flow: immediate shell metadata render, then patched on each `onUpdate(snapshot)` and final resolve snapshot
- Stale-run protection remains centralized with `encodeContextId !== activeDecodeContextId` guard before every UI mutation (progress callbacks, incremental updates, final activation, and error handling)
- Decode is only re-enabled after `await serializer.resolve()` completes for the active context; stale final resolves are ignored
- In tests, mocking `PdfParser` for `demo.js` ESM import path is most stable by importing `../../dist/browser.js` first and replacing `PdfParser` methods before importing `demo.js`

## Task 4 Findings (buildPageInfoList Bounded Concurrency)
- Implemented bounded concurrency (4 in-flight) inside `buildPageInfoList()` using a Promise-based concurrency pool
- Algorithm: slots array holds results, `nextToEmit` tracks progress monotonicity, `nextToFetch` and `inFlight` control bounded launching
- Progress events are emitted via a drain loop: `while (nextToEmit <= total && slots[nextToEmit - 1] !== undefined)` ensures strict ascending order
- Extracted `onPageLoaded()` handler function to reduce nesting depth (satisfies sonarjs/no-nested-functions)
- Tests verify: (1) max 4 concurrent getPage calls, (2) progress events are monotonic even with out-of-order completion, (3) getData closures remain lazy
- `jest.fn(async (_pageNumber) => ...)` pattern avoids unused parameter lint warnings by prefixing with underscore
- Nested ternary expressions should be extracted to helper functions to avoid sonarjs/no-nested-conditional warnings
- `maxConcurrent.push(currentConcurrent)` inside mock tracks peak concurrency; jest mock functions are inherently nested (arrow function body counts as nested function per sonar rules)
