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

## Scope

- MCP manifest ingestion and validation.
- Tool registry with capability metadata and permissions.
- Secure credential storage and redaction.
- Execution sandbox integration for tool calls.
- Audit events for every tool invocation.

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
