# Track CK: IDE & GitHub Integration

> Priority: P2
> Status: Proposed
> Owner: Integrations
> Dependencies: Tracks CA, CD, Phase 10 Track BJ
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Complete IDE and GitHub integration from Phase 10 Track BJ with Gateway-based
workflows, VS Code extension enhancement, and PR automation.

---

## Scope (Merged from Phase 10 BJ)

- VS Code extension integration with Gateway
- GitHub automation: PR review, comments, slash-commands
- CLI git helpers for commit/push/PR flows
- Desktop node (Track CD) integration

---

## Out of Scope

- Core toolchain (Phase 10 BC - Completed)
- MCP governance (Track CH)

---

## Implementation Spec

1) IDE bridge via Gateway
- Wire VS Code extension to Gateway WebSocket
- Expose commands for run/review/plan

2) GitHub automation
- GitHub workflow + CLI helpers for PR review
- Bot command surface (/review, /explain, /fix)

3) CLI git helpers
- `keepup git commit/push/pr` commands
- Approval for destructive git operations

4) Desktop integration
- Wire with Track CD device nodes
- Screenshot/recording for PR context

---

## Deliverables

- VS Code extension with Gateway support
- GitHub workflow and CLI helpers
- Integration documentation

---

## Acceptance Criteria

- VS Code runs agent via Gateway
- GitHub PR review posts agent comments
- CLI git helpers work with approvals
- Desktop node provides context

---

## Validation

```bash
# Manual: VS Code command to start session
# Manual: PR review on test repo
```
