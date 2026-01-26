# Track BJ: IDE + GitHub Integration Surfaces

> Priority: P2
> Status: Proposed
> Owner: Integrations
> Dependencies: Tracks BA, BD
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Add IDE and GitHub integrations that mirror Claude Code/Codex workflows: running
agents in-editor, PR review automation, and repo-level command triggers.

---

## Scope

- VS Code extension integration for CLI runtime
- GitHub automation: PR review, comments, and slash-command triggers
- CLI helpers for commit/push/PR flows
- Documentation for installation and usage

---

## Out of Scope

- Core runtime toolchain (Track BC)
- MCP governance (Track BE)

---

## Implementation Spec (Executable)

1) IDE bridge
- Wire `packages/vscode-extension` to invoke local CLI runtime.
- Expose commands for run/review/plan in VS Code.

2) GitHub automation
- Add GitHub workflow + CLI helpers for PR review via plugin command.
- Define a minimal bot command surface (`/review`, `/explain`, `/fix`).

3) CLI Git helpers
- Add `keepup git commit/push/pr` commands (wrapper around git tooling).
- Ensure approvals for destructive git operations.

4) Docs + onboarding
- Add setup docs for IDE + GitHub integration in `docs/guide`.

---

## Deliverables

- VS Code extension wiring to CLI runtime
- GitHub workflow + CLI helpers
- Integration documentation

---

## Acceptance Criteria

- VS Code can run an agent task against the current workspace.
- GitHub PR review flow posts comments from agent output.
- CLI helpers guide commit/push/PR with approvals.

---

## Validation

- Manual: run VS Code command to start a CLI session
- Manual: run PR review flow on a test repository

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bj-ide-github

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
- git commit -m "feat: track-bj ide github"
- git push -u origin feat/track-bj-ide-github
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
