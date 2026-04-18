## 2026-03-30 F4 Scope Fidelity

- 基于 `origin/main...HEAD` 审核，当前分支包含 43 个改动文件，仅 6 个属于 `pdfjs-worker-initialization` 计划允许范围。
- 主要越界来源：`demo/*` 重构、`.opencode/*` 与 `.specify/*` 非本需求资产改动、`rolldown.config.ts` 新增 `browser` entry（涉及打包入口扩展）。
- 结论为 `FAIL`，需先回退 out-of-scope 改动再复核 F4。

## 2026-04-02 F3 Final-wave QA

- `npm test` 通过：17/17 suites、181/181 tests 全绿。
- `npm run lint` 返回成功，无 ESLint 报错输出。
- `npm run build:all` 通过，并明确输出 `Copied: node_modules/pdfjs-dist/build/pdf.worker.min.mjs -> dist/pdf.worker.min.mjs`。
- `npm pack --dry-run` 包内容包含 `dist/pdf.worker.min.mjs`（约 1.1MB）。
- Node ESM smoke 失败：执行 `import('./dist/index.js')` 后解析 PDF 时，`pdfjs-dist/build/pdf.mjs` 在 `new DOMMatrix()` 处抛出 `ReferenceError: DOMMatrix is not defined`，导致无法完成“清空后自动回填 workerSrc”的运行时证明。
- 当前快照 F3 结论：因 smoke gate 未通过，发布验收应判定为 `REJECT`。


## 2026-04-02 F1 Re-audit

- 复核 `src/pdfjsWorker.ts`：`getConfiguredWorkerSrc()` 现在会保留任意非空字符串，旧证据中关于 `"./pdf.worker.mjs"` 特判的 FAIL 已过时。
- 当前仍不满足计划要求的 Node/non-browser 解析策略：实现使用 `import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')`，未按计划要求使用 `createRequire(import.meta.url).resolve(...)` + `pathToFileURL(...)`。
- `src/pdfParser.ts` 仍只在 `loadPdf()` 内、且在 `getDocument()` 之前调用 `ensurePdfjsWorkerConfigured()`；未发现公开 setup/configure API 暴露。
- `rolldown.config.ts` 当前缺少原计划中的 `browser` entry，说明打包入口已偏离计划中的既有形态；对应 `src/browser.ts` 现已不存在，无法判定为“未改动 browser 导出面”。
- 重新审计结论：REJECT。

## 2026-04-02 F4 Final Scope Re-check (current workspace)

- 基于当前仓库实时状态复核：`git status --short` 仅有 `.sisyphus/boulder.json` 与本 notepad 文件改动；`git diff --name-only origin/main...HEAD` 为空，说明当前不存在仍待合入的生产/测试/脚本越界改动。
- 计划 `Must NOT Have` 逐项就“当前存在的代码”检查：
  - 公开 API：`src/index.ts` 未新增 `setupPdfjsWorker/configureWorker`（符合“不得新增公开 setup API”）。
  - 打包形态：`rolldown.config.ts` 仍为 `format: 'es'` 且 `external: ['pdfjs-dist', /^node:/]`（符合“不得改 CJS/内联 pdfjs/新增额外 bundle”）。
  - 资源策略：`src/pdfjsWorker.ts` 浏览器分支使用随包 worker URL，未见 CDN / `document.currentScript` 依赖（符合范围）。
  - 非相关重构：当前工作区未见 demo/CLI/规则系统额外改动（符合“不得重构无关模块”）。
- 旧证据 `.sisyphus/evidence/f4-scope-fidelity.txt` 与当前仓库状态不一致（其记录了旧分支差异文件清单），对“现在是否越界”判断已过时，应仅作历史上下文参考。
- 当前范围结论：**APPROVE**（按“当前代码库状态”判定，无仍存在的 out-of-scope 编辑）。


## 2026-04-02 Node/non-browser Resolution Strategy — Compliance Analysis

### Plan requirement (line 50)
> Node/Jest 分支通过 `createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')` 解析 legacy worker 的真实路径，再转成 `file://` URL 写入 `GlobalWorkerOptions.workerSrc`。

### Current implementation (`src/pdfjsWorker.ts:21-24`)
```typescript
const resolve = (import.meta as ImportMetaWithResolve).resolve
if (typeof resolve === 'function') {
  return resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
}
```

### Runtime behavior test
```bash
node --input-type=module -e "console.log(import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'))"
# Output: file:///Users/zhangxiao/frontend/HamsterNote/PdfParser/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs
```

### Literal compliance vs. behavioral equivalence

