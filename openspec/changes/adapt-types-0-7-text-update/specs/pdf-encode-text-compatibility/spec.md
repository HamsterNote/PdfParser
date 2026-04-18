## ADDED Requirements

### Requirement: Encode 输出必须符合 `Text` 0.7.0 契约
`PdfParser.encode` SHALL 生成与 `@hamster-note/types` `0.7.0` 版 `Text` 定义兼容的文本节点，使调用方可以直接把返回的 `IntermediateDocument` 交给新版类型系统、序列化链路和 decode 链路消费，而无需额外补字段、改字段名或做形状修复。

#### Scenario: 对包含文本内容的 PDF 执行 encode
- **WHEN** 调用方对一个可以提取文本项的 PDF 执行 `PdfParser.encode`
- **THEN** 返回的 `IntermediateDocument` 中每个文本节点都必须满足 `@hamster-note/types` `0.7.0` 版 `Text` 的必填字段与字段类型约束
- **THEN** 调用方不得依赖额外的兼容映射、字段重命名或类型断言，才能把这些文本节点继续交给后续流程消费

### Requirement: Encode 输出必须保留新版文本节点的渲染关键度量
`PdfParser.encode` MUST 在文本节点中保留 decode 重建 PDF 所需的渲染关键数据，并对新版契约要求但原始 pdf.js 文本项未显式提供的字段写入稳定、可预测的归一化结果。

#### Scenario: 从 pdf.js 文本项构造中间文本节点
- **WHEN** `PdfParser.encode` 把 pdf.js 文本项映射为中间文本节点
- **THEN** 每个文本节点必须包含可支撑后续渲染的文本内容、坐标、尺寸和排版度量
- **THEN** 对新版 `Text` 契约要求但源数据缺省的方向、布尔标记或样式字段，系统必须写入稳定默认值或归一化结果

### Requirement: Encode 结果必须可通过新版类型序列化链路往返
`PdfParser.encode` SHALL 输出可被 `@hamster-note/types` `0.7.0` 的序列化与反序列化流程稳定处理的文本结构，且往返后不得丢失 decode 所需的渲染关键字段。

#### Scenario: 对 encode 结果执行新版类型序列化往返
- **WHEN** 调用方把 `PdfParser.encode` 的结果交给 `@hamster-note/types` `0.7.0` 的序列化与反序列化流程处理
- **THEN** 解析得到的文本节点仍必须保持与新版 `Text` 契约兼容的字段形状
- **THEN** 后续对该结果执行 `PdfParser.decode` 时，不得因序列化往返而失去生成可预览 PDF 所需的文本字段
