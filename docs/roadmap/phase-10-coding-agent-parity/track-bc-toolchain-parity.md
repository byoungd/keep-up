# Track BC: Core Toolchain Parity (File/Bash/Patch/Browser/Web)

> Priority: P0
> Status: Completed
> Owner: Agent Runtime Tools
> Dependencies: Track BA
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Provide a complete, Codex/OpenCode-class tool surface in CLI/Cowork runtimes,
covering file ops, patching, shell execution, browser automation, and web search.

---

## Scope

- Register full tool suite in `packages/tooling-session` runtime
- Align tool names/annotations with policy actions and approvals
- Enable patch-based edits and code interaction server for file ops
- Add browser + web search tool servers for research workflows
- Ensure tool telemetry + audit logs capture sandbox/permission context

---

## Out of Scope

- LSP intelligence (Track BF)
- MCP integration (Track BE)
- Plugin/skills routing (Track BD)

---

## Implementation Spec (Executable)

1) Tool registry assembly
- Update `packages/tooling-session/src/runtime.ts` to register:
  - `createFileToolServer`, `createCodeInteractionServer`, `createBashToolServer`
  - `createCompletionToolServer`, `createBrowserToolServer`, `createWebSearchToolServer`
  - `createSandboxToolServer` (when sandbox config is enabled)

2) Policy alignment
- Ensure tool annotations include `policyAction`, `readOnly`, `requiresConfirmation`.
- Add auto-approval defaults via `AutoApprover` when policies are configured.

3) Patch and editor flows
- Wire `apply_patch` + `edit_file` outputs into CLI JSON output.
- Enforce patch validation/fuzzy match behavior in tool results.

4) Observability
- Emit tool call events to runtime event bus for CLI/TUI rendering.

---

## Deliverables

- Tool registry initialization in CLI runtime
- Updated tool policies + annotations
- Test coverage for tool registration and permission gating

---

## Acceptance Criteria

- CLI runtime exposes file, patch, bash, browser, and web search tools.
- Tool calls respect permission rules and approvals.
- CLI JSON output includes tool call metadata and results.

---

## Validation

- `pnpm --filter @ku0/agent-runtime-tools test`
- `pnpm --filter @ku0/tooling-session test`
- Manual: run a CLI session that reads, edits, and patches a file

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bc-toolchain-parity

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
- git commit -m "feat: track-bc toolchain parity"
- git push -u origin feat/track-bc-toolchain-parity
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
