## 2026-04-02 Decision: remove top-level runtime dependency on pdfjs-dist during module import

- 方案：将 `pdfjs-dist` 的运行时访问改为按需动态加载，避免在 `dist/index.js` 导入阶段触发 `pdfjs-dist` 初始化。
  - `src/pdfParser.ts`：移除顶层 `getDocument/Util` 值导入；新增 `loadPdfjsModule()`（缓存 Promise）并在 `loadPdf()` 内 `await import('pdfjs-dist')` 后再调用 `ensurePdfjsWorkerConfigured(GlobalWorkerOptions)`。
  - `src/pdfjsWorker.ts`：移除顶层 `GlobalWorkerOptions` 导入，改为接收 `GlobalWorkerOptions` 形参并保持现有幂等/缓存/保留非空 `workerSrc` 语义不变。
  - `transformToViewport` 去掉对 `Util.transform` 的运行时依赖，改为本地 2D 仿射矩阵乘法实现，确保无 `pdfjs-dist` 顶层值导入。
- 保持不变：
  - 未新增任何公开 setup/configure API。
  - 未新增依赖。
  - 继续输出 ES 格式，`pdfjs-dist` 仍 external。
  - 保留 `workerSrc` 非空即优先保留、`import.meta.resolve` 自动解析 legacy worker 的既有行为。
- 回归覆盖：新增 `src/__tests__/directImportNodeRegression.test.ts`，验证在未预置 `DOMMatrix`/未预先导入 `pdfjs-dist` 的前提下，包入口导入可成功并注入 polyfill。
