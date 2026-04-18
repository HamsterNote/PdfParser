## Context

当前 demo 已经具备 Decode 区域状态切换和 iframe 预览能力，但 `PdfParser.decode` 仍然只是返回缓存中的原始 PDF 字节副本，本质上并没有“根据中间结构重建 PDF”。用户已明确要求 decode 使用 `pdf-lib` 这个 npm 库完成 PDF 生成，因此本次变更需要把 parser 侧设计从“返回原始字节”调整为“基于 `IntermediateDocument` 结构重建一个新的可预览 PDF”。

结合现有实现，有几个关键约束：

- `IntermediateDocument` 已包含页面尺寸、文本内容、位置、字体大小等基础信息，足以生成“可阅读、可预览”的新 PDF，但不足以无损恢复原始绘制指令、字体资源和图片流。
- `demo/demo.js` 当前已经保存最近一次 encode 成功得到的 `IntermediateDocument`，并具备 decode 成功/空结果/错误结果的状态机，这些能力可以继续复用。
- 浏览器 demo 必须继续使用 `dist/browser.js`，不能把 Node 入口带入浏览器 bundle。
- `pdf-lib` 在浏览器和 Node 都可运行，但标准字体只覆盖 Latin-1；若文本中存在标准字体不支持的字符，需要显式降级或替换，避免 decode 直接抛错。

本次变更的核心是：让 `decode` 真正基于中间结构生成一个新的 PDF，并保证 demo 能稳定预览这份新 PDF。

## Goals / Non-Goals

**Goals:**

- 使用 `pdf-lib` 基于 `IntermediateDocument` 生成新的 PDF 二进制结果。
- 让 `decode` 不再依赖同一运行时中的原始 PDF 字节缓存，结构完整的 `IntermediateDocument` 即可参与 decode。
- 保持 demo 的 Decode 状态机、iframe 预览与对象 URL 生命周期管理正常工作。
- 在现有 demo 和测试中验证 decode 输出是有效 PDF，并且多次 decode 的结果互不污染。

**Non-Goals:**

- 不追求字节级还原原始 PDF。
- 不引入完整排版引擎，不尝试恢复图片、矢量路径、注释、书签等高级 PDF 特性。
- 不在本次变更中接入自定义字体资源包或 `@pdf-lib/fontkit`。
- 不修改 demo 的 JSON 展示结构。

## Decisions

### 1. 使用 `pdf-lib` 从 `IntermediateDocument` 重建 PDF

`PdfParser.decode` 改为：读取 `IntermediateDocument` 中的页面列表，为每个页面创建同尺寸的 pdf-lib 页面，并按文本项逐条调用 `drawText` 写回新 PDF，最后通过 `pdfDoc.save()` 得到新的 `Uint8Array`，再转换为 `ArrayBuffer` 返回。

这样做的原因：

- 满足“decode 必须使用 `pdf-lib`”这一明确要求。
- 不再依赖 encode 过程中保留的原始 PDF 字节缓存。
- `pdf-lib` 原生支持浏览器/Node 双环境，输出结果可以直接接入 demo 现有的 Blob/iframe 预览链路。

备选方案对比：

- **继续返回原始 PDF 字节副本**：虽然简单，但不满足用户对 `pdf-lib` 的要求，也不是真正的 decode。
- **加载原始 PDF 再用 `copyPages` 复制到新文档**：仍然依赖原始字节缓存，本质上没有脱离旧设计。

### 2. 采用标准字体 + 字符降级策略，优先保证 decode 可完成

本次先使用 `StandardFonts.Helvetica` 作为默认字体。对于超出标准字体字符集的字符，使用安全降级字符（如 `?`）替换，避免 `drawText` 因字符不受支持而中断整个 decode 过程。

这样做的原因：

- 不引入新的字体资源和 fontkit 依赖，控制实现复杂度。
- sample PDF 和当前 demo 主要用于链路演示，优先级是“能生成、能预览、能回归”。

备选方案对比：

- **直接嵌入自定义字体**：字符支持更完整，但会新增字体资源管理、体积和依赖复杂度。
- **遇到不支持字符直接跳过整条文本**：实现简单，但会导致信息丢失更明显。

### 3. 保留现有 demo 状态机与 iframe 预览实现

demo 侧已经具备 `idle`、`loading`、`success`、`empty`、`error` 状态和对象 URL 生命周期管理。本次主要保持这些交互不变，只让它消费新的 decode 输出。

这样做的原因：

- demo 状态逻辑已经满足本次交互目标，无需重复改造。
- 变更可以集中在 parser 侧和测试侧，降低回归风险。

### 4. 继续保留空结果与错误结果区分

当 `IntermediateDocument` 没有可用页面、页面尺寸非法，或最终没有可写入的 PDF 内容时，`decode` 返回 `undefined`，demo 进入 `empty` 状态；当 `pdf-lib` 生成过程抛错时，demo 进入 `error` 状态。

这样做的原因：

- 保持现有 spec 中对空结果/错误结果分离的要求。
- 便于调试“输入不完整”和“实现异常”这两类问题。

## Risks / Trade-offs

- **[风险] 重新生成的 PDF 与原始 PDF 版式不完全一致** → **缓解**：在 spec 中明确目标是“可预览、可验证”的新 PDF，而不是字节级还原。
- **[风险] 标准字体不支持部分字符** → **缓解**：对不支持字符做降级替换，优先保证 decode 不失败；后续如有需要再单独设计字体嵌入方案。
- **[风险] 文本坐标从顶部坐标系映射到底部坐标系时可能存在细微偏移** → **缓解**：基于页面高度、字体大小和文本高度做统一换算，并以 demo 预览可读性作为验收标准。
- **[风险] 浏览器入口误引用 Node bundle 会导致 `node:*` 加载失败** → **缓解**：保留专用 `src/browser.ts` 与 `dist/browser.js` 入口，并将其纳入构建与手动验证步骤。

## Migration Plan

这是一次 parser decode 路径的实现替换，无需数据迁移。

实施顺序：

1. 更新 OpenSpec 文档，将 decode 方案改为 `pdf-lib` 重建 PDF。
2. 引入 `pdf-lib` 依赖，并在 `PdfParser.decode` 中实现页面/文本写回逻辑。
3. 调整测试，验证 decode 返回的是有效 PDF、空文档返回 `undefined`、多次 decode 结果互不污染。
4. 保持 demo 预览链路可用，重新执行构建、测试、lint，并手动验证 sample PDF 的 encode → decode → 预览链路。

回滚方式：

- 若 `pdf-lib` 方案验证失败，可回退到当前变更前的 decode 静态占位态。
- 若 parser 侧能稳定输出，但 demo 兼容性有问题，可保留 parser 侧实现，临时关闭 demo 的 Decode 入口。

## Open Questions

- 当前阶段先不处理 Unicode / 中文文本的完整保真问题；若后续有明确需求，需要单独设计字体嵌入与字符覆盖方案。
