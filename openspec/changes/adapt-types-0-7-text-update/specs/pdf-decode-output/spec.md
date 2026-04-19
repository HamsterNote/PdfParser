## MODIFIED Requirements

### Requirement: Decode 返回可重建 PDF 的二进制结果
`PdfParser.decode` SHALL 使用 `pdf-lib` 基于 `IntermediateDocument` 的结构化页面信息与符合 `@hamster-note/types` `0.7.0` 契约的文本节点生成新的 PDF，并返回一份可直接用于预览或保存的 `ArrayBuffer`。

#### Scenario: 对 encode 结果执行 decode
- **WHEN** 调用方把一次成功 `encode` 得到的 `IntermediateDocument` 传给 `PdfParser.decode`
- **THEN** 返回值必须是一个 `ArrayBuffer`
- **THEN** 该结果的 `byteLength` 必须大于 0
- **THEN** 调用方必须能够使用该结果构造 `application/pdf` 的 `Blob`

#### Scenario: 对符合新版文本契约的结构化中间文档执行 decode
- **WHEN** 调用方传入一个包含页面尺寸与符合 `@hamster-note/types` `0.7.0` `Text` 定义的文本节点的 `IntermediateDocument`，即使它不是当前运行时里原始 encode 返回的同一个实例
- **THEN** `PdfParser.decode` 也必须尝试基于这些结构化数据生成新的 PDF
- **THEN** 生成过程不得依赖原始 PDF 字节缓存
- **THEN** 生成过程不得要求调用方先把文本节点转换回旧版字段形状

### Requirement: Decode 对不受支持的文档返回空结果
当输入的 `IntermediateDocument` 缺少可用于生成 PDF 的页面结构，或文本节点虽处于新版 `Text` 容器结构中但缺少渲染必需字段、字段值非法，导致无法构建预览结果时，`PdfParser.decode` MUST 返回空结果，而不是伪造、猜测或输出损坏的 PDF 内容。

#### Scenario: 对缺少可用页面结构的文档执行 decode
- **WHEN** 调用方传入一个没有页面、页面尺寸非法，或无法导出任何有效页面内容的 `IntermediateDocument`
- **THEN** `PdfParser.decode` 必须返回 `undefined`

#### Scenario: 对缺少渲染关键文本度量的新版文档执行 decode
- **WHEN** 调用方传入的 `IntermediateDocument` 文本节点满足新版 `Text` 的基本容器结构，但缺少生成 PDF 所必需的文本内容、坐标、字号、行高或尺寸字段，或这些字段值非法
- **THEN** `PdfParser.decode` 必须返回 `undefined`
