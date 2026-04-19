## 1. Encode 契约适配

- [x] 1.1 对照 `@hamster-note/types` 0.7.0 的 `Text` / `IntermediateText` 定义，梳理 encode 与 decode 依赖的必填字段、默认值和兼容边界
- [x] 1.2 调整 `src/pdfParser.ts` 的文本节点构造路径，将新版字段归一化收敛到单一 helper 或单一出口
- [x] 1.3 更新 encode 相关单测，验证输出文本节点满足 0.7.0 契约且保留 decode 所需的关键渲染度量

## 2. Decode 与测试替身同步

- [x] 2.1 调整 `src/pdfParser.ts` 的 decode 文本消费逻辑，使其基于新版文本结构的最小可渲染字段集生成 PDF
- [x] 2.2 更新 `src/__mocks__/@hamster-note/types.ts` 的构造、序列化和解析行为，使 Jest mock 与 0.7.0 契约保持一致
- [x] 2.3 更新 decode 单测与集成测试，覆盖新版文档直接 decode、序列化往返后 decode 以及非法字段返回 `undefined` 的场景

## 3. 依赖升级与验证

- [x] 3.1 升级 `package.json`、锁文件和示例工程中的 `@hamster-note/types` 引用到 `^0.7.0`
- [x] 3.2 运行 `npm test && npm run lint`，确认类型升级后的主链路验证通过
- [x] 3.3 如示例工程依赖解析受影响，执行 `npm run verify:vite` 验证浏览器侧构建与运行链路
