## 1. Parser decode 二进制恢复

- [x] 1.1 引入 `pdf-lib` 依赖，并将 `PdfParser.decode` 改为基于 `IntermediateDocument` 页面/文本结构生成新的 PDF `ArrayBuffer`
- [x] 1.2 调整 decode 测试，覆盖成功生成可用 PDF、缺少页面结构时返回 `undefined`、以及多次 decode 结果互不污染

## 2. Demo 上下文与状态管理

- [x] 2.1 在 demo 中保存最近一次 encode 成功得到的 `IntermediateDocument`，并在文件切换、sample 切换和 encode 失败时重置 decode 上下文
- [x] 2.2 为 Decode 区域实现 `idle`、`loading`、`success`、`empty`、`error` 状态切换，确保旧结果不会在上下文失效后继续显示

## 3. Decode 预览渲染与资源回收

- [x] 3.1 扩展 preview helper 以及 Decode 区域的 HTML/CSS，使成功态可通过内嵌 PDF 容器展示还原结果
- [x] 3.2 实现对象 URL 的创建、替换与释放逻辑，覆盖重复 decode、重新 encode、输入切换和页面卸载场景

## 4. 验证与回归

- [x] 4.1 手动验证 sample PDF 的 encode → decode → 预览链路，并确认空结果与错误结果反馈可区分
- [x] 4.2 运行 `npm test && npm run lint`，修复因本次改动引入的问题
