# Design: Upgrade @hamster-note/types to 0.8.0

## Context

项目使用 yarn 作为包管理器，Jest 30 + ts-jest ESM 作为测试框架。类型检查通过 `check:types` (`tsc --noEmit`) 执行。

0.8.0 版本引入了 `IntermediateContent` 联合类型，将页面内容从纯文本扩展为支持文本和图片的混合内容。这要求：
1. 所有页面内容访问从 `texts/getTexts` 迁移到 `content/getContent`
2. 新增图片提取和编码路径
3. thumbnail/cover 语义从字符串变为 `IntermediateImage` 对象

## Goals

- 升级 `@hamster-note/types` 到精确版本 0.8.0
- 迁移所有页面内容 API 到新版 content API
- 实现图片提取、编码、解码的完整路径
- 保持现有文本、outline、roundtrip、smoke、package 验证通过

## Non-Goals

- 不引入原生 `canvas` 或 `sharp` 依赖
- 不声称 100% PDF 图片语义保真度
- 不重构不相关的子系统
- 不使用人工视觉检查作为验收标准

## Decisions

### 依赖策略
- **决策**: 将 `@hamster-note/types` 锁定到精确版本 `0.8.0`
- **原因**: 避免 `^` 范围导致意外升级
- **备选方案**: 保持 `^0.7.0` 并逐步迁移
- **不采用原因**: 用户明确要求升级到 0.8.0，且 0.7 和 0.8 API 不兼容

### 图片编码策略
- **决策**: 使用内联最小 PNG 编码器，避免原生依赖
- **原因**: 项目要求不引入 `canvas`/`sharp`，且纯 JS 方案足够覆盖测试场景
- **编码流程**: raw kind 1/2/3 -> RGBA -> PNG signature/IHDR/IDAT/IEND
- **备选方案**: 使用 `pngjs` 或 `upng-js`
- **不采用原因**: 内联编码器足够小，避免新增依赖

### 内容顺序策略
- **决策**: encode 时先放置 `IntermediateText` 项，再放置 `IntermediateImage` 项
- **原因**: pdfjs `getTextContent()` 无法可靠关联文本顺序与 operator 索引
- **备选方案**: 尝试按 operator 索引混合排序
- **不采用原因**: 混合排序可能导致不可预测的行为，当前方案更稳定

### 警告策略
- **决策**: 不支持的图片结构生成确定性警告记录，不阻塞提取流程
- **警告格式**: `{ type: 'unsupported', operator, page, objectId?, message }`
- **原因**: 保证 parser 的健壮性，避免因个别不支持的图片导致整个页面失败

## Risks / Trade-offs

### 风险
1. **内容顺序**: encode 时将图片放在所有文本之后，可能不符合原始 PDF 的绘制顺序
2. **图片保真度**: 内联 PNG 编码器使用无压缩 deflate，可能产生较大的 data URL
3. **复杂图片结构**: masks、patterns、Form XObject、SMask 等复杂结构仅生成警告，不提取内容

### 权衡
- **稳定性 vs 完整性**: 选择稳定性优先，确保常见图片路径可用，复杂路径安全降级
- **依赖最小化 vs 功能完整**: 避免原生依赖，牺牲部分高级图片编码功能

## Migration Plan

### 阶段 1: 基础 (Wave 1)
- Task 1: 升级依赖基线并验证 0.8.0 契约
- Task 2: 重写 Jest mock 到 0.8.0 表面

### 阶段 2: 核心迁移 (Wave 2-3)
- Task 3: 从 text API 迁移到 content API
- Task 4: 构建 pdfjs 图片提取 spike
- Task 5: 实现图片 data URL 转换
- Task 6: 生成混合 `IntermediatePage.content`
- Task 7: 按原始顺序解码混合内容
- Task 8: 对齐 thumbnail/cover 语义

### 阶段 3: 集成与验证 (Wave 4-5)
- Task 9: 更新 demo 序列化
- Task 10: 扩展 fixture 和测试
- Task 11: 集成验证脚本
- Task 12: 强化不支持的图片 fallback
- Task 13: 最终迁移清理

### 最终验证
- F1: Plan Compliance Audit
- F2: Code Quality Review
- F3: Real Manual QA
- F4: Scope Fidelity Check

## Implementation Notes

### 关键实现细节
- `PdfParser.extractImagesFromPage()` 是 `@internal` 静态 helper，读取 `page.getOperatorList()`
- 跟踪 `save`/`restore` 图形状态栈与 `transform` CTM
- `OPS.paintImageXObject` 通过 `page.objs.get(objId, callback)` 解析 raw image data
- `PdfParser.convertRawImageToDataUrl()` 使用 zlib store/no-compression deflate block
- Decode 路径通过 `getContent()` 获取内容后按数组顺序渲染

### 测试策略
- 每个任务都有 agent 可执行的 QA 场景
- 证据保存在 `.sisyphus/evidence/task-{N}-{slug}.txt`
- 最终验证要求所有命令通过：`yarn check:types && yarn test && yarn lint && yarn build:all && yarn verify:package && yarn verify:vite && npm pack --dry-run`
