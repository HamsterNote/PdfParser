## Requirements

### Requirement: Decode 返回可重建 PDF 的二进制结果
`PdfParser.decode` SHALL 使用 `pdf-lib` 基于 `IntermediateDocument` 的结构化页面信息生成新的 PDF，并返回一份可直接用于预览或保存的 `ArrayBuffer`。

#### Scenario: 对 encode 结果执行 decode
- **WHEN** 调用方把一次成功 `encode` 得到的 `IntermediateDocument` 传给 `PdfParser.decode`
- **THEN** 返回值必须是一个 `ArrayBuffer`
- **THEN** 该结果的 `byteLength` 必须大于 0
- **THEN** 调用方必须能够使用该结果构造 `application/pdf` 的 `Blob`

#### Scenario: 对结构完整的中间文档执行 decode
- **WHEN** 调用方传入一个包含页面尺寸与文本内容的 `IntermediateDocument`，即使它不是当前运行时里原始 encode 返回的同一个实例
- **THEN** `PdfParser.decode` 也必须尝试基于这些结构化数据生成新的 PDF
- **THEN** 生成过程不得依赖原始 PDF 字节缓存

### Requirement: Decode 对不受支持的文档返回空结果
当输入的 `IntermediateDocument` 缺少可用于生成 PDF 的页面结构，或页面尺寸无效导致无法构建预览结果时，`PdfParser.decode` MUST 返回空结果，而不是伪造、猜测或输出损坏的 PDF 内容。

#### Scenario: 对缺少可用页面结构的文档执行 decode
- **WHEN** 调用方传入一个没有页面、页面尺寸非法，或无法导出任何有效页面内容的 `IntermediateDocument`
- **THEN** `PdfParser.decode` 必须返回 `undefined`

### Requirement: Decode 成功结果必须与内部缓存隔离
`PdfParser.decode` SHALL 在每次成功调用时返回新的二进制结果，避免调用方对上一次返回值的修改污染后续 decode 结果。

#### Scenario: 调用方修改首次 decode 的返回值
- **WHEN** 调用方在第一次成功 decode 后修改返回的 `ArrayBuffer` 内容并再次对同一 `IntermediateDocument` 执行 decode
- **THEN** 第二次 decode 必须返回一份新的 `ArrayBuffer`
- **THEN** 第二次 decode 的结果必须仍然是可用的 PDF 内容，不受第一次返回值修改的影响
