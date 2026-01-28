# Track CH: MCP Governance & Integration

> Priority: P1
> Status: Proposed
> Owner: Agent Runtime Tools
> Dependencies: Tracks CA, CF, Phase 10 Track BE
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Complete MCP integration from Phase 10 Track BE, adding full governance,
OAuth persistence, and policy-gated tool discovery via Gateway.

---

## Scope (Merged from Phase 10 BE)

- MCP server configuration via Gateway and CLI
- OAuth token persistence and rotation
- Tool discovery and registration from MCP servers
- Governance: allowlist, approval prompts, audit logging
- Integration with Track CF Policy Engine

---

## Out of Scope

- Basic tool registry (Phase 10 BC - Completed)
- Plugin system (Phase 10 BD - Completed)

---

## Implementation Spec

1) Gateway MCP endpoints
- Add Gateway methods for MCP server management
- Persist MCP config in Gateway state

2) Tool registration via Gateway
- Merge MCP tool servers into Gateway tool registry
- Policy annotations for MCP tools

3) Governance integration
- Wire with Track CF Policy Engine
- Approval prompts for MCP tools by default
- Audit logging with server name and scope

4) Diagnostics
- `keepup mcp test` via Gateway

---

## Deliverables

- Gateway MCP management endpoints
- MCP tool integration in Gateway registry
- Audit + approval hooks for MCP tools

---

## Acceptance Criteria

- MCP tools registered and invoked via Gateway
- OAuth tokens stored and reused
- MCP tool calls gated by policy

---

## Validation

```bash
pnpm --filter @ku0/gateway test
# Manual: connect MCP server, list tools
```
