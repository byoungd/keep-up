# Track AZ: Cowork UI Convergence and Runtime Integration

> Priority: P1
> Status: Proposed
> Owner: Cowork UI Team
> Dependencies: UI Cowork tracks, Phase 7 Tauri shell
> Source: docs/roadmap/ui-cowork/README.md

---

## Objective

Finalize Cowork UI tracks and integrate with the converged runtime (TS + Rust),
without redoing Phase 7 shell work.

---

## Scope

- UI Track 1: Workspace shell and sidebar.
- UI Track 2: Chat and canvas.
- UI Track 3: Controls and approvals.
- Cowork Track 16: Agentic capabilities surface.
- Runtime wiring for approvals, sessions, and checkpoints.

---

## Exclusions (Already Delivered)

- Desktop shell migration (Phase 7).
- Direct UI streams plumbing (Phase 7).

---

## Implementation Spec (Executable)

1) UI completion
- Complete Shell/Sidebar, Chat/Canvas, Controls/Approvals per UI-cowork acceptance criteria.
- Ensure reduced-motion compliance and token usage.

2) Runtime integration
- Wire approval modals to policy decisions from Track AY.
- Connect timeline/checkpoints to runtime event streams.
- Add session status indicators with stable event IDs.

3) Agentic surfaces
- Expose agent status, tool activity, and task lineage.
- Ensure errors and escalation prompts are surfaced clearly.

---

## Deliverables

- UI features merged behind feature flags.
- Integration adapters for runtime events and approvals.

---

## Acceptance Criteria

- UI tracks meet UI-cowork acceptance criteria.
- Approval and checkpoint flows operate end-to-end with runtime data.
- No regression in existing Cowork panels and navigation.

---

## Validation

- Run UI smoke tests and typecheck.
- Execute basic runtime integration flow in apps/cowork.


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
