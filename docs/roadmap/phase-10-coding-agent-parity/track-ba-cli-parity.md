# Track BA: CLI Parity + Non-Interactive Agent Mode

> Priority: P0
> Status: Completed
> Owner: Developer Experience
> Dependencies: Phase 9 convergence, Agent Runtime Spec v2026.1
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Deliver a Claude Code / Codex / OpenCode class CLI experience for Open Wrap with
full non-interactive support, consistent configuration, and reliable sessions.

---

## Scope

- Expand `keepup` CLI commands to cover interactive + non-interactive flows
- Unified config schema (provider/model/output/session/sandbox) with env overrides
- Session lifecycle: list/resume/export/delete with stable IDs
- Structured outputs (text/json/markdown) with tool call metadata
- AGENTS.md/CLAUDE.md project context injection for CLI runs

---

## Out of Scope

- TUI UI/UX (handled in Track BB)
- Plugin marketplace (Track BD)
- MCP server management (Track BE)

---

## Implementation Spec (Executable)

1) CLI surface + config contract
- Extend `packages/cli/src/commands` with `doctor`, `completion`, and `config set/unset`.
- Define `CliConfig` schema with defaults in `packages/cli/src/utils/configStore.ts`.
- Add env overrides (`KEEPUP_PROVIDER`, `KEEPUP_MODEL`, `KEEPUP_OUTPUT`, `KEEPUP_SESSION`).

2) Non-interactive and scripting mode
- Add `keepup agent run` flags: `--prompt`, `--format`, `--json`, `--quiet`, `--no-stream`.
- Emit deterministic exit codes for tool failures and approval rejections.
- Include tool call metadata in JSON output.

3) Session management parity
- Extend `packages/tooling-session` records to store approvals + tool metadata.
- Implement `keepup session list/resume/export/delete`.
- Add `--session` to run/tui for resume with soft validation.

4) Project context ingestion
- Load AGENTS.md / CLAUDE.md (if present) and pass as instructions in runtime.
- Provide `--instructions` override for one-off runs.

---

## Deliverables

- Expanded CLI commands and help text (`packages/cli`)
- Config schema + env overrides (`packages/cli`, `packages/tooling-session`)
- Session store parity (messages, tool calls, approvals)
- Docs: CLI usage + examples (docs/guide/cli.md)

---

## Acceptance Criteria

- `keepup agent run` supports non-interactive JSON output with tool metadata.
- Sessions can be listed, resumed, exported, and deleted.
- Config/env overrides work consistently across run/tui.
- AGENTS.md instructions are injected into CLI runs.

---

## Validation

- `pnpm --filter @ku0/cli test`
- `pnpm --filter @ku0/tooling-session test`
- Manual: `keepup agent run "ping" --format json`

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-ba-cli-parity

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
- git commit -m "feat: track-ba cli parity"
- git push -u origin feat/track-ba-cli-parity
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
