# Tasks: Upgrade @hamster-note/types to 0.8.0

## Plan: upgrade-hamster-note-types-080

### Wave 1: Foundation

- [x] **1. Upgrade dependency baseline and verify 0.8.0 contract**
  - Update `package.json` from `@hamster-note/types@^0.7.0` to exact `0.8.0`
  - Add `check:types` as `tsc --noEmit`
  - Inspect installed `.d.ts` files for actual API contract
  - **Agent**: deep | **Blocks**: Tasks 2-13

- [x] **2. Rewrite Jest types mock to exact 0.8.0 surface**
  - Replace `src/__mocks__/@hamster-note/types.ts` with 0.8.0-compatible mock
  - Include `IntermediateImage`, `IntermediateContent`, `getContent`, `hasLoadedContent`
  - Remove stale 0.7 aliases
  - **Agent**: quick | **Blocks**: Tasks 3, 6, 7, 8, 9, 10

### Wave 2: Core Migration

- [x] **3. Migrate source and tests from text API to content API**
  - Replace `texts/getTexts/setGetTexts/hasLoadedTexts` with `content/getContent/setGetContent/hasLoadedContent`
  - Update `src/pdfParser.ts`, tests, demo factories
  - **Agent**: deep | **Blocks**: Tasks 6, 7, 9, 10

- [x] **4. Build bounded pdfjs image extraction spike and graphics-state model**
  - Add image extraction module using `getOperatorList()`
  - Track graphics state stack, CTM transforms
  - Support `paintImageXObject`, `paintInlineImageXObject`
  - Generate warnings for unsupported constructs
  - **Agent**: ultrabrain | **Blocks**: Tasks 5, 6, 12

- [x] **5. Implement image data URL conversion policy without native dependencies**
  - Convert pdfjs decoded image objects to `data:image/*;base64`
  - Use pure JS PNG encoding (inline minimal encoder)
  - Avoid `canvas`/`sharp`
  - **Agent**: deep | **Blocks**: Tasks 6, 7, 8, 10, 12

### Wave 3: Encode/Decode

- [x] **6. Produce mixed `IntermediatePage.content` during encode**
  - Combine `IntermediateText` and `IntermediateImage` into ordered `content[]`
  - Text items include `opacity` defaulting to `1`
  - Images include stable IDs, `src`, polygon, opacity
  - **Agent**: deep | **Blocks**: Tasks 7, 8, 10, 11, 12, 13

- [x] **7. Decode mixed content in original order with pdf-lib**
  - Replace text-only decode with content-order rendering
  - Dispatch each item to text or image drawing
  - Embed PNG/JPEG data URLs through pdf-lib
  - **Agent**: deep | **Blocks**: Tasks 10, 11, 12, 13

- [x] **8. Align thumbnail and cover semantics with 0.8.0 `IntermediateImage`**
  - Update `getThumbnail()`/`getCover()` to return `IntermediateImage | undefined`
  - Use page rendered screenshots as `IntermediateImage.src`
  - Update decode background handling
  - **Agent**: quick | **Blocks**: Tasks 9, 10, 11, 13

### Wave 4: Integration

- [x] **9. Update demo progressive serialization for content and image summaries**
  - Call `page.getContent()` instead of `getTexts()`
  - Add `imageCount` and content/cover diagnostics
  - Ensure demo consumers remain stable
  - **Agent**: quick | **Blocks**: Tasks 10, 11, 13

- [x] **10. Expand fixtures and tests for image/content edge cases**
  - Add tests for no-image PDF, text+image PDF
  - Test lazy `getContent()` idempotency
  - Test unsupported mask/pattern fallback
  - **Agent**: deep | **Blocks**: Tasks 11, 12, 13

- [x] **11. Integrate verification scripts and package-level checks**
  - Wire `check:types` into verification pipeline
  - Adjust `verify-roundtrip.mjs`, `smoke-test.mjs`
  - Ensure all package scripts work
  - **Agent**: quick | **Blocks**: Task 13

### Wave 5: Finalization

- [x] **12. Harden unsupported image construct fallback behavior**
  - Convert spike findings into deterministic behavior
  - Structured warnings for unsupported constructs
  - Ensure encode/decode continue after warnings
  - **Agent**: deep | **Blocks**: Task 13

- [x] **13. Final migration sweep and evidence consolidation**
  - Repository-wide stale API check
  - Run complete verification command set
  - Save evidence artifacts
  - **Agent**: unspecified-high | **Blocks**: Final Verification

## Final Verification

- [x] **F1. Plan Compliance Audit** - oracle
- [x] **F2. Code Quality Review** - unspecified-high
- [x] **F3. Real Manual QA** - unspecified-high
- [x] **F4. Scope Fidelity Check** - deep

## Evidence Files

所有任务证据保存在 `specs/` 目录下：

- `task-1-dependency-baseline.txt`
- `task-1-document-parser-compat.txt`
- `task-2-mock-surface.txt`
- `task-2-map-text-dir.txt`
- `task-3-removed-text-api.txt`
- `task-3-text-extraction.txt`
- `task-4-image-operator-happy.txt`
- `task-4-unsupported-warning.txt`
- `task-5-rgba-data-url.txt`
- `task-5-no-native-deps.txt`
- `task-6-mixed-content-encode.txt`
- `task-6-no-image-pdf.txt`
- `task-7-decode-mixed-content.txt`
- `task-7-unsupported-image-src.txt`
- `task-8-thumbnail-intermediate-image.txt`
- `task-8-cover-serialization.txt`
- `task-9-demo-serializer.txt`
- `task-9-demo-ui.txt`
- `task-10-mixed-fixture.txt`
- `task-10-lazy-content-idempotent.txt`
- `task-11-type-and-test.txt`
- `task-11-package-verification.txt`
- `task-12-extraction-warning.txt`
- `task-12-decode-warning.txt`
- `task-13-final-sweep.txt`
- `task-13-full-verification.txt`
- `task-13-f1-fixes.txt`
- `task-f2-fixes.txt`