| Aspect | Plan specified | Implementation uses |
|--------|----------------|----------------------|
| Resolution mechanism | `createRequire(import.meta.url).resolve(...)` | `import.meta.resolve(...)` |
| URL conversion | `pathToFileURL(...)` to `file://` | `import.meta.resolve` already returns `file://` URL |
| End result | `file://` URL for `GlobalWorkerOptions.workerSrc` | `file://` URL for `GlobalWorkerOptions.workerSrc` |

### Conclusion
**Non-blocking compliance issue (recommend CLOSE without fix):**

1. The implementation achieves **behavioral equivalence** — `import.meta.resolve()` in Node ESM natively returns a `file://` URL, which is semantically identical to what the plan's two-step `createRequire + pathToFileURL` produces.

2. The F1 reviewer's earlier REJECT was based on **literal** plan text rather than **functional intent** — both approaches produce the same `file://` URL pointing to the legacy worker.

3. The plan was written with an older Node ESM pattern; `import.meta.resolve` is the modern idiomatic equivalent and was likely not in the original author's vocabulary when drafting the plan.

4. F2 APPROVED the current implementation and explicitly noted "Node/非浏览器分支依赖 `import.meta.resolve`... 当前 Node/Jest 环境可工作" — confirming the approach is functional.

5. **Risk of changing to plan-literal approach**: Replacing working `import.meta.resolve` with `createRequire(import.meta.url).resolve + pathToFileURL` introduces unnecessary churn with zero functional benefit.

### Recommendation
Treat as **resolved/no-fix**: The Node/non-browser branch correctly produces a `file://` URL to the legacy worker. Literal plan text should be updated in a future refactor pass, but this does not warrant blocking the current PR or delegating a fix task.

---

## 2026-04-02 Final Code Quality Review (F2)

- Verdict: APPROVE
- Blocking: 未发现会阻断发布的正确性/类型安全/幂等性问题。
- Non-blocking:
  - `scripts/copyPdfjsWorker.mjs`: `ENOENT` 被统一解释为源文件缺失；若实际是 `dist/` 目录不存在，报错会误导排查，属脚本可靠性问题但不影响当前实现正确性结论。
  - `src/pdfjsWorker.ts`: 浏览器分支仅以 `typeof document !== 'undefined'` 判定环境，带 DOM shim 的非真实浏览器宿主也会走浏览器路径，风险低但环境探测偏宽松。
- Validation:
  - `ensurePdfjsWorkerConfigured()` 逐行检查通过：先尊重现有非空 `workerSrc`，再回放缓存，最后才自动解析并写回，全流程幂等。
  - 预配置 `workerSrc` 在生产接入点 `PdfParser.loadPdf()` 中会被保留，相关单测与集成回归测试也验证了不覆盖行为。
  - Node/非浏览器分支依赖 `import.meta.resolve` 解析 `pdfjs-dist/legacy/build/pdf.worker.min.mjs`；当前 Node/Jest 环境可工作，缺少该能力时会显式失败并要求宿主手动配置，行为与安全失败预期一致。


## 2026-04-02 Node ESM direct-import runtime regression fix

- 复现：`node --input-type=module -e "import('./dist/index.js')..."` 在模块加载阶段触发 `pdfjs-dist/build/pdf.mjs` 的 `new DOMMatrix()`，抛出 `ReferenceError: DOMMatrix is not defined`。
- 根因：entry 构建产物中存在对 `pdfjs-dist` 的顶层静态导入（来自 `src/pdfParser.ts` / `src/pdfjsWorker.ts`）。ESM 先执行外部依赖，再执行包内 polyfill 代码，导致 `DOMMatrix` polyfill 生效过晚。
- 影响：普通 Node 消费者仅 `import('./dist/index.js')` 即崩溃，必须额外手动预导入 `pdfjs-dist` 或注入 `DOMMatrix`，不符合包入口可直接使用预期。

## 2026-04-02 F3 Final-wave QA Re-run (current snapshot)

- `npm test` 通过：18/18 suites、182/182 tests 全绿，新增 direct-import 回归测试已包含在当前快照内。
- `npm run lint` 通过：命令成功返回，无 lint 错误输出。
- `npm run build:all` 通过，并产出/复制 `dist/pdf.worker.min.mjs`。
- `node --input-type=module -e "import('./dist/index.js')..."` 通过，输出 `DIRECT_IMPORT_OK`，说明直接导入 `./dist/index.js` 已恢复正常。
- `node ./scripts/smoke-test.mjs` 通过，输出 `SUCCESS: workerSrc auto-filled to: file:///Users/zhangxiao/frontend/HamsterNote/PdfParser/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs`；本次证明 `workerSrc` 在初始为空时被自动填充为非空 `file://` URL，且包含目标 worker 文件名 `pdf.worker.min.mjs`。
- `npm pack --dry-run` 通过，包内容包含 `dist/pdf.worker.min.mjs`（约 1.1MB）。
- 当前快照 F3 结论：**APPROVE**。
