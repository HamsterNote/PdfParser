# Proposal: Upgrade @hamster-note/types to 0.8.0 and Wire IntermediateImage API

## Why

用户原始请求："升级 `@hamster-note/types` 到 0.8.0 并接上最新的 API"。

这不是一次简单的 text-only 兼容迁移，必须支持图片内容。0.8.0 版本引入了重大的 API 变更：
- 页面内容从 `texts/getTexts/hasLoadedTexts` 迁移到 `content/getContent/hasLoadedContent`
- 新增 `IntermediateImage` 和 `IntermediateContent` 类型
- thumbnail/cover 返回 `IntermediateImage | undefined` 而非原始字符串
- 引入 polygon 工具函数

## What Changes

### 核心变更
1. **依赖升级**: `@hamster-note/types` 从 `^0.7.0` 升级到精确版本 `0.8.0`
2. **API 迁移**: 所有 `texts/getTexts/hasLoadedTexts` 用法迁移到 `content/getContent/hasLoadedContent`
3. **图片提取**: 基于 pdfjs operator list 的图片提取架构，支持 graphics-state/CTM 跟踪
4. **编解码支持**: encode 生成混合 `IntermediateContent[]`，decode 按原始顺序渲染
5. **Demo 序列化**: 更新 demo serializer 以支持内容和图片摘要

### 交付物
- `package.json` 和 lockfile 更新到 `@hamster-note/types@0.8.0`
- 新增 `check:types` 脚本 (`tsc --noEmit`)
- 重写 `src/__mocks__/@hamster-note/types.ts` 匹配 0.8.0 API
- `src/pdfParser.ts` 迁移到 content API 并扩展图片提取
- `demo/demoDocumentSerialization.js` 迁移到 content-aware 序列化
- 新增/更新测试覆盖 text+image 混合内容

## Capabilities

- [x] 精确 0.8.0 类型契约验证
- [x] 所有旧版 text API 迁移完成
- [x] `IntermediatePage.content` 支持混合 text/image 内容
- [x] Decode 按原始内容顺序渲染
- [x] 图片提取覆盖常见 image XObject 和 inline image 路径
- [x] 不支持复杂图片结构时软失败并生成确定性警告
- [x] 测试覆盖无图片 PDF、text+image PDF、lazy `getContent()` 幂等性

## Impact

### 影响范围
- **核心模块**: `src/pdfParser.ts` - 主要实现面
- **类型模拟**: `src/__mocks__/@hamster-note/types.ts` - 必须匹配 0.8.0
- **测试**: `src/__tests__/`、`demo/__tests__/` - 验证面
- **Demo**: `demo/demoDocumentSerialization.js`、`demo/demo.js`
- **脚本**: `scripts/verify-roundtrip.mjs`、`scripts/smoke-test.mjs`

### 不涉及的子系统
- `src/rules/`
- `src/generator/`
- `src/pdfjsWorker.ts`
- polyfills
- outline-only 测试
- font fallback 测试
- transform-only 测试

## Verification

所有验证均为 agent 执行，零人工干预：
- `yarn check:types` - 类型检查
- `yarn test` - 完整测试套件
- `yarn lint` - 代码检查
- `yarn build:all` - 构建
- `yarn verify:package` - 包验证
- `yarn verify:vite` - Vite 验证
- `npm pack --dry-run` - 打包验证

## Execution Summary

- **启动时间**: 2026-05-23
- **总任务数**: 13 个实现任务 + 4 个最终验证波次
- **执行波次**: 5 个并行波次
- **最终状态**: 所有任务完成，最终验证通过
