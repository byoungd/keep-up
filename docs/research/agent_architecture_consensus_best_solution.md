# [SUPERSEDED] Consensus Best Solution: Keep-Up Agent Architecture (Unified 2026)

> **NOTE:** This document is now historical. The authoritative specification is at `docs/specs/agent-runtime-spec-2026.md`.

# Consensus Best Solution: Keep-Up Agent Architecture (Unified 2026)

Date: 2026-01-18
Author: Codex
Status: Proposed Final Consensus

## Scope
This document consolidates and reconciles the analysis reports in `docs/research` into a single, consistent best-architecture proposal for the keep-up agent runtime. It merges the shared pillars, resolves inconsistencies, and adds missing operational contracts required for production-grade reliability.

Sources reviewed:
- `docs/research/agent_architecture_best_practices.md`
- `docs/research/deep_source_analysis_agent_frameworks.md`
- `docs/research/agent_architecture_best_technical_solution.md`
- `docs/research/final_agent_architecture_v1.md`

## Vision
Build a deterministic, recursive, and recoverable agent runtime that remains safe under local-first collaboration constraints (LFCC + Loro), scales via delegation, and is observable end-to-end.

## Core Pillars (Consensus)

### Pillar 1: Resilient Loop with Explicit Completion
- Mandatory completion contract: a `complete_task` or `final_response` tool that is the only valid completion path for agent tasks.
- Graceful recovery: one final warning turn with a short grace period when time or turn limits are hit.
- Deterministic step boundaries: do not silently terminate; always return a meaningful summary.

### Pillar 2: Recursive Delegation (Agent-as-a-Tool)
- Provide a `DelegateToAgent` tool for spawning specialized sub-agents with constrained toolsets.
- Aggregate child costs and results back to the parent.
- Maintain parent-child lineage in the task graph for observability and quota control.

### Pillar 3: Persistent State Graph (Checkpointed Runtime)
- Persist state after every tool execution and turn boundary.
- Use a default SQLite-backed checkpointer with a pluggable storage interface for testing.
- Enable recovery and time-travel debugging by replaying deterministic checkpoints.

### Pillar 4: Process Specialization (SOPs)
- Roles are defined by Standard Operating Procedures, not only by prompts.
- SOPs enforce phase gates (Explore -> Plan -> Implement -> Verify).
- SOPs constrain tool choice and require explicit verification steps.

### Pillar 5: Tool Governance and Parallelism Policy
- Per-agent tool registries and allowlists, isolated by role.
- Permission gating and escalation for sensitive operations.
- Explicit policy tiers: interactive (single-tool, strict) vs batch (parallel groups, dependency-aware).

### Pillar 6: Observability and Model Routing
- Structured event stream with tracing for every tool call and decision.
- Model routing to balance cost and capability (fast model for routine steps, larger model for planning and synthesis).
- Emit recovery and completion events for external UI or audit consumers.

## Unified System Architecture

### Control Plane
- AgentManager: spawn, track, and limit nested agents.
- Runtime Message Bus: publish/send/respond envelopes for inter-agent collaboration.
- Policy Engine: tool allowlists, permissions, and approval gates.

### Execution Plane
- Orchestrator: deterministic loop with perception, thinking, decision, action, observation.
- TurnExecutor: message compression, knowledge injection, request caching, LLM invocation.
- Tool Scheduler: dependency analysis + concurrency limits + retry policies.

### Persistence Plane
- Checkpoint Manager: turn-level snapshots and tool call state.
- Plan Persistence: file-backed plans with history.
- Event Log: append-only run stream for audit and replay.

### Memory and Knowledge
- Short-term: compressed message history.
- Working memory: session facts + task graph state.
- Long-term: retrievable knowledge sources with scoped injection.

## Operational Contracts

1. Completion Contract
- Agents must call the completion tool with validated output.
- The system rejects tool-only termination without completion.

2. Recovery Contract
- One final warning turn is allowed on timeout or max-turn exit.
- The final turn must call completion immediately with the best available summary.

3. Tool Execution Contract
- Every tool call is schema-validated and permission-checked.
- Parallel execution is only permitted in batch policy mode.

4. Persistence Contract
- A checkpoint is created at the end of every turn and after every tool call.
- Pending and completed tool calls are stored in the checkpoint payload.

## LFCC and AI Envelope Alignment
- AI mutations are executed only through the AI Gateway with `doc_frontier` and preconditions.
- All edits are serialized into LFCC canonical form before application.
- Agent state changes are tied to event logs and checkpoints for local-first determinism.

## Recommended Decisions (Resolved)

- State storage: SQLite by default, with pluggable storage for test or cloud.
- Concurrency model: actor-style message routing at the manager layer; execution remains async but deterministic by policy.
- Protocol: JSON schema-based tool definitions, MCP compatibility retained.
- Language: TypeScript for runtime parity with existing keep-up stack.

## Implementation Roadmap

Phase 1 (Robustness)
- Add completion tool contract with schema validation.
- Add graceful recovery turn with a short grace period.
- Enforce policy tiers for tool parallelism.

Phase 2 (Persistence)
- Integrate CheckpointManager into orchestrator turn boundaries.
- Store pending tool calls and partial results.
- Add recovery workflows and time-travel debug hooks.

Phase 3 (Specialization)
- Implement RoleRegistry and SOPExecutor.
- Ship first SOPs for Coder, Researcher, Reviewer, Architect.
- Add a delegation tool and child agent lineage tracking.

Phase 4 (Optimization)
- Add model routing with fallback and health checks.
- Extend observability dashboards for trace + event inspection.

## Open Questions
- Which tasks require strict single-tool steps vs batch parallelism?
- What is the minimal event payload needed for deterministic replay?
- How should checkpoint storage align with Loro snapshots and LFCC logs?

---

Prepared by Codex
