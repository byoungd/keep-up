# Cowork Track 16: Phase G Agentic Capabilities - Best Practices Addendum

Date: 2026-01-18
Owner: Keep-Up Engineering
Status: Proposed

## Summary
This addendum records recommended best-practice upgrades to keep the agent runtime aligned with 2025-era standards. It supplements the existing Phase G deliverables without changing the committed scope.

## 1. MCP 1.x Standardization

### Objectives
- Adopt the official MCP 1.x SDK (`@modelcontextprotocol/sdk`) for tool server registration, schema handling, and transport wiring.
- Implement OAuth 2.0 authentication and authorization for MCP tool servers.
- Add a prompt injection defense layer that gates tool inputs and outputs.

### Recommended Actions
- SDK adoption:
  - Introduce a compatibility adapter so the current MCP registry can list and execute tools via the official SDK types.
  - Align tool schemas with the SDK JSON Schema expectations and MCP capability negotiation.
  - Centralize MCP transport and server lifecycle in the runtime tool registry.
- OAuth 2.0:
  - Support token acquisition flows based on connector type (client credentials for internal connectors, authorization code for user-consented connectors).
  - Persist access tokens and refresh tokens with scope and audience metadata.
  - Bind token scopes to tool allowlists and security policy evaluation.
- Prompt injection guardrails:
  - Sanitize tool descriptions, examples, and external context before prompt assembly.
  - Validate tool outputs against schemas and enforce allowlisted field subsets.
  - Add a policy hook that can block tool execution when prompt injection heuristics are triggered.

### Integration Points
- `packages/agent-runtime/src/tools/mcp/registry.ts`
- `packages/agent-runtime/src/executor/index.ts`
- `packages/agent-runtime/src/security/index.ts`

## 2. Agent-to-Agent (A2A) Protocol

### Objectives
- Add A2A envelope support for cross-framework agent collaboration.
- Map A2A message exchange onto existing RuntimeMessageBus and DelegateToAgent behavior.
- Provide consistent tracing and capability discovery.

### Recommended Actions
- Define A2A envelope mapping:
  - Map A2A `agent_id`, `capabilities`, `request_id`, and `conversation_id` to existing runtime fields.
  - Support streaming responses with status updates that mirror the current task graph model.
- Extend RuntimeMessageBus:
  - Add an A2A transport adapter for outbound and inbound messages.
  - Register remote agents as delegated runtimes with scoped capabilities.
- Observability:
  - Propagate correlation IDs through agent hops.
  - Log A2A exchanges in the event log for audit and replay.

### Integration Points
- `packages/agent-runtime/src/orchestrator/orchestrator.ts`
- `packages/agent-runtime/src/tools/core/delegation.ts`
- `packages/agent-runtime/src/checkpoint/eventLog.ts`

## 3. LangGraph Alignment

### Objectives
- Reinforce Human-in-the-Loop approvals in PolicyEngine.
- Add node-level caching for repeated tool or subgraph calls.
- Confirm durable state remains aligned with existing CheckpointManager.

### Recommended Actions
- PolicyEngine approvals:
  - Introduce explicit approval states (pending, approved, rejected, expired).
  - Add configurable approval timeouts and reason codes.
  - Ensure approval decisions are persisted with checkpoints for replay safety.
- Node-level caching:
  - Extend tool result caching to include a node cache keyed by node name, inputs, and policy context.
  - Define cache invalidation rules (time-to-live, policy changes, or data access scope changes).
  - Record cache hits in telemetry for optimization visibility.
- Durable state:
  - Keep CheckpointManager as the source of truth for resumable graph execution.

### Integration Points
- `packages/agent-runtime/src/security/index.ts`
- `packages/agent-runtime/src/orchestrator/toolResultCache.ts`
- `packages/agent-runtime/src/checkpoint/*`

## Acceptance Criteria
- MCP tools can be registered and executed via the official SDK without breaking existing registry semantics.
- OAuth 2.0 scopes are enforced at tool execution time with audit visibility.
- Prompt injection guardrails can block or redact tool calls with clear error reasons.
- A2A messages are routed through RuntimeMessageBus with traceable correlation IDs.
- Policy approvals and node-level caching are defined with deterministic behavior and replay safety.
