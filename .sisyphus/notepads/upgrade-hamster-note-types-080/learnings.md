# Task Learnings

## Conventions
- 项目使用 yarn
- 测试使用 Jest 30 + ts-jest ESM
- 类型检查使用 `check:types` = `tsc --noEmit`

## Decisions
- 

## Issues
- 

## Problems
- 

## 2026-05-23 Task 1 dependency baseline
- package.json now pins @hamster-note/types to 0.8.0 in dependencies and overrides; check:types is tsc --noEmit.
- Yarn 1 does not apply npm overrides, so package.json also uses resolutions @hamster-note/types=0.8.0 to force one installed version.
- yarn install --mode=skip-builds exits 0 and yarn why shows a single hoisted @hamster-note/types@0.8.0, but warns @hamster-note/document-parser@0.2.1 requested @hamster-note/types@^0.5.1.
- Installed @hamster-note/types@0.8.0 has declarations under dist/**/*.d.ts, including IntermediateImage, IntermediateContent, IntermediatePage.getContent(), hasLoadedContent, getThumbnail/getCover returning IntermediateImage | undefined, and polygon utilities in dist/utils/polygon.d.ts.
- yarn check:types exits 2 before source migration. No dependency-resolution failure, but project source/tests still use old 0.7/0.5 API names: texts/getTexts/textsLoaded/setGetTexts and string thumbnails/covers.

## 2026-05-23 Task 2 mock rewrite
- Rewrote src/__mocks__/@hamster-note/types.ts to match 0.8.0 surface
- Key changes: IntermediateImage class, IntermediateContent type, getContent/hasLoadedContent/setGetContent (replacing getTexts/setGetTexts/hasLoadedTexts), getThumbnail returns IntermediateImage | undefined, getCover returns IntermediateImage | undefined, polygon utilities, IntermediateText.opacity
- IntermediatePage constructor accepts both content (new) and texts (backward compat during transition)
- IntermediatePage.thumbnail is now IntermediateImageSerialized | undefined (not string)
- PolygonPoint = [number, number], Polygon = [PolygonPoint, PolygonPoint, PolygonPoint, PolygonPoint]
- mapTextDir.test.ts passes (12/12 tests)

## Task 3 - content API migration (2026-05-23T22:04:50+08:00)
- `IntermediatePage` 0.8 页面内容统一走 `content`/`getContent()`/`setGetContent()`；需要纯文本时使用 `IntermediateText` 或 `content` 字段过滤，避免把后续 image content 当文本处理。
- `src/pdfParser.ts` encode 产物现在写入 `content: texts` 并注册 `setGetContent()`；decode 路径通过 `getContent()` 取内容后过滤文本项。
- `demo/demoDocumentSerialization.js` 的页面摘要统计需先从 content 过滤文本，再计算 textCount/previewText。

## Task 4 - pdfjs image extraction spike (2026-05-23T23:10:00+08:00)
- `PdfParser.extractImagesFromPage()` 是 `@internal` 静态 helper；当前只供 Task 5/6 接入，不接入 encode 路径。
- helper 读取 `page.getOperatorList()` 并按序跟踪 `save`/`restore` 图形状态栈与 `transform`/可选 `setTransform` CTM，polygon 由 viewport transform * CTM 映射单位图片方块得到。
- `OPS.paintImageXObject` 通过 `page.objs.get(objId, callback)` 和 `withTimeout()` 解析 raw image data，统一归一化为 `Uint8Array`，`src` 保持 undefined 留给 Task 5。
- mask、inline image、repeat、Form XObject、transparent group、pattern/shading、SMask 均生成 deterministic warning record，不阻塞提取流程。
- `yarn test --runTestsByPath src/__tests__/imageExtraction.test.ts` 通过；`yarn check:types` 仍有既有 demo/test 类型迁移错误，非本任务新增。

## Task 5 - raw image PNG data URL conversion (2026-05-23)
- `PdfParser.convertRawImageToDataUrl()` 采用内联最小 PNG 编码器，避免 `canvas`/`sharp` 等原生依赖和新增包；编码流程为 raw kind 1/2/3 -> RGBA -> PNG signature/IHDR/IDAT/IEND。
- PNG IDAT 使用 zlib store/no-compression deflate block，配套 Adler-32 与 PNG chunk CRC-32，足够覆盖小型 raw image data URL 转换测试。
- `buildImageExtractionRecord()` 现在在保留 `rawImageData` 的同时设置 `record.src`；转换失败只返回 undefined 并 `console.warn`，不阻断图片记录生成。

## Task 6 - mixed encode content (2026-05-23)
- `buildIntermediatePage()` now emits mixed `IntermediateContent[]`: mapped `IntermediateText` items first, then `IntermediateImage` items from `extractImagesFromPage()` because pdfjs `getTextContent()` cannot reliably correlate text order with operator indices.
- Encode path explicitly defaults `IntermediateText.opacity` to `1`; image records map to `IntermediateImage({ id, src: record.src ?? "", polygon, opacity })`, so warning/no-src records remain represented with an empty src placeholder.
- Unit-test PDF page mocks may not implement `getOperatorList()`; `extractImagesFromPage()` returns `[]` for such lightweight mocks so existing encode concurrency/safeguard tests remain focused on page scheduling.
- Integration evidence saved at `.sisyphus/evidence/task-6-mixed-content-encode.txt` and `.sisyphus/evidence/task-6-no-image-pdf.txt`; targeted and full Jest suites pass.

