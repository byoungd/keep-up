# Track BF: LSP Code Intelligence Parity

> Priority: P1
> Status: Completed
> Owner: Agent Runtime Tools
> Dependencies: Track BC
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Provide Codex/OpenCode-style code intelligence (diagnostics, go-to-definition,
find-references, rename) across CLI and Cowork.

---

## Scope

- Enable `CodeInteractionServer` LSP pipeline in runtime registry
- LSP server discovery/configuration per workspace
- Surface diagnostics and navigation results in CLI/TUI output
- Provide CLI command to check LSP availability

---

## Out of Scope

- MCP integration (Track BE)
- IDE integration (Track BJ)

---

## Implementation Spec (Executable)

1) Runtime enablement
- Register `createCodeInteractionServer()` in CLI/Cowork runtime tool registry.
- Prefer `code_interaction` over basic file tools where available.

2) LSP configuration
- Add workspace-level config for LSP server enable/disable.
- Support user overrides for language server binaries.

3) UX surface
- Add CLI formatting for diagnostics and navigation results.
- Expose results in TUI as structured panels.

4) Reliability
- Add guardrails for missing LSP servers and fallback to file-only ops.

---

## Deliverables

- LSP-enabled tool registry
- CLI/TUI rendering for diagnostics and navigation
- LSP configuration docs

---

## Acceptance Criteria

- `go_to_definition` and `find_references` work in CLI sessions.
- Diagnostics are surfaced with file/line/column detail.
- Missing LSP servers degrade gracefully without runtime failure.

---

## Validation

- `pnpm --filter @ku0/agent-runtime-tools test`
- Manual: run `go_to_definition` on a TS file with a local language server

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bf-lsp-intelligence

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
- git commit -m "feat: track-bf lsp intelligence"
- git push -u origin feat/track-bf-lsp-intelligence
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
