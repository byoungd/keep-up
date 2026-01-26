# Track BH: Context Compaction + Memory Continuity

> Priority: P2
> Status: Proposed
> Owner: Runtime Cognition
> Dependencies: Tracks BA, BC
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Ship auto-compaction and context continuity comparable to OpenCode and Gemini
CLI while preserving tool results and instructions.

---

## Scope

- Integrate `ContextCompactor` into orchestrator/runtime loop
- Auto-compaction thresholds with configurable policies
- Persist summary and restore it across session resumes
- Telemetry for compression metrics

---

## Out of Scope

- Time travel checkpoints (Track BI)
- Plugin/skills integration (Track BD)

---

## Implementation Spec (Executable)

1) Runtime integration
- Call `ContextCompactor.checkThreshold` before LLM calls.
- Apply compaction and store summary in session state.

2) Configuration
- Add config options for max tokens, threshold, and preservation counts.
- Surface config in CLI (`keepup config set context.*`).

3) Continuity
- Load compaction summaries on session resume.
- Append compaction notes into scratchpad/context metadata.

4) Observability
- Emit compression metrics to telemetry + audit logs.

---

## Deliverables

- Auto-compaction integrated in runtime loop
- Config schema + CLI bindings
- Telemetry for compression metrics

---

## Acceptance Criteria

- Long sessions automatically compact near token limits.
- Summaries persist across session resumes.
- Compression metrics are visible in telemetry logs.

---

## Validation

- `pnpm --filter @ku0/agent-runtime-execution test`
- Manual: run a long session and verify compaction triggers

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bh-context-compaction

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
- git commit -m "feat: track-bh context compaction"
- git push -u origin feat/track-bh-context-compaction
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
