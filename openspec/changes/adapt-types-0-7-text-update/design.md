## Context

`@hamster-note/pdf-parser` 当前依赖 `@hamster-note/types` `^0.5.1`，而本次变更目标是升级到 `^0.7.0`。现有实现中，`PdfParser.encode` 通过 `mapTextContentToIntermediate` 直接构造 `IntermediateText`，`PdfParser.decode` 则通过 `buildRenderableTexts` 消费文本节点的坐标、字号和内容后重建 PDF。类型升级会同时影响两条链路：一条是 encode 端的文本节点构造，一条是 decode 端对中间文本结构的消费。

当前文本映射逻辑集中在 `src/pdfParser.ts`：

- `encode` → `buildPageInfoList` → `mapTextContentToIntermediate`
- `decode` → `resolveIntermediatePages` / `resolvePageTexts` → `buildRenderableTexts`

测试和 mock 也与旧类型契约强绑定：`src/__mocks__/@hamster-note/types.ts` 自行实现了 `IntermediateText` / `IntermediateDocument`，`src/__tests__/mapTextContentToIntermediate.test.ts` 与 `src/__tests__/pdfParserIntegration.test.ts` 则验证 encode / decode 的关键行为。如果只升级依赖而不统一调整构造逻辑、消费逻辑和测试替身，TypeScript 编译、运行时字段访问以及集成测试都会失真。

## Goals / Non-Goals

**Goals:**
- 将 `@hamster-note/types` 升级到 `^0.7.0`，并让源码、测试、demo 依赖保持一致。
- 明确 `PdfParser.encode` 输出文本节点对新版 `Text` 类型的适配边界，避免在多个调用点分散拼装字段。
- 保持 `PdfParser.decode` 对新版中间文本结构的可消费性，继续生成可预览的 PDF 内容。
- 让 mock、单测、集成测试与新版类型契约同步，避免“测试通过但真实类型已失配”的情况。

**Non-Goals:**
- 不改变 `PdfParser` 的公开方法签名或引入新的解析模式。
- 不在本次变更中优化文本排版精度、字体嵌入策略或缩略图渲染效果。
- 不为旧版 `@hamster-note/types` 增加双版本兼容层；升级后以 0.7.0 作为唯一契约。

## Decisions

### 1. 以 `src/pdfParser.ts` 内部适配层作为唯一类型升级边界

在 `PdfParser.encode` 中，继续由 `mapTextContentToIntermediate` 负责把 pdf.js 的 `TextItem` 转成中间文本节点，但不再把新版字段映射散落到多个调用点。具体做法是将新版 `Text` 所需字段的归一化收敛到单一构造路径中，必要时引入私有 helper 来负责：

- 计算基础度量（`fontSize`、`lineHeight`、`width`、`height`、`ascent`、`descent`）
- 归一化方向、布尔标记和默认样式值
- 生成兼容 0.7.0 的 `IntermediateText` 入参

这样可以把升级影响限制在 encode 的单一出口，后续如果 `@hamster-note/types` 再次调整字段，也只需要改动一处。

**备选方案：** 直接在 `mapTextContentToIntermediate` 内继续内联拼装所有字段。  
**不采用原因：** 当前构造字段已经较多，且 encode / mock / 测试都需要共享同一套契约认知，继续内联会放大维护成本。

### 2. decode 端采用“最小可渲染字段集”消费新版文本结构

`buildRenderableTexts` 当前只真正依赖 `content`、`fontSize`、`height`、`lineHeight`、`x`、`y`。本次升级不让 decode 反向依赖新版 `Text` 的全部细节，而是继续坚持“最小可渲染字段集”策略：

- 对新版新增但与绘制无关的字段不在 decode 中参与业务逻辑判断
- 对坐标、字号、行高等核心渲染字段继续做数值归一化与兜底
- 保持 `resolveIntermediatePages` / `resolvePageTexts` 的容错路径，避免因字段缺省导致整个页面丢弃

这样可以把 decode 逻辑与上游文本模型的扩展解耦，只在真正影响绘制的字段上建立硬依赖。

**备选方案：** 在 decode 前增加一层完整的新版 `Text` → 渲染 DTO 转换对象。  
**不采用原因：** 当前 decode 消费面很窄，额外引入完整 DTO 层会增加样板代码，收益不足。

