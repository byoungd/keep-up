# Track AQ: Tool and MCP Gateway (Rust)

> Priority: P0
> Status: Proposed
> Owner: Agent Runtime Team
> Dependencies: Phase 6 sandbox, Track AU storage
> Estimated Effort: 3 weeks

---

## Overview

Build a Rust-first tool gateway that hosts MCP servers, validates tool manifests, and
executes tool calls under explicit capability grants. This track delivers the secure
integration layer for both built-in tools and custom MCP servers.

## Architecture Context

- Product context: Open Wrap. This track targets the agent runtime tool execution plane.
- Runtime boundary: Rust owns tool execution, capability checks, and audit logging.
- Storage: tool audit and grant records persist via Track AU.

## Scope

- MCP manifest ingestion and validation.
- Tool registry with capability metadata and permissions.
- Secure credential storage and redaction.
- Execution sandbox integration for tool calls.
- Audit events for every tool invocation.

## Out of Scope

- UI approvals in `apps/cowork` (only hooks and events are produced here).
- LFCC document mutations.
- Provider/model routing (Track AS).

## Deliverables

- `packages/tool-gateway-rs/` crate implementing MCP hosting and tool routing.
- `packages/agent-runtime-tools/` adapters to call Rust tool gateway.
- Configuration schema for MCP servers and per-tool capability grants.
- Policy hooks for allow, deny, and approval-required actions.

## Technical Design

### Core Types

- `ToolSpec`: name, description, inputs, outputs, capability_tags.
- `ToolInvocation`: tool_id, args, workspace_id, approval_mode.
- `CapabilityGrant`: scope, expiry, audit_id.
- `ToolResult`: status, payload, artifacts.

### Execution Flow

1. Load MCP server manifest and register tools.
2. Validate tool spec against policy and config center.
3. Acquire capability grant, then execute inside sandbox.
4. Emit audit event with input and output hashes.

### Rust-First Boundary

- Rust owns tool execution, permission checks, and audit logging.
- TypeScript configures policies and renders approval UI.

## Implementation Spec (Executable)

This section is the authoritative execution guide. Follow it exactly to implement Track AQ.

### 1) Data Model and Serialization

All JSON payloads use `camelCase` fields. Enums are serialized as `snake_case`.

Reuse core MCP types from `packages/agent-runtime-core/src/index.ts`:
- `MCPTool`, `MCPToolCall`, `MCPToolResult`, `JSONSchema`.

New gateway types (Rust + TS, mirrored shapes):

- `McpManifest { server_id, name, version, description?, tools[] }`
- `McpServerConfig { server_id, transport, command?, args?, env?, url?, manifest }`
- `ToolRegistryEntry { tool_id, server_id, tool }`
- `CapabilityGrant { grant_id, capability, issued_at, expires_at?, scope?, approval_id? }`
- `ToolInvocation { tool_id, request_id, arguments, grant_ids[], redact_keys?, timeout_ms? }`
- `ToolAuditEvent { sequence, tool_id, request_id, grant_ids[], input_hash, output_hash, success, duration_ms, created_at }`
- `ToolGatewaySnapshot { tools[], grants[], audit_cursor }`

Enum values:
- `McpTransport`: stdio | http | websocket

### 2) Registry and Manifest Validation

- `server_id` must be unique across all manifests.
- Tool names are unique per server. Global tool id is `${server_id}:${tool.name}`.
- Validate each tool has `name`, `description`, and `inputSchema`.
- Registry ordering is deterministic: `server_id` asc, then tool name asc.

### 3) Capability Grants and Policy Gating

- Required scopes for a tool are derived from `tool.annotations.requiredScopes` plus
  `tool.annotations.policyAction` (if present).
- `callTool` must include `grantIds` covering every required scope; otherwise return
  `MCPToolResult.success = false` with `ToolError.code = PERMISSION_DENIED`.
- If `tool.annotations.requiresConfirmation` is true, a grant with `approvalId` is required.
- Grants can be scoped (workspace/user/session) and may expire; expired grants are rejected.

### 4) Execution and Sandbox

- All tool execution runs through `sandbox-rs`.
- `stdio` transport: spawn `command` with `args`, send JSON `MCPToolCall` on stdin, parse JSON
  `MCPToolResult` from stdout.
- `http` transport: POST JSON `MCPToolCall` to `url`, parse JSON `MCPToolResult` response.
- Tool timeouts return `ToolError.code = TIMEOUT`.
- Execution errors return `ToolError.code = EXECUTION_FAILED`.

### 5) Audit Logging and Redaction

- Audit every invocation with `ToolAuditEvent`.
- `inputHash` and `outputHash` are SHA-256 hex of redacted payloads.
- Redaction keys default to `redact_keys` from `ToolInvocation`; always redact
  `apiKey`, `token`, `secret`, `password` if present.
- Audit events are persisted through Track AU; fallback to in-memory log if store unavailable.

### 6) FFI Boundary (Rust <-> Node)

Expose N-API class `ToolGateway`:

- `registerManifest(manifest)`
- `registerServer(config)`
- `listTools() -> ToolRegistryEntry[]`
- `callTool(invocation) -> MCPToolResult`
- `grantCapability(grant) -> grantId`
- `revokeCapability(grantId)`
- `drainAuditEvents(after?, limit?) -> ToolAuditEvent[]`
- `getSnapshot() -> ToolGatewaySnapshot`
- `reset()`

Node loader:
- `@ku0/tool-gateway-rs/node` uses `@ku0/native-bindings`.
- Env overrides: `KU0_TOOL_GATEWAY_NATIVE_PATH` and `KU0_TOOL_GATEWAY_DISABLE_NATIVE=1`.
- Required export: `ToolGateway`.

### 7) TypeScript Integration

- `packages/agent-runtime-tools` wraps the native gateway and exposes tool calls to the runtime.
- `packages/agent-runtime-control` configures MCP servers and grant policies.

### 8) Tests (Required)

Rust unit tests:
- Manifest validation rejects duplicate server ids and duplicate tool names.
- Capability gating rejects calls without required grants.
- Audit events emit deterministic hashes.

TypeScript validation:
- `packages/agent-runtime-tools` typecheck passes with new gateway types.

### 9) Validation Commands

- `cargo test` (in `packages/tool-gateway-rs`)
- `pnpm -C packages/agent-runtime-tools typecheck`
- `pnpm biome check --write`

### 10) Definition of Done

- Tool gateway registers MCP manifests and lists tools deterministically.
- Capability gating enforced for all tool calls.
- Audit log entries generated with redacted hashes.
- Node binding is callable from `agent-runtime-tools`.

## Implementation Plan

| Week | Focus | Outcomes |
| :--- | :--- | :--- |
| 1 | Registry and manifest loader | tool specs, validation, persistence |
| 2 | Execution pipeline | sandbox integration, result handling |
| 3 | Policy and audit | grants, approval gates, audit log export |

## Affected Code

- `packages/agent-runtime-tools/`
- `packages/agent-runtime-sandbox/`
- `packages/agent-runtime-control/`
- `packages/tool-gateway-rs/` (new)

## Acceptance Criteria

- Import and register MCP servers from manifest JSON.
- Execute a tool with capability gating and audit logging.
- Reject tools with missing or invalid capability grants.
- Redact secrets in logs and event payloads.

## Risks

- MCP server compatibility drift.
- Tool execution latency if sandbox cold start is slow.

## References

- `.tmp/analysis/eigent/docs/core/tools.md`
- `.tmp/analysis/eigent/docs/core/workers.md`
- `.tmp/analysis/eigent/server/README_EN.md`
