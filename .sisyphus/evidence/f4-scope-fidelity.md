# F4 Scope Fidelity Check

## In-Scope Behavior
- **仅接线 decode，不扩展职责**：`PdfParser.decode()` 只做校验并调用内部渲染服务（`src/pdfParser.ts:70-77`，`src/pdfParser.ts:79-91`）。
- **页面尺寸来自 IntermediateDocument**：渲染时通过 `getPageSizeByPageNumber(pageNumber)` 取尺寸并 `addPage({ size: [x, y], margin: 0 })`（`src/services/pdfDocumentRenderer.ts:77-86`）。
- **文本内容按坐标落版**：对每个 `page.texts` 项调用 `fontSize(...).text(content, x, y, { lineBreak: false })`（`src/services/pdfDocumentRenderer.ts:88-104`）。
- **页序按 pageNumbers 升序**：`[...document.pageNumbers].sort((l, r) => l - r)` 后逐页渲染（`src/services/pdfDocumentRenderer.ts:71-76`）。

## Out-of-Scope Behavior Confirmed Absent
- **decode 渲染路径未实现 metadata/outline/bookmark 恢复**：`pdfDocumentRenderer.ts` 中检索 `metadata|outline|bookmark` 无匹配；decode 仅调用该渲染服务（`src/pdfParser.ts:70-77`）。
- **decode 渲染路径未实现样式恢复**：`pdfDocumentRenderer.ts` 中检索 `fontFamily|fontWeight|italic|color|rotate|skew|vertical` 无匹配；仅使用 `content + x/y + fontSize` 绘制（`src/services/pdfDocumentRenderer.ts:88-104`）。
- **无浏览器 decode 兼容承诺/实现**：`pdfDocumentRenderer.ts` 检索 `window|navigator|workerSrc|browser` 无匹配。
- **无 decode 相关越界公开 API**：`src/index.ts` 未导出 `pdfDocumentRenderer` 或 `renderIntermediateDocumentToPdfBuffer`，也无新增 decode 平行 API（`src/index.ts:1-58`，grep `pdfDocumentRenderer|renderIntermediateDocumentToPdfBuffer|decode` 无匹配）。
- **未见 decode 无关重构信号（就本次核查范围文件）**：实现集中在 `src/pdfParser.ts` 与 `src/services/pdfDocumentRenderer.ts`，测试集中于 decode/renderer 相关用例。

## Error Path And Fallback Strategy
- **空文档报错文案固定**：`validateIntermediateDocumentForDecode` 在 `!document`、`pageCount<=0`、`pageNumbers.length===0` 三处都抛 `cannot decode empty document`（`src/pdfParser.ts:82-90`）。
- **测试锁定空文档错误**：`pdfParserDecode.test.ts` 显式断言错误文案包含 `cannot decode empty document`（`src/__tests__/pdfParserDecode.test.ts:73-85`）。
- **非法文本跳过**：空白内容与非法坐标直接 `continue`（`src/services/pdfDocumentRenderer.ts:91-97`）。
- **字体大小回退**：`fontSize<=0` 时回退 `Math.max(height, lineHeight, 12)`（`src/services/pdfDocumentRenderer.ts:112-123`）。
- **单条文本失败不拖垮整页/整文档**：文本绘制 `try/catch` 后继续（`src/services/pdfDocumentRenderer.ts:101-107`）。
- **文本顺序不重排**：逐项 `for (const text of page.texts)` 渲染，无任何文本排序逻辑（`src/services/pdfDocumentRenderer.ts:88-109`）；测试也校验 `alpha` 在 `beta` 前（`src/__tests__/pdfDocumentRenderer.test.ts:74-76`）。

## Public API Surface
- `src/index.ts` 公开入口保持原有聚合导出，decode 内部渲染服务未暴露（`src/index.ts:1-58`）。
- `PdfParser.decode` 仍为 `PdfParser` 静态方法，未新增 renderer 或 decode 平行公开 API（`src/pdfParser.ts:70-77`）。

VERDICT: APPROVE
