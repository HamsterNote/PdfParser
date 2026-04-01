## 2026-03-30 F4 Scope Fidelity

- 基于 `origin/main...HEAD` 审核，当前分支包含 43 个改动文件，仅 6 个属于 `pdfjs-worker-initialization` 计划允许范围。
- 主要越界来源：`demo/*` 重构、`.opencode/*` 与 `.specify/*` 非本需求资产改动、`rolldown.config.ts` 新增 `browser` entry（涉及打包入口扩展）。
- 结论为 `FAIL`，需先回退 out-of-scope 改动再复核 F4。
