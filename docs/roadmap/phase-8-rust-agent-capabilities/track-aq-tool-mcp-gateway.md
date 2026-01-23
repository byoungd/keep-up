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
integration layer for both built-in tools and custom MCP servers while aligning with
existing MCP types in `packages/agent-runtime-core`.

## Architecture Context

- Product context: Open Wrap. This track targets the agent runtime tool execution plane.
- Runtime boundary: Rust owns tool execution, capability checks, and audit logging.
- Storage: tool audit and grant records persist via Track AU.

## Scope

- MCP manifest ingestion, normalization, and validation.
- Tool registry with capability metadata, policy actions, and name qualification.
- Secure credential references and redaction hooks (storage in Track AU).
- Sandbox integration for tool execution and isolation.
- Audit events for tool invocations, policy decisions, and approvals.
- Tool output spooling and artifact pointers for large results.

## Out of Scope

- UI approvals in `apps/cowork` (only hooks and events are produced here).
- UI redesigns in `apps/cowork`.
- LFCC document mutations.
- Provider/model routing (Track AS).
- Replacing existing TypeScript MCP registries before the Rust gateway is stable.
- Inventing a non-MCP protocol or diverging from MCP SDK behaviors.

## Architecture Overview

1. Load MCP server configs and manifests.
2. Validate tool specs and policy annotations, then register tools.
3. Evaluate policy and capability grants for each tool call.
4. Execute tool calls via sandbox (local) or MCP transport (remote).
5. Emit audit records with redacted payloads and hashes.

## Configuration and Inputs

### MCP Server Config

- `name`, `description`
- `transport`: `stdio`, `sse`, or `streamableHttp`
- `auth` (optional): OAuth client info and token store reference
- `enabled`: allow disabling a server without deleting config

Transport options should mirror current TypeScript config in
`packages/agent-runtime-tools/src/tools/mcp/transport.ts`.

### Capability Grants

- `grant_id`, `scope`, `expires_at`
- `policy_action` mapping for tool names
- `approval_mode`: `allow`, `allow_with_confirm`, `deny`

Grants are ephemeral and stored in Track AU; the gateway only caches them
in memory with TTLs.

### Execution Limits

- `timeout_ms`
- `max_output_bytes`
- `max_output_lines`
- `sandbox_profile` (Phase 6 sandbox presets)

## Technical Design

### Core Types (Rust)

- `McpToolSpec` (mirrors `MCPTool`)
- `McpManifest` (server metadata + tool list)
- `ToolRegistryEntry` (qualified name, server, spec, policy action)
- `ToolInvocation` (mirrors `MCPToolCall` + context)
- `ToolResult` (mirrors `MCPToolResult` + artifacts)
- `CapabilityGrant` (scope, expiry, approval state)
- `PolicyDecision` (allow/confirm/deny + reason + risk tags)
- `AuditEvent` (input/output hashes, policy decision id, tool metadata)

### Manifest Validation

- Validate required fields: name, description, `inputSchema`.
- Enforce `annotations.policyAction` and validate against Cowork policy actions.
- Reject tools with invalid JSON schema or unsupported annotations.
- Normalize tool names and ensure deterministic ordering on registration.

### Tool Registry and Lifecycle

- Register MCP servers with qualified tool names (`server:tool`).
- Detect unqualified name collisions and require qualification when ambiguous.
- Allow server initialization and cleanup hooks.
- Provide registry events for UI and telemetry subscribers.

### Policy and Capability Grants

- Evaluate against security policy using tool `policyAction` and context.
- Combine policy decisions with capability grants and approval requirements.
- Support interactive approvals by emitting `approval_required` audit events.

### Execution Pipeline

1. Resolve tool server and normalize call arguments.
2. Evaluate policy and grant constraints.
3. Execute via sandbox (local) or MCP transport (remote).
4. Apply output spooling and artifact persistence rules.
5. Return structured `ToolResult` with metadata and errors.

### Audit and Redaction

- Emit audit entries for each tool call and policy decision.
- Store payload hashes, output artifact URIs, and timing metrics.
- Redact secrets and OAuth tokens before persistence.

### Rust-First Boundary

- Rust owns manifest validation, policy enforcement, execution, and audit logging.
- TypeScript owns configuration UI, approval prompts, and result presentation.

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
| 1 | Registry + manifests | Scaffold `packages/tool-gateway-rs`, parse manifest JSON, align MCP types, registry events, tests for validation and name collisions |
| 2 | Execution pipeline | Sandbox integration, MCP transports (stdio/sse/streamableHttp), timeouts, output spooling, structured errors |
| 3 | Policy + audit | Capability grants, approval workflow hooks, audit event sink to Track AU, redaction and hashing |

## Affected Code

- `packages/agent-runtime-tools/`
- `packages/agent-runtime-sandbox/`
- `packages/agent-runtime-control/`
- `packages/tool-gateway-rs/` (new)

## Acceptance Criteria

- Import and register MCP servers from manifest JSON with deterministic ordering.
- Reject tools without valid `policyAction` annotations or invalid schemas.
- Enforce capability grants and approval gates for tool invocations.
- Execute tools in sandbox or via MCP transport with timeout enforcement.
- Emit audit records with redacted payloads and output hashes.
- Provide artifact pointers for spooled tool outputs.

## Risks

- MCP server compatibility drift across SDK versions (mitigation: version pinning + adapter tests).
- Policy divergence between Rust and TypeScript layers (mitigation: shared schema + conformance tests).
- Sandbox cold start latency (mitigation: warm pools + caching policies).

## References

- `.tmp/analysis/eigent/docs/core/tools.md`
- `.tmp/analysis/eigent/docs/core/workers.md`
- `.tmp/analysis/eigent/server/README_EN.md`
- `packages/agent-runtime-core/src/index.ts`
- `packages/agent-runtime-tools/src/tools/mcp/transport.ts`
