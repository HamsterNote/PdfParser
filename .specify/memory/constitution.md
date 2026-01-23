<!--
Sync Impact Report
- Version change: N/A (template) -> 0.1.0
- Modified principles: placeholder 1 -> Code Quality & Maintainability; placeholder 2 -> Testing Standards & Coverage; placeholder 3 -> UX Consistency & Accessibility; placeholder 4 -> Performance Budgets & SLOs; placeholder 5 -> Quality Gates & Review
- Added sections: Quality & Performance Standards; Development Workflow & Quality Gates
- Removed sections: None
- Templates requiring updates: ✅ .specify/templates/plan-template.md; ✅ .specify/templates/spec-template.md; ✅ .specify/templates/tasks-template.md; ✅ .opencode/command/speckit.tasks.md; ✅ .opencode/command/speckit.implement.md; ✅ .opencode/command/speckit.specify.md
- Follow-up TODOs: TODO(RATIFICATION_DATE): original adoption date not found
-->
# HamsterNote PdfParser Constitution

## Core Principles

### Code Quality & Maintainability
Code MUST be readable, minimal, and consistent with existing style and lint rules.
Public APIs MUST be documented with intent and usage. Implementation MUST avoid
duplicated logic, dead code, and implicit behavior. Type safety is required; any
type escapes or unsafe casts MUST be justified in the spec and reviewed.

### Testing Standards & Coverage
Behavior changes MUST be covered by automated tests. Unit tests are required
for core logic, and integration tests are required for cross-module behavior or
external integration. Tests MUST be deterministic, isolated, and run in CI.
Omitting tests requires an explicit waiver documented in the plan and approved
in review.

### UX Consistency & Accessibility
User-facing features MUST follow the established UX system (tokens, components,
interaction patterns) and remain consistent across platforms and entry points.
Accessibility requirements (keyboard, contrast, and focus behavior) MUST be
specified for user-facing changes. If a feature has no UI surface, mark this as
not applicable in the spec and explain why.

### Performance Budgets & SLOs
Performance targets MUST be specified as measurable budgets (latency, throughput,
memory, bundle size, or frame rate). Critical paths MUST have regression checks
and defined thresholds. Any regression requires a documented mitigation plan and
explicit approval.

### Quality Gates & Review
All changes MUST pass linting, type checks, and required tests before merge.
Code review is mandatory for every change and MUST confirm compliance with this
constitution. Any waiver must be recorded with rationale and scope in the plan.

## Quality & Performance Standards

- Specs MUST include non-functional requirements covering performance budgets,
  UX consistency expectations, and accessibility expectations when applicable.
- Success criteria MUST include measurable outcomes for performance and user
  experience (task completion, error rate, or satisfaction proxy).
- Every performance-sensitive feature MUST define how performance will be
  measured and what thresholds constitute a failure.

## Development Workflow & Quality Gates

- The implementation plan MUST include a constitution check with explicit gates
  for code quality, testing coverage, UX consistency, and performance budgets.
- Tasks MUST include the tests required by the testing standards principle.
- PRs MUST reference evidence for passing tests and meeting performance budgets.
- UX and accessibility validation MUST be documented for user-facing features.
- Any waiver requires explicit approval and must be tracked in Complexity
  Tracking.

## Governance

- This constitution supersedes all other engineering guidance.
- Amendments require a written proposal, review approval, and a version bump.
- Versioning follows semantic versioning: MAJOR for breaking principle changes,
  MINOR for new or materially expanded guidance, PATCH for clarifications.
- Compliance is reviewed in every plan and PR; non-compliance requires a
  documented waiver with owner, scope, and expiry.

**Version**: 0.1.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date not found | **Last Amended**: 2026-01-22
