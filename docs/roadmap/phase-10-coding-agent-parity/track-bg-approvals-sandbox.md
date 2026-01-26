# Track BG: Sandbox + Approval UX Parity

> Priority: P1
> Status: Proposed
> Owner: Security + DX
> Dependencies: Tracks BA, BC
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Provide human-in-the-loop approvals and sandbox visibility comparable to
Claude Code/Codex, with clear UX and auditability.

---

## Scope

- Approval request/response UX in CLI and TUI
- Auto-approval policies with explicit per-tool rules
- Sandbox mode display and escalation prompts
- Audit log persistence and export

---

## Out of Scope

- MCP server governance (Track BE)
- Recovery/time-travel (Track BI)

---

## Implementation Spec (Executable)

1) Approval pipeline UX
- Wire `ApprovalManager` events to CLI/TUI with rich details.
- Add `keepup approvals list` and `keepup approvals resolve`.

2) Policy configuration
- Add policy config files for auto-approve/deny/ask.
- Surface policy matches in approval dialogs.

3) Sandbox visibility
- Expose active sandbox mode (none/process/docker/rust) in CLI/TUI.
- Add `keepup sandbox status` and `keepup sandbox test`.

4) Audit logging
- Persist approval decisions and sandbox metadata in session store.

---

## Deliverables

- Approval UX in CLI/TUI
- Policy configuration schema
- Sandbox status commands and audit logs

---

## Acceptance Criteria

- Approval dialogs include tool name, args, policy reason, and sandbox status.
- Auto-approval policies can be configured without code changes.
- Audit logs include approval outcomes and sandbox metadata.

---

## Validation

- `pnpm --filter @ku0/agent-runtime-execution test`
- Manual: run a tool requiring approval and verify logs

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bg-approvals-sandbox

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
- git commit -m "feat: track-bg approvals sandbox"
- git push -u origin feat/track-bg-approvals-sandbox
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
