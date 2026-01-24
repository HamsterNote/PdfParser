# Implementation Plan: 基于自生成 Mock 数据的单元测试用例扩展

**Branch**: `001-mock-test-coverage` | **Date**: 2026-01-23 | **Spec**: `specs/001-mock-test-coverage/spec.md`
**Input**: Feature specification from `/specs/001-mock-test-coverage/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

在现有 Jest/TypeScript 测试体系内，基于业务规则生成可重复的 mock 数据与单元测试用例，覆盖正常/边界/异常路径，并输出覆盖率提升对比结果。方案聚焦规则驱动与确定性生成，避免引入不稳定随机性。

## Technical Context

**Language/Version**: TypeScript 5.0.2  
**Primary Dependencies**: `@hamster-note/document-parser`, `@hamster-note/types`, `pdfjs-dist` (peer), `md5`  
**Storage**: N/A（测试用例与 mock 数据生成以文件输出为主，不引入持久化存储）  
**Testing**: Jest 30 + ts-jest（`NODE_OPTIONS=--experimental-vm-modules jest`）  
**Target Platform**: Node.js 测试环境 + 浏览器运行时（库本身面向 pdfjs-dist 使用场景）  
**Project Type**: 单体库（single package）  
**UX Consistency**: N/A（无 UI 变更）  
**Performance Goals**: 单模块生成用例 ≤ 5 分钟；覆盖率对比输出 ≤ 1 分钟；单次生成内存峰值 ≤ 512MB  
**Constraints**: 生成结果可重复；不破坏现有测试资源；生成失败需给出可操作原因  
**Scale/Scope**: 先以 1 个低覆盖模块为试点（P1），后续可扩展至多个模块

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Code Quality & Maintainability**: 计划必须明确生成逻辑边界与可维护性策略；不得引入隐式行为或重复逻辑。
- **Testing Standards & Coverage**: 生成逻辑本身需有单元测试；跨模块（规则解析 + 用例生成 + 覆盖率对比）需集成测试。
- **UX Consistency & Accessibility**: N/A（无 UI 变更）。
- **Performance Budgets & SLOs**: 明确生成耗时与资源预算；提供回归检查策略。
- **Quality Gates & Review**: lint/typecheck/tests 必须通过；若有豁免需记录。

## Project Structure

### Documentation (this feature)

```text
specs/001-mock-test-coverage/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── __mocks__/
├── __tests__/
├── polyfills/
└── index.ts

test/
├── setupPolyfills.ts
└── setupTests.ts
```

**Structure Decision**: 单体库结构，测试集中在 `src/__tests__`，通用测试初始化位于 `test/`。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

## Phase 0 Research Summary

- 采用“工厂函数 + 覆盖参数”的 mock 生成模式，保持与现有测试风格一致。
- 引入显式 seed 保证可重复性，避免隐式随机。
- 覆盖率对比基于 Jest coverage 产物，避免工具链扩张。

## Phase 1 Design Summary

- 数据模型覆盖规则集、生成样本、用例与覆盖率对比。
- 合同以 OpenAPI 描述规则集管理与覆盖率对比接口。
- 规则文件采用结构化 JSON/TS 并严格校验。

## Constitution Check (Post-Design)

- **Code Quality & Maintainability**: 通过。生成逻辑与规则结构明确，避免重复与隐式行为。
- **Testing Standards & Coverage**: 通过。生成器本身与跨模块流程均计划覆盖测试。
- **UX Consistency & Accessibility**: N/A（无 UI 变更）。
- **Performance Budgets & SLOs**: 通过。已设定可度量预算与回归检查要求。
- **Quality Gates & Review**: 通过。lint/typecheck/tests 作为合并前门禁。