### 3. 同步更新 Jest mock，使测试直接反映 0.7.0 契约

`jest.config.js` 已将 `@hamster-note/types` 指向 `src/__mocks__/@hamster-note/types.ts`。这意味着升级不能只改生产代码，还必须同步调整 mock 的构造参数、序列化 / 解析行为与实例属性，确保测试替身与真实类型在字段形状上保持一致。

mock 更新原则：

- 优先与 0.7.0 的公开构造方式和字段约束对齐
- 保持现有测试所需的最小行为实现，避免把真实包的全部内部逻辑复制进 mock
- 在必须新增字段时提供稳定默认值，保证历史测试案例能聚焦行为差异而不是样板初始化

**备选方案：** 删除 mock，直接在测试中引用真实 `@hamster-note/types`。  
**不采用原因：** 现有测试依赖可控的 mock 行为与序列化接口，直接切到真实包会放大测试耦合，并增加定位失败原因的成本。

### 4. 先锁定能力契约，再更新依赖与验证链路

实施顺序采用“契约适配 → 测试同步 → 依赖升级验证”的顺序，而不是先盲目升级依赖。具体顺序：

1. 根据 0.7.0 实际类型定义调整文本节点构造与 mock 结构
2. 更新 encode / decode 单测与集成测试断言
3. 升级 `package.json`、锁文件及 demo 依赖解析结果
4. 运行 `npm test && npm run lint`，必要时再补跑 demo 构建验证

这样做可以更快定位问题属于“契约不匹配”还是“包版本解析”导致。

**备选方案：** 先升级依赖再逐步修编译错误。  
**不采用原因：** 会把类型错误、mock 失真和行为回归混在一起，回归路径更长。

## Risks / Trade-offs

- **[新版 `Text` 必填字段或默认值与预期不一致]** → 在正式编码前先对照 0.7.0 的真实类型定义校准 helper 与 mock，不以旧版字段名做推断性迁移。
- **[mock 与真实包再次漂移]** → 将 mock 调整聚焦在公开构造契约和测试必需行为，并通过集成测试覆盖 encode / decode 主链路。
- **[decode 端忽略的字段在 0.7.0 中变成渲染必要条件]** → 为 `buildRenderableTexts` 增加针对缺省值与异常值的回退策略，必要时补充专门测试证明最小字段集足够渲染。
- **[依赖升级影响 demo 或打包结果]** → 在主测试链路通过后补跑 demo 构建，确认浏览器侧对新版类型与 pdf.js 组合没有额外编译问题。
- **[一次性移除旧契约导致下游调用方感知 BREAKING]** → 在 changelog 和变更说明中明确记录升级目标与破坏性影响，避免消费者误以为是透明升级。

## Migration Plan

1. 对照 `@hamster-note/types` 0.7.0 的真实 `Text` / `IntermediateText` 定义，确认新增、删除或重命名字段。
2. 修改 `src/pdfParser.ts` 中的文本构造与消费逻辑，使 encode 输出和 decode 输入都以 0.7.0 为准。
3. 更新 `src/__mocks__/@hamster-note/types.ts`，同步调整测试替身的构造、序列化与解析逻辑。
4. 更新 `src/__tests__` 中与文本节点结构相关的断言，确保单测和集成测试覆盖新契约。
5. 升级 `package.json` 与锁文件中的 `@hamster-note/types` 版本，并验证 demo 依赖解析结果。
6. 执行 `npm test && npm run lint`；如依赖升级影响前端示例，再执行 `npm run verify:vite`。

**Rollback Strategy:**
- 若升级后发现新版 `Text` 契约无法在现有 decode 模型内稳定消费，先回退依赖版本与 mock 变更，保留设计文档和规格文档，待补齐字段映射策略后再重新实施。

## Open Questions

- `@hamster-note/types` 0.7.0 的 `Text` 是否引入了新的必填样式或变换字段，需要 encode 提供明确默认值？
- 新版类型是否改变了 `serialize` / `parse` 对文本节点的字段顺序或必需属性，从而要求同步调整 mock 的序列化格式？
- demo 工程是否需要显式声明 `@hamster-note/types` 版本，还是继续依赖主包传递依赖即可满足验证需求？
