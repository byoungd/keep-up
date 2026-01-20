# Track U: Tool Workbench and Policy

Owner: Runtime Developer
Status: Proposed
Priority: High
Timeline: Week 1-5
Dependencies: Track R tool framework, Track N MCP security
References: `docs/analysis/architecture-deep-dive.md`, Gemini CLI, Cline, OpenCode, AutoGen

---

## Objective

Introduce a stateful tool workbench abstraction with dynamic discovery, isolated registries,
and a policy engine that gates tool execution beyond MCP.

---

## Source Analysis

- Workbench lifecycle and tool schemas: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/tools/_workbench.py`.
- Isolated tool registry and discovery: `.tmp/analysis/gemini-cli/packages/core/src/tools/tool-registry.ts`.
- Policy engine and confirmation bus: `.tmp/analysis/gemini-cli/packages/core/src/policy/policy-engine.ts`, `.tmp/analysis/gemini-cli/packages/core/src/confirmation-bus/message-bus.ts`.
- MCP hub and hooks: `.tmp/analysis/cline/src/services/mcp/McpHub.ts`, `.tmp/analysis/cline/src/core/hooks/hook-factory.ts`.
- Permission gating: `.tmp/analysis/opencode/internal/permission/permission.go`.

---

## Tasks

### U1: Tool Workbench Interface
- Define a Workbench API: `list_tools`, `call_tool`, `save_state`, `load_state`.
- Provide adapters for MCP servers and local tool registries.
- Persist workbench state with CheckpointManager.

### U2: Policy Engine + Hook Gating
- Implement rule-based allow/deny/ask policies with reason codes.
- Enforce policy decisions in tool execution pipeline.
- Add hook execution gating and audit events.

### U3: Dynamic Discovery + Registry Isolation
- Support tool discovery via MCP, local commands, and extensions.
- Isolate tool registries per agent/subagent run.
- Add auto-approval allowlists and path-based safeguards.

---

## Deliverables

- `packages/agent-runtime/src/tools/workbench/` module.
- Policy engine tests covering allow/deny/ask flows.
- Documentation for tool discovery and approval configuration.

---

## Acceptance Criteria

- Workbench exposes `list_tools`, `call_tool`, `save_state`, and `load_state`.
- Policy engine enforces allow/deny/ask with reason codes and audit events.
- Tool registries are isolated per agent/subagent run.
- Dynamic discovery supports MCP and local tool sources with schema validation.

---

## Testing

- Unit tests for policy decisions, hook gating, and registry isolation.
- Integration tests for dynamic discovery and MCP adapters.
- Suggested command: `pnpm --filter @ku0/agent-runtime-tools test -- --grep "workbench|policy"`.
