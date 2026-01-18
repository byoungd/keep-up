# Agent Runtime 2026 Collaboration Contract and Coding Requirements

Date: 2026-01-18
Owner: Keep-Up Engineering
Status: Active

## Purpose
Provide a single, actionable contract for collaboration and coding standards so any agent can execute work to completion without ambiguity. This document is the operational companion to `docs/specs/agent-runtime-spec-2026.md`.

## Source of Truth
- Primary spec: docs/specs/agent-runtime-spec-2026.md
- Roadmap and tracks: docs/roadmap/agent-runtime-2026-roadmap.md
- Cross-track contract freeze: docs/roadmap/cowork-contract-freeze.md
- Coding standards: CODING_STANDARDS.md

If conflicts exist, the spec wins, then the contract freeze, then coding standards.

## Collaboration Contract

### Roles and Responsibilities
- Tech Lead: confirm contract semantics, approve cross-track interfaces, resolve conflicts.
- Developer: implement scoped changes, add tests, update artifacts and documentation.
- QA/Reviewer: execute walkthrough, validate edge cases, verify tests.

### Required Artifacts (per task)
- task.md: checklist updated with [/] and [x]
- implementation_plan.md: steps and dependencies for the task
- walkthrough.md: how to verify the change and tests run

### Branching and PR Flow
1. Sync main: `git checkout main && git pull`
2. Create feature branch: `git checkout -b feature/agent-runtime-2026-<track>`
3. Implement scoped changes
4. Run tests (see Testing Requirements)
5. Format: `pnpm biome check --write`
6. Commit: `git add -A && git commit -m "feat: <summary>"`
7. Open PR with summary and test results

### Change Control
- Changes that alter shared contracts MUST update the contract freeze doc.
- Changes that alter the spec MUST update the spec and re-validate affected tracks.
- Each PR must declare which spec sections it satisfies.

### Consistency Rules
- All new code in TypeScript
- No Yjs; Loro is the only CRDT
- No Framer Motion in ProseMirror NodeViews
- English-only documentation and comments

## Coding Requirements

### TypeScript and General
- No `any` types; use `unknown` or strict interfaces
- No `var`; use `const` or `let`
- Remove unused imports and variables
- Prefix unused params with `_`
- Keep cognitive complexity <= 15 per function
- Avoid `else` after `return`

### React/JSX
- Buttons must include `type="button"` unless submitting forms
- Keys must be stable IDs, not array indices
- Use semantic elements (`<button>` instead of `<div role="button">`)
- Label rules: use `<span>` for decorative text, not `<label>`

### Accessibility (A11y)
- Icon-only buttons must have `aria-label`
- Inputs must have `aria-label` or associated `<label>`
- Scrollable regions must have `tabIndex={0}`
- Decorative icons must include `aria-hidden="true"`

### Editor Constraints
- ProseMirror NodeViews must not use Framer Motion
- Use CSS transitions or ProseMirror decorations for animation

### Tailwind CSS (v4)
- Use modern syntax (e.g., `bg-linear-to-br`, not `bg-gradient-to-br`)
- Use `z-60` instead of `z-[60]`

## Testing Requirements

### Formatting and Linting
- Always run: `pnpm biome check --write`

### E2E Strategy (Targeted Only)
- Editor changes: `pnpm test:e2e:core`
- Blocks/NodeView changes: `pnpm test:e2e:blocks`
- Collaboration changes: `pnpm test:e2e:collab`
- Annotation changes: `pnpm test:e2e:annotations`
- Import/AI/persistence changes: `pnpm test:e2e:features`
- Navigation changes: `pnpm test:e2e:smoke`
- Accessibility: `pnpm test:e2e:a11y`

Never run the full `pnpm test:e2e` during development.

### Test Reporting
- Record test commands and outcomes in walkthrough.md
- Note any skipped tests and reasons

## Definition of Done
- Spec section(s) implemented and referenced in PR
- Tests pass for the affected scope
- No lint or formatting issues
- task.md and walkthrough.md updated
- Contract freeze updated if interfaces change

## Acceptance Metrics (Release Gates)
- Completion contract: 100% termination via completion tool
- Recovery: 100% limit cases produce final summary output
- Tool governance: 0 unauthorized tool calls in tests
- Checkpoint coverage: checkpoint after every tool result and turn
- Event coverage: required runtime events emitted with runId
- LFCC compliance: AI edits pass gateway sanitize/normalize/dry-run

## Agent Quick Start
1. Read the spec and relevant track doc.
2. Update task.md and implementation_plan.md.
3. Implement only in-scope changes.
4. Run required tests and format.
5. Update walkthrough.md with verification steps.
6. Commit and open PR.

---

End of contract.
