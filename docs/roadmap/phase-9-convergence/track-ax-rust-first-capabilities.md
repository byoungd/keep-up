# Track AX: Rust-First Capabilities Delivery (Phase 8 Execution)

> Priority: P0
> Status: Completed (PR #262)
> Owner: Agent Runtime Team
> Dependencies: Track AW (sandbox + storage), Phase 7 Desktop Sovereignty
> Source: docs/roadmap/phase-8-rust-agent-capabilities/README.md

---

## Objective

Deliver the Phase 8 Rust-first capability set with production-grade interfaces,
while avoiding overlap with Phase 7 deliverables.

---

## Scope

- AP: Workforce orchestration core (deterministic scheduler, task graph).
- AQ: Tool and MCP gateway (registry, sandbox execution, policy hooks).
- AU: Local-first data and audit (event logs, export, encryption).
- AS: Model fabric and routing (BYOK + local models).
- AT: Agent toolkit library (file/doc/media toolkits).
- AR: Workspace sessions and human loop (terminal/browser sessions, approvals).

---

## Exclusions (Already Delivered)

- Tauri shell migration and native enclave (Phase 7).
- Direct UI streams plumbing (Phase 7).
- AP prototype is in progress; do not re-scope, only harden and integrate.

---

## Implementation Spec (Executable)

1) Interface freeze (Week 1)
- Freeze shared Rust interfaces for tools, models, sessions in agent-runtime-core.
- Publish JSON schema for audit and policy envelopes.

2) Core delivery (Weeks 2-4)
- Finalize AP orchestrator: deterministic scheduling, failure policy, event log.
- Build AQ gateway: tool registry, MCP contracts, sandbox execution.
- Implement AU storage: local-first event log, audit, export pipeline.
- Implement AS model fabric: provider registry + routing rules.

3) Experience and tooling (Weeks 3-5)
- Build AR workspace sessions: terminal/browser session streams and approvals.
- Build AT toolkit library: files, docs, media, web workflows.

---

## Deliverables

- Rust crates for workforce, tools gateway, model fabric, toolkits.
- Node bindings under @ku0/native-bindings with fallbacks.
- TS control-plane wrappers in agent-runtime-control.

---

## Acceptance Criteria

- Multi-agent concurrency meets Phase 8 targets.
- Tool invocation latency meets Phase 8 targets.
- Audit logs are local-first and exported correctly.

---

## Validation

- Run per-track validation commands from Phase 8 track docs.
- Execute workforce simulator and tool gateway integration tests.


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
