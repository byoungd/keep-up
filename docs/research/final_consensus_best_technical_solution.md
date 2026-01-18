# [SUPERSEDED] Final Consensus Best Technical Solution: Keep-Up Agent Runtime (2026)

> **NOTE:** This document is now historical. The authoritative specification is at `docs/specs/agent-runtime-spec-2026.md`.

# Final Consensus Best Technical Solution: Keep-Up Agent Runtime (2026)

Document ID: CONSENSUS-BEST-TECH-2026
Date: 2026-01-18
Author: Codex
Status: Final

## Scope
This document is the single, final consensus technical solution for the Keep-Up agent runtime. It consolidates all research analyses in `docs/research` into one consistent, actionable architecture and resolves previous gaps in completion semantics, recovery policy, tool governance, and LFCC alignment.

## Sources Reviewed
- docs/research/agent_architecture_best_practices.md
- docs/research/deep_source_analysis_agent_frameworks.md
- docs/research/antigravity_final_solution.md
- docs/research/final_agent_architecture_v1.md
- docs/research/agent_architecture_best_technical_solution.md
- docs/research/agent_architecture_consensus_best_solution.md
- docs/research/final_consensus_architecture_2026.md

## Executive Summary
The best technical solution for Keep-Up is a deterministic, recoverable, and recursively scalable agent runtime with explicit completion semantics, strict tool governance, and durable state checkpoints. The design integrates the most proven patterns from OpenCode, Gemini CLI, AutoGen, MetaGPT, LangGraph, and CrewAI, while staying aligned to Keep-Up's LFCC and local-first constraints.

## Non-Negotiable Pillars
1. Resilient Loop with Explicit Completion
2. Recursive Delegation (Agent-as-a-Tool)
3. Checkpointed State Graph for Recovery and Replay
4. Process-First Roles (SOPs)
5. Tool Governance with Policy-Tiered Parallelism
6. End-to-End Observability and Model Routing

## Architecture Overview

### Control Plane
- AgentManager: spawn agents, track parent-child lineage, enforce limits.
- Runtime Message Bus: publish/send/respond envelopes for inter-agent collaboration.
- Policy Engine: tool allowlists, approvals, escalations, and execution limits.
- Recovery Engine: injects a final warning turn for graceful completion.

### Execution Plane
- Orchestrator: deterministic state machine (perception -> thinking -> decision -> action -> observation).
- TurnExecutor: context compression, knowledge injection, cache-aware LLM calls.
- Tool Scheduler: dependency analysis, concurrency limits, error recovery.

### Persistence Plane
- Checkpoint Manager: snapshot after every tool execution and turn.
- Plan Persistence: file-backed plan storage and history.
- Event Log: append-only event stream for audit and replay.

### Memory and Knowledge
- Short-term memory: compressed message history.
- Working memory: task graph state and session facts.
- Long-term memory: retrievable knowledge sources with scoped injection.

## Core Mechanisms

### 1. Completion Contract
- A single completion tool (`complete_task` or `final_response`) is the only valid finish path.
- Completion output must pass schema validation.
- The completion tool must be called alone in its turn.

### 2. Recovery Contract
- On timeout or max-turn limits, inject exactly one final warning turn.
- The final warning turn must call completion immediately with best-available summary.
- No additional tool calls are allowed in the recovery turn.

### 3. Tool Execution Contract
- Every tool call is schema-validated and permission-checked.
- Parallel execution is allowed only in batch policy mode.
- Interactive policy mode enforces single-tool turns.

### 4. Recursive Delegation
- Implement `DelegateToAgent` as a universal tool.
- Child agents receive a constrained tool registry and isolated context.
- Usage, cost, and artifacts roll up to the parent.

### 5. Checkpointing and Replay
- Persist checkpoints after every tool result and turn boundary.
- Record pending and completed tool calls in checkpoint state.
- Allow recovery from checkpoints with deterministic replay.

### 6. Observability and Routing
- Emit structured events for decisions, tools, recovery, and completion.
- Use tracing for latency, tool errors, and agent lineage.
- Add model routing and fallback for cost and reliability control.

## LFCC and AI Envelope Alignment
- All AI mutations must go through the AI Gateway.
- Each mutation includes `doc_frontier` and preconditions for deterministic CRDT merges.
- Payloads are normalized into LFCC canonical structures prior to application.

## Recommended Decisions
- Storage: SQLite by default; pluggable storage for tests and cloud.
- Concurrency: actor-style message routing at the manager layer; deterministic execution policy at the loop layer.
- Protocol: JSON schema-defined tools; MCP compatibility retained.
- Language: TypeScript to match Keep-Up runtime and tooling.

## Implementation Roadmap

Phase 1: Robustness
- Add completion tool contract with schema validation.
- Add final-warning recovery turn with strict completion-only rule.
- Enforce interactive vs batch parallelism policy.

Phase 2: Persistence
- Integrate CheckpointManager into orchestrator turn boundaries.
- Persist pending and completed tool calls.
- Add recovery workflows and replay hooks.

Phase 3: Specialization
- Implement RoleRegistry and SOPExecutor.
- Ship SOPs for Coder, Researcher, Reviewer, Architect.
- Add delegation tool and lineage tracking.

Phase 4: Optimization
- Add model routing with health-based fallback.
- Extend observability dashboards for trace and event inspection.

## Risks and Mitigations
- Complexity growth: keep optional features behind config flags.
- Non-deterministic tools: record inputs and outputs in checkpoints for replay.
- Permission fatigue: cache approvals with scoped expiry.

## Open Questions
- Which tasks require strict single-tool steps vs batch parallelism?
- What is the minimal event payload for deterministic replay?
- How should checkpoint storage align with Loro snapshots and LFCC logs?

---

Prepared by Codex
