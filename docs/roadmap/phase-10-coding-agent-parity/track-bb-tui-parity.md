# Track BB: TUI Parity + Session UX

> Priority: P0
> Status: Proposed
> Owner: Desktop/TUI
> Dependencies: Track BA
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Deliver a modern terminal UI that matches OpenCode/Codex class workflows:
fast navigation, session switching, permission dialogs, and file-change views.

---

## Scope

- Session list + resume + search inside `keepup-tui`
- Model/provider selector with saved defaults
- Permission/approval dialog with tool metadata
- File change summary (git diff summary + changed files list)
- Keyboard shortcuts and status bar parity (help modal)

---

## Out of Scope

- CLI command surface (Track BA)
- Plugin system and custom commands (Track BD)
- IDE integrations (Track BJ)

---

## Implementation Spec (Executable)

1) TUI host contract
- Extend `packages/cli/src/tui/host.ts` to expose session list, approvals, and tool events.
- Add `HostCapabilities` versioning for backward compatibility.

2) Core UI screens
- Implement session picker, model picker, and help modal in `packages/keepup-tui`.
- Add permission dialog and tool timeline view (approval + tool results).

3) File-change visualization
- Integrate git diff summary and file list (read-only) in TUI sidebar.
- Add quick actions to open file in external editor.

4) Persistence and resume
- Wire session resume with `SessionStore` and display recent sessions.

---

## Deliverables

- Updated Rust TUI application (`packages/keepup-tui`)
- Updated JS host bridge (`packages/cli/src/tui`)
- Screenshot/recording of key flows (for PR)

---

## Acceptance Criteria

- TUI can list and resume previous sessions reliably.
- Permission dialog displays tool name, arguments, and policy reason.
- File changes are visible during a session.
- Keyboard shortcuts include help and session switching.

---

## Validation

- `pnpm --filter @ku0/cli build`
- `cargo test -p keepup-tui` (if tests present)
- Manual: run `keepup agent tui` and verify UI flows

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bb-tui-parity

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
- git commit -m "feat: track-bb tui parity"
- git push -u origin feat/track-bb-tui-parity
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
