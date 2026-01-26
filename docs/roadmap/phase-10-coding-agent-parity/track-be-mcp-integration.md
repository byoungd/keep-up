# Track BE: MCP Integration + Governance

> Priority: P1
> Status: Proposed
> Owner: Agent Runtime Tools
> Dependencies: Tracks BC, BD
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Provide first-class MCP server integration with secure auth, governance, and
user-visible configuration in CLI and Cowork.

---

## Scope

- MCP server configuration via CLI config + Cowork settings
- OAuth token persistence (secure file store) and rotation
- Tool discovery + registration from MCP servers
- Governance: allowlist, approval prompts, and audit logging

---

## Out of Scope

- Plugin marketplace (Track BD)
- LSP intelligence (Track BF)

---

## Implementation Spec (Executable)

1) Configuration + persistence
- Add MCP config section to CLI config schema (transport, url/command, auth).
- Wire `createMcpRemoteToolServer` and token store configuration.

2) Tool registration
- Merge MCP tool servers into the runtime tool registry with policy annotations.
- Surface MCP tool list in `keepup mcp list` and Cowork settings UI.

3) Governance + approvals
- Require approval for MCP tools by default unless policy allows auto-approve.
- Log MCP tool use with server name + scope in audit logs.

4) Diagnostics
- Add `keepup mcp test` to validate connectivity and auth.

---

## Deliverables

- CLI MCP configuration and management commands
- MCP server integration in runtime registry
- Audit + approval hooks for MCP tool use

---

## Acceptance Criteria

- MCP tools can be registered and invoked from CLI/Cowork.
- OAuth tokens are stored securely and reused.
- MCP tool calls are gated by approval policies.

---

## Validation

- `pnpm --filter @ku0/agent-runtime-tools test`
- Manual: connect to a sample MCP server and list tools

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-be-mcp-integration

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
- git commit -m "feat: track-be mcp integration"
- git push -u origin feat/track-be-mcp-integration
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
