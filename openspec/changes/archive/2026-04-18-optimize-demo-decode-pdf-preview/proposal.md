## Why

当前 demo 已经具备 Decode 状态反馈和 PDF 预览能力，但 `PdfParser.decode` 仍然只是返回缓存中的原始 PDF 字节副本，不是真正基于中间结构重建 PDF。既然当前需求明确要求用 `pdf-lib` 这个 npm 库完成 decode，就需要把 parser 侧实现切换为“根据 `IntermediateDocument` 生成新 PDF”，让 decode 链路真正可验证。

## What Changes

- 为 PDF 解析器接入 `pdf-lib`，基于 `IntermediateDocument` 页面与文本结构重建新的 PDF 二进制结果。
- 优化 demo 的 Decode 展示区：将 decode 得到的 `ArrayBuffer` 转为 `Blob` 与对象 URL，并通过 `iframe` 使用浏览器原生 PDF 能力展示还原结果。
- 在 demo 中补充 decode 成功、失败和空结果的状态反馈，避免用户将不可预览状态误判为无响应。

## Capabilities

### New Capabilities
- `pdf-decode-output`: 定义 `PdfParser.decode` 输出可用于重建 PDF 文件内容的二进制结果。
- `demo-decode-preview`: 定义 demo 如何把 decode 结果转成可预览资源，并在页面中以内嵌 PDF 方式展示。

### Modified Capabilities
- 无

## Impact

- 受影响代码：`src/pdfParser.ts`、`src/browser.ts`、`rolldown.config.ts`、`demo/demo.js`、`demo/demoPreview.js`、`demo/encode.html`，以及相关样式与测试文件。
- 受影响系统：浏览器 demo 的 decode 交互流程、PDF 预览展示区域、对象 URL 生命周期管理。
- 依赖与兼容性：新增 `pdf-lib` 运行时依赖；继续依赖浏览器原生 PDF/iframe 支持，不破坏现有 encode 流程。
