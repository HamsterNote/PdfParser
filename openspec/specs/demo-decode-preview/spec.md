## Requirements

### Requirement: Demo 必须在 Decode 区域展示明确状态
Demo 的 Decode 区域 SHALL 为用户展示可区分的状态反馈，以明确当前是否可执行 decode、是否正在处理，以及结果属于成功、空结果还是失败。

#### Scenario: 用户尚未获得可用的 encode 结果
- **WHEN** 页面初始加载、用户切换输入文件，或最近一次 encode 失败导致没有可用的 `IntermediateDocument`
- **THEN** Decode 区域必须展示不可预览的空闲提示
- **THEN** 页面不得继续显示上一轮 decode 成功留下的 PDF 预览内容

### Requirement: Demo 必须以内嵌方式预览 decode 成功结果
当 decode 成功返回 PDF 二进制时，Demo SHALL 将结果转换为浏览器可加载的预览资源，并在页面中以内嵌 PDF 的方式展示还原结果。

#### Scenario: decode 成功返回 PDF 字节
- **WHEN** 用户在 demo 中触发 decode 且 `PdfParser.decode` 返回有效的 `ArrayBuffer`
- **THEN** 页面必须创建可被浏览器加载的 PDF 预览资源
- **THEN** 页面必须在 Decode 区域渲染内嵌 PDF 预览容器
- **THEN** 用户必须能够直接在该区域看到还原后的 PDF 内容

### Requirement: Demo 必须区分空结果与错误结果
Demo MUST 将“decode 没有可预览内容”和“decode 过程失败”区分为不同反馈，避免用户把功能无响应、空结果和异常混为一谈。

#### Scenario: decode 返回空结果
- **WHEN** 用户触发 decode 且 `PdfParser.decode` 返回 `undefined` 或 0 字节结果
- **THEN** Decode 区域必须展示“无可预览结果”类反馈
- **THEN** 页面不得渲染成功态的 PDF 预览

#### Scenario: decode 过程中发生异常
- **WHEN** 用户触发 decode 且 `PdfParser.decode` 抛出异常，或预览资源创建/加载失败
- **THEN** Decode 区域必须展示错误反馈
- **THEN** 页面不得保留误导性的成功态预览

### Requirement: Demo 必须在状态切换时替换旧预览资源
Demo SHALL 在新的 decode 结果出现或当前 encode 上下文失效时，移除旧的预览资源与旧的展示内容，确保页面始终只反映当前一次有效的 decode 结果。

#### Scenario: 用户重新 encode 或切换到新的输入来源
- **WHEN** 用户重新选择文件、加载新的 sample，或基于同一页面重新完成一次新的 encode
- **THEN** 页面必须清除上一轮 decode 生成的预览内容
- **THEN** 后续只有当前上下文产生的新 decode 结果可以重新进入成功预览态
