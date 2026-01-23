---

description: "Task list for 001-mock-test-coverage"
---

# Tasks: 基于自生成 Mock 数据的单元测试用例扩展

**Input**: Design documents from `/specs/001-mock-test-coverage/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Behavior changes require tests per constitution (no waiver noted).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Each task includes an exact file path

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish feature module layout and public exports.

- [X] T001 Create feature directories in `src/rules/`, `src/generator/`, `src/coverage/`, `src/reporting/`, `src/errors/`, `src/cli/`
- [X] T002 Update public exports in `src/index.ts` for new generator/coverage APIs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core primitives required by all stories.

- [X] T003 Implement data model types in `src/rules/types.ts`
- [X] T004 Implement rule schema validation in `src/rules/validateRuleSet.ts`
- [X] T005 Implement deterministic RNG helper in `src/generator/seededRandom.ts`
- [X] T006 Implement rule scenario filter (include/exclude) in `src/generator/scenarioFilter.ts`
- [X] T007 Implement mock data factory helpers in `src/generator/factories.ts`
- [X] T008 Implement output writer (atomic write, overwrite rules) in `src/generator/outputWriter.ts`
- [X] T009 Implement generation error model & suggestions in `src/errors/generationErrors.ts`
- [X] T010 Implement rule set store (load/save/update) in `src/rules/ruleSetStore.ts`

**Checkpoint**: Foundation ready - user story implementation can begin.

---

## Phase 3: User Story 1 - 生成高覆盖用例 (Priority: P1) 🎯 MVP

**Goal**: 规则驱动生成 mock 数据与单元测试用例，覆盖正常/边界/异常路径，并保证可重复。

**Independent Test**: 使用单个低覆盖模块与规则集，生成用例并重复运行，结果一致且测试通过。

### Tests for User Story 1 (REQUIRED)

- [X] T011 [P] [US1] Add rule validation unit tests in `src/__tests__/validateRuleSet.test.ts`
- [X] T012 [P] [US1] Add deterministic RNG unit tests in `src/__tests__/seededRandom.test.ts`
- [X] T013 [P] [US1] Add factory helper unit tests in `src/__tests__/factories.test.ts`
- [X] T014 [P] [US1] Add scenario filter unit tests in `src/__tests__/scenarioFilter.test.ts`
- [X] T015 [US1] Add generation integration test in `src/__tests__/runGeneration.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Implement mock data generator core in `src/generator/generateMockData.ts`
- [X] T017 [US1] Implement test case generator (Jest) in `src/generator/generateTestCases.ts`
- [X] T018 [US1] Implement generation orchestrator in `src/generator/runGeneration.ts`
- [X] T019 [US1] Implement generation report output in `src/reporting/generationReport.ts`
- [X] T020 [US1] Implement generation service entry in `src/services/mockGenerationService.ts`
- [X] T021 [US1] Add CLI command for generation in `src/cli/generate.ts`
- [X] T022 [US1] Wire generation script in `package.json` (e.g., `test:generate`)

**Checkpoint**: User Story 1 should be functional and independently testable.

---

## Phase 4: User Story 2 - 覆盖率提升可衡量 (Priority: P2)

**Goal**: 生成覆盖率基线与对比结果，输出可读的差异报告。

**Independent Test**: 使用 coverage-summary.json 作为基线与生成后结果，产出 delta 报告。

### Tests for User Story 2 (REQUIRED)

- [ ] T023 [P] [US2] Add coverage reader unit tests in `src/__tests__/readCoverageSummary.test.ts`
- [ ] T024 [P] [US2] Add coverage compare unit tests in `src/__tests__/compareCoverage.test.ts`
- [ ] T025 [US2] Add coverage compare integration test in `src/__tests__/coverageCompare.test.ts`

### Implementation for User Story 2

- [ ] T026 [US2] Implement coverage summary reader in `src/coverage/readCoverageSummary.ts`
- [ ] T027 [US2] Implement coverage comparison logic in `src/coverage/compareCoverage.ts`
- [ ] T028 [US2] Implement coverage report writer in `src/reporting/coverageReport.ts`
- [ ] T029 [US2] Implement coverage service entry in `src/services/coverageService.ts`
- [ ] T030 [US2] Add CLI command for coverage compare in `src/cli/coverageCompare.ts`
- [ ] T031 [US2] Wire coverage compare script in `package.json` (e.g., `test:coverage:compare`)

**Checkpoint**: User Stories 1 and 2 should both work independently.

---

## Phase 5: User Story 3 - 规则可维护 (Priority: P3)

**Goal**: 规则更新后可快速重新生成用例，旧用例被替换或标记为过期。

**Independent Test**: 修改规则集并重新生成，旧用例被替换或标记，且新用例与规则一致。

### Tests for User Story 3 (REQUIRED)

- [ ] T032 [P] [US3] Add rule store update unit tests in `src/__tests__/ruleSetStore.test.ts`
- [ ] T033 [P] [US3] Add stale case handling unit tests in `src/__tests__/staleCaseHandler.test.ts`
- [ ] T034 [US3] Add regenerate integration test in `src/__tests__/regenerate.test.ts`

### Implementation for User Story 3

- [ ] T035 [US3] Implement rule set update/versioning in `src/rules/ruleSetStore.ts`
- [ ] T036 [US3] Implement stale case handler in `src/generator/staleCaseHandler.ts`
- [ ] T037 [US3] Implement regenerate CLI command in `src/cli/regenerate.ts`

**Checkpoint**: All user stories should be independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and cross-story quality improvements.

- [ ] T038 [P] Update quickstart commands and flags in `specs/001-mock-test-coverage/quickstart.md`
- [ ] T039 [P] Document error scenarios and fixes in `specs/001-mock-test-coverage/plan.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational phase completion
- **Polish (Phase 6)**: Depends on desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational - no dependencies on other stories
- **US2 (P2)**: Can start after Foundational - independent of US1 (can reuse outputs)
- **US3 (P3)**: Can start after Foundational - independent, but benefits from US1 tooling

### Parallel Opportunities

- Setup tasks T001 and T002 can be parallelized
- Foundational tasks T003-T009 can be parallelized if different files are assigned
- US1 tests (T011-T014) can run in parallel
- US2 tests (T023-T024) can run in parallel
- US3 tests (T032-T033) can run in parallel

---

## Parallel Example: User Story 1

```bash
Task: "Add rule validation unit tests in src/__tests__/validateRuleSet.test.ts"
Task: "Add deterministic RNG unit tests in src/__tests__/seededRandom.test.ts"
Task: "Add factory helper unit tests in src/__tests__/factories.test.ts"
Task: "Add scenario filter unit tests in src/__tests__/scenarioFilter.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate with US1 independent test criteria

### Incremental Delivery

1. Setup + Foundational
2. US1 → validate
3. US2 → validate
4. US3 → validate
