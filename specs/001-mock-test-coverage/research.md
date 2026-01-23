# Research

本文件汇总 Phase 0 的关键技术决策与依据，确保所有“NEEDS CLARIFICATION”已解除。

## 决策 1：使用“工厂函数 + 覆盖参数”生成 mock 数据

- **Decision**: 采用与现有测试一致的工厂函数模式（如 `createTextItem`），通过默认值 + overrides 生成 mock 数据，避免引入额外随机库。
- **Rationale**: 现有测试已使用工厂函数与局部覆盖（`src/__tests__/mapTextContentToIntermediate.test.ts`），保持一致有助于可维护性与学习成本降低；同时避免新增依赖导致的不确定性与维护负担。
- **Alternatives considered**:
  - 使用 `@faker-js/faker` + seed：可快速生成多样化数据，但需要新增依赖和统一 seed 管理。
  - 使用 `@factory-js/factory`：提供更强的工厂能力，但引入额外抽象层与依赖。

## 决策 2：生成逻辑必须确定性（可重复）

- **Decision**: 对所有规则驱动的生成逻辑引入显式 `seed`（可配置，默认固定），并在生成结果中记录 `seedUsed`；测试中避免使用不可控的 `Math.random()`。
- **Rationale**: 需求明确要求“相同规则与输入下生成结果可重复”；确定性生成可保证 CI 稳定并便于复现。
- **Alternatives considered**:
  - 直接使用 `Math.random()`：不可复现，违背 FR-004。
  - 使用 `jest-random-mock` 统一劫持随机数：可行但不利于业务逻辑层显式控制。
- **References**:
  - https://vicky-ivanova.medium.com/seed-your-randomness-why-random-test-data-should-be-reproducible-bef3c78525fb
  - https://github.com/hustcc/jest-random-mock

## 决策 3：复杂依赖使用 Jest Manual Mocks 与现有 __mocks__ 机制

- **Decision**: 对外部依赖（如 `pdfjs-dist`）延续 Jest 手动 mock 与 `__mocks__` 映射机制。
- **Rationale**: 现有测试已使用 `jest.mock('pdfjs-dist', ...)` 与 `src/__mocks__`，满足隔离性与可控性。
- **Alternatives considered**:
  - 真实依赖加载：容易导致环境差异与运行不稳定。
- **References**:
  - https://jestjs.io/docs/manual-mocks

## 决策 4：覆盖率对比基于 Jest coverage 输出

- **Decision**: 覆盖率基线与对比统一使用 `jest --coverage` 产物（如 `coverage/coverage-summary.json`），不引入新的覆盖率工具。
- **Rationale**: 项目已内置 `test:coverage` 脚本，直接复用可以降低集成成本并保证一致口径。
- **Alternatives considered**:
  - 额外引入 nyc/istanbul CLI：会增加配置与工具链复杂度。

## 决策 5：规则表达使用结构化文件（JSON/TS），保持可审计与可版本化

- **Decision**: 规则文件采用结构化 JSON/TS（版本可控、可 diff），与生成器严格 schema 校验。
- **Rationale**: 满足“规则可维护”的需求，规则更新可以在代码评审中被审计；结构化格式更利于校验与错误提示。
- **Alternatives considered**:
  - YAML：可读性更强但类型校验与约束更弱。
  - 外部存储（DB/服务）：引入复杂依赖，不符合当前单体库范围。
