## Why

`@hamster-note/types` 0.7.0 对 `Text` 类型做了破坏性调整，当前 `@hamster-note/pdf-parser` 仍依赖 0.5.1，导致 encode/decode 产出的中间文本结构与上游类型约定不再一致。现在需要先通过一次显式变更定义兼容边界，避免升级依赖后出现类型错误、运行时字段缺失或下游解析失败。

## What Changes

- 将 `@hamster-note/types` 从 `^0.5.1` 升级到 `^0.7.0`。
- **BREAKING** 调整 `PdfParser.encode` 生成的中间文本映射逻辑，使输出符合新版 `Text` 类型定义。
- **BREAKING** 调整 `PdfParser.decode` 与相关辅助逻辑，使其能够消费新版文本结构并保持 PDF 重建能力。
- 更新测试、mock 和示例工程依赖，确保类型契约与运行时行为同步。

## Capabilities

### New Capabilities
- `pdf-encode-text-compatibility`: 规定 `PdfParser.encode` 输出的文本节点必须兼容 `@hamster-note/types` 0.7.0 的新版 `Text` 定义。

### Modified Capabilities
- `pdf-decode-output`: 调整 decode 对中间文本结构的兼容要求，确保新版 `Text` 定义下仍能生成可预览的 PDF 结果。

## Impact

- 受影响代码：`src/pdfParser.ts` 及其文本映射、页面解析、decode 渲染相关逻辑。
- 受影响测试与 mock：`src/__tests__/*`、`src/__mocks__/@hamster-note/types.ts`。
- 受影响依赖：根 `package.json`、锁文件，以及 `demo/vite-fixture` 中对 `@hamster-note/types` 的版本约束。
- 受影响系统：依赖 `IntermediateDocument` / `IntermediateText` 文本结构的 encode、decode 与 demo 预览链路。
