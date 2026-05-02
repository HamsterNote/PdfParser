# demo-json-pretty-view Manual QA

- Verdict: APPROVE
- URL: `http://127.0.0.1:5577/demo/encode.html`
- Setup: ran `yarn build:all`, started `yarn dev`, then executed browser-level QA with Playwright.

## Scenario 1: Success Path
- Result: PASS
- Steps: clicked `#demo-load-sample`, clicked `#encode-button`, waited for `[data-role="status"]` to become `Encode ready`.
- Assertions:
  - `[data-role="output"]` rendered viewer DOM instead of a raw `<pre>`/plain-text blob.
  - Detected viewer root `.json-container` with nested json-view nodes such as `.line`, `.json-key`, `.json-value`.
- Evidence: `.sisyphus/evidence/f3-success-tree.png`

## Scenario 2: Failure Path
- Result: PASS
- Input file: `.sisyphus/evidence/f3-invalid.pdf`
- Steps: uploaded fake PDF content, clicked `#encode-button`, waited for failure state.
- Assertions:
  - `[data-role="status"]` became `Encode failed`.
  - Output displayed plain text error: `Invalid PDF structure.`
  - `[data-role="output"]` had `childElementCount = 0` and no json-view DOM remained.
  - Error banner displayed `Encoding failed. See JSON output for details.`
- Evidence: `.sisyphus/evidence/f3-error-path.png`

## Scenario 3: Rerender Path
- Result: PASS
- Steps: loaded sample PDF, encoded once to completion, encoded again, then counted viewer roots inside `[data-role="output"]`.
- Assertions:
  - Viewer root count was exactly `1`.
  - Output element child count was exactly `1`.
- Evidence: `.sisyphus/evidence/f3-rerender.txt`

## Failures
- None

## Notes
- During the invalid PDF scenario, Playwright captured one `pdfjs-dist` warning (`Warning: Indexing all PDF objects`), but the UI behavior matched the expected failure-path contract.