## Task 7 - mixed decode content order (2026-05-23)
- Decode planning now stores `PdfPagePlan.content: IntermediateContent[]` instead of pre-batched `renderableTexts`, allowing pdf-lib rendering to preserve the original `IntermediatePage.content`/`getContent()` array order.
- Text drawing is dispatched per content item through existing font-run/metric logic; `IntermediateText.opacity` is normalized to `[0, 1]` and passed to `pdfPage.drawText()`.
- Image decode drawing accepts PNG/JPEG data URLs, embeds via pdf-lib, and uses polygon bounds directly for `{ x, y, width, height }`; unsupported image sources warn with the image id and are skipped without aborting decode.
- Targeted integration and full Jest suites pass after adding mixed text/image/text decode and unsupported image src decode scenarios; evidence saved under `.sisyphus/evidence/task-7-*.txt`.

## Task 9 demo serializer image summaries
- demo serializer now builds page summaries from page.getContent(), separates text items by content and image items by src, and emits textCount/imageCount without serializing image payloads in previewText.
- Targeted evidence saved to .sisyphus/evidence/task-9-demo-serializer.txt and .sisyphus/evidence/task-9-demo-ui.txt; targeted tests passed: 2 suites, 18 tests.
- Full npm test passed: 26 suites, 267 tests. Full npm run lint still reports pre-existing sonar issues in src/__mocks__/@hamster-note/types.ts and src/pdfParser.ts; modified demo files pass npx eslint individually.

## Task 9 review follow-up
- Post-implementation review passed across goal, QA, code quality, security, and context dimensions.
- Applied non-blocking hardening: resolvePageContent now treats non-array getContent() results as empty content, and demo diagnostics copy now says content resolution cost.
- Final targeted tests passed and evidence files refreshed. Full npm test passed; full lint remains blocked by unrelated existing sonar issues in src/__mocks__/@hamster-note/types.ts and src/pdfParser.ts.

## Task 10 image/content edge case tests - 2026-05-23
- `test_github.pdf` currently yields many `IntermediateImage` entries, but extracted `src` may be empty for unsupported raw image shapes; integration tests should assert mixed text+image presence separately from data URL validity.
- Deterministic `IntermediateImage` fixtures are the stable way to assert `src` starts with `data:image/`, 4-point polygon, and numeric opacity without relying on real PDF image object encodings.
- Unsupported image operators can be covered via mock `PDFPageProxy.getOperatorList()` using `OPS.paintImageMaskXObject`, `OPS.setFillColorN`, and `OPS.setGState` with `SMask`; expected behavior is warning records and no throw.

## Task 11 - Type and verification
- Fixed 0.8.0 type migration errors by narrowing renderable text metrics, guarding pdfjs document overrides spread, casting decode outputs to ArrayBuffer in integration tests, and typing demo test mocks/declarations.
- Replaced custom demo test page maps with IntermediatePageMap.makeByInfoList where possible to satisfy 0.8.0 private class shape.
- Split image extraction operator/state handling to satisfy sonar cognitive-complexity without changing behavior.
- Verification passed: yarn check:types, yarn test, yarn lint, yarn build:all. Evidence: .sisyphus/evidence/task-11-type-and-test.txt and .sisyphus/evidence/task-11-package-verification.txt.

## Task 12 unsupported image fallback hardening
- Image extraction warnings now use stable structured shape `{ type: 'unsupported', operator, page, objectId?, message }`.
- `buildIntermediatePage()` logs extraction warnings and continues producing `IntermediatePage` content.
- Unsupported decode image sources emit the same structured warning shape with operator `drawImageToPdfPage` and continue PDF generation when other renderable content exists.

## Task 13 final sweep
- Final stale grep only reports transitive yarn.lock regexp-ast-analysis ^0.7.0; no @hamster-note/types 0.7 API/range remains in package.json, src, or demo after updating demo/vite-fixture lockfile.
- Native dependency check for canvas/sharp passes.
- Full verification passed: yarn check:types && yarn test && yarn lint && yarn build:all.
- Evidence saved to .sisyphus/evidence/task-13-final-sweep.txt and task-13-full-verification.txt.

## Task F2 fixes - 2026-05-24T00:17:15+08:00
- Production console.warn/error usages in src/pdfParser.ts were replaced with internal warning collection or silent degradation.
- Existing tests still assert console.warn/console.error behavior, so yarn test fails unless tests are updated by the orchestrator/change owner to match the new no-console requirement.

## F2 console 输出移除后的测试修复
- 生产代码移除 console.warn/console.error 后，测试不应继续断言 console 调用；应断言返回值/输出产物仍满足行为契约。
- 不支持图片 src 的 decode 测试应验证返回 ArrayBuffer 且 byteLength > 0。
- raw image 不支持或空数据测试应验证 convertRawImageToDataUrl 返回 undefined。
- outline getPageIndex 异常测试应验证 buildPageDest 返回 undefined。
