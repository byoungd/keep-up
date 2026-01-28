# Track CG: TUI Experience Enhancement

> Priority: P1
> Status: Proposed
> Owner: Desktop/TUI
> Dependencies: Track CA (Gateway), Phase 10 Track BB
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Complete TUI parity work from Phase 10 Track BB, adding full session UX,
model selectors, permission dialogs, and file-change visualization.

---

## Scope (Merged from Phase 10 BB)

- Session list + resume + search in `keepup-tui`
- Model/provider selector with saved defaults
- Permission/approval dialog with tool metadata
- File change summary (git diff + changed files)
- Keyboard shortcuts and status bar parity

---

## Out of Scope

- Gateway control plane (Track CA)
- CLI command surface (Phase 10 BA - Completed)

---

## Implementation Spec

1) TUI host contract updates
- Extend `packages/cli/src/tui/host.ts` with session list and approval events
- Add host capability versioning for backward compatibility

2) Core UI screens
- Session picker, model picker, help modal
- Permission dialog with tool timeline view

3) File-change visualization
- Git diff summary and file list in sidebar
- Quick actions to open files externally

---

## Deliverables

- Updated Rust TUI (`packages/keepup-tui`)
- Updated JS host bridge (`packages/cli/src/tui`)
- Screenshot/recording of flows

---

## Acceptance Criteria

- TUI lists and resumes sessions reliably
- Permission dialog shows tool metadata
- File changes visible during session
- Keyboard shortcuts work including help

---

## Validation

```bash
pnpm --filter @ku0/cli build
cargo test -p keepup-tui
# Manual: keepup agent tui
```
