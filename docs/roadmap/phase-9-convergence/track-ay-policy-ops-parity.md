# Track AY: Policy and Ops Parity (TS <-> Rust)

> Priority: P1
> Status: Proposed
> Owner: Agent Runtime Team
> Dependencies: Phase 5 AC, Track AX (tool gateway), Phase 7 enclave
> Source: docs/roadmap/phase-5-expansion/README.md

---

## Objective

Unify policy evaluation, approvals, and audit across TypeScript and Rust planes.
Ensure consistent allow/deny behavior and full audit parity regardless of execution
path (TS or Rust).

---

## Scope

- Policy DSL parity across TS and Rust.
- Shared rule evaluation semantics (allow/deny/ask_user).
- Audit log schema compatibility and export.
- CI enforcement hooks and policy regression tests.

---

## Out of Scope

- New third-party integrations beyond MCP.
- UI redesigns outside existing approval surfaces.

---

## Implementation Spec (Executable)

1) Canonical policy schema
- Define a single JSON schema in agent-runtime-core.
- Enforce deterministic rule ordering and stable hashing.

2) Evaluation parity
- Implement identical rule resolution in TS and Rust.
- Build a conformance test suite with golden decisions.

3) Approval and escalation parity
- Map approval modes to Rust gateway with identical defaults.
- Ensure escalation paths emit the same audit events.

4) Audit parity
- Align audit record structure and signatures.
- Add export validation (checksum verification).

---

## Deliverables

- Policy schema and evaluation conformance tests.
- Unified audit schema and export pipeline.
- CI gating for policy regressions.

---

## Acceptance Criteria

- Identical policy decisions across TS and Rust for a fixed test suite.
- All tool executions emit audit entries with stable hashes.
- Exported audit logs validate against checksums.

---

## Validation

- Run policy parity test suite.
- Run tool gateway integration tests from Track AX.


## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-<id>-<short-name>

2) Initialize required artifacts
- task.md: add checklist items from this track
- implementation_plan.md: summarize steps and dependencies
- walkthrough.md: add validation steps and test commands

3) Implement the scope
- Follow the Implementation Spec in this document only
- Keep changes minimal and within scope

4) Validate
- Run the commands listed under Validation in this document
- Run: pnpm biome check --write

5) Commit and PR
- git add -A
- git commit -m "feat: <track-id> <summary>"
- git push -u origin feat/track-<id>-<short-name>
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
