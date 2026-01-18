# [SUPERSEDED] Unified 2026 Agent Architecture

> **NOTE:** This document is now historical. The authoritative specification is at `docs/specs/agent-runtime-spec-2026.md`.

# Unified 2026 Agent Architecture: Source-Based Comparative Analysis and Best Technical Solution

> Date: 2026-01-18
> Scope: OpenCode, Gemini CLI, AutoGen, MetaGPT, LangGraph, CrewAI, Keep-Up agent-runtime
> Evidence: .tmp/analysis sources and packages/agent-runtime
> Goal: Derive a best-in-class architecture blueprint for keep-up

## Executive Summary

This report distills source-level patterns from leading agent frameworks and synthesizes a unified, production-grade architecture for the keep-up agent runtime. The key insight is that the strongest systems converge on three principles: deterministic control flow, explicit tool governance, and durable state recovery. The proposed solution combines LangGraph-style step semantics, Gemini CLI-style completion discipline and recovery, AutoGen-style message routing, MetaGPT role SOPs, CrewAI hierarchical orchestration, and Keep-Up's existing planning and security engines.

Key outcomes:
- Adopt a deterministic, resumable agent loop with explicit completion semantics and recovery turns.
- Promote a layered memory system: short-term compression, long-term retrieval, and durable checkpoints.
- Standardize tool execution with schema-gated calls, per-agent tool registries, and dependency-aware parallelism.
- Provide a multi-agent control plane with message routing, delegation, and per-run audit trails.
- Align AI mutation flows with LFCC and the AI Envelope to preserve local-first determinism.

## 1. Source-Backed Findings by Framework

### OpenCode
- Agent loop uses streaming provider events, tool call parsing, and a repeat loop until completion. Source: `.tmp/analysis/opencode/internal/llm/agent/agent.go`.
- Recursive delegation through an "agent-as-tool" pattern that spawns a child agent with a dedicated tool set. Source: `.tmp/analysis/opencode/internal/llm/agent/agent-tool.go`.
- Dynamic MCP tool discovery with explicit permission gating for each call. Source: `.tmp/analysis/opencode/internal/llm/agent/mcp-tools.go`.
- Summarization and title generation for session management and cost tracking. Source: `.tmp/analysis/opencode/internal/llm/agent/agent.go`.

### Gemini CLI
- LocalAgentExecutor enforces a strict completion tool (`complete_task`) and treats non-compliance as an error. Source: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`.
- Recovery via a final warning turn with a grace period for timeouts and max-turn failures. Source: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`.
- Chat compression service manages context windows with clear status handling. Source: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`.
- Isolated tool registry per agent and explicit schema injection for tools. Source: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`.
- Model routing and fallback on routing failures. Source: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`.

### AutoGen
- Single-threaded runtime uses a queue of message envelopes and processes send, publish, and response flows. Source: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.
- Intervention handlers intercept or drop messages before delivery, providing a safety hook. Source: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.
- save_state/load_state provides durable agent state persistence. Source: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.
- OpenTelemetry tracing is integrated at runtime and message handler levels. Source: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.

### MetaGPT
- Team and Environment implement role-based collaboration with message routing and a shared context. Source: `.tmp/analysis/MetaGPT/metagpt/team.py`, `.tmp/analysis/MetaGPT/metagpt/environment/base_env.py`.
- Role loop supports ReAct or Plan-and-Act strategies, with memory and observation buffers. Source: `.tmp/analysis/MetaGPT/metagpt/roles/role.py`.
- Planner-driven task execution allows role-specific SOPs to govern actions. Source: `.tmp/analysis/MetaGPT/metagpt/roles/role.py`.

### LangGraph
- Pregel model executes in steps (plan, execute, update) with channel-based state. Source: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/main.py`.
- Channel read and write abstractions enforce explicit state flow. Source: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/_read.py`, `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/_write.py`.
- Checkpointer and durability modes provide deterministic recovery. Source: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/_loop.py`.
- Streaming output and interrupts allow external control of long runs. Source: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/main.py`.

### CrewAI
- Crew executes tasks in sequential or hierarchical process modes. Source: `.tmp/analysis/crewAI/lib/crewai/src/crewai/crew.py`.
- Manager agent orchestrates delegation in hierarchical mode. Source: `.tmp/analysis/crewAI/lib/crewai/src/crewai/crew.py`.
- Agents use memory tiers, knowledge retrieval, and tool preparation within task execution. Source: `.tmp/analysis/crewAI/lib/crewai/src/crewai/agent/core.py`.
- Tasks support guardrails, structured outputs, and async execution. Source: `.tmp/analysis/crewAI/lib/crewai/src/crewai/task.py`.

### Keep-Up Baseline
- Orchestrator provides a state machine, planning, tool scheduling, and event-driven telemetry. Source: `packages/agent-runtime/src/orchestrator/orchestrator.ts`.
- TurnExecutor performs message compression, knowledge injection, and request caching. Source: `packages/agent-runtime/src/orchestrator/turnExecutor.ts`.
- Error recovery engine enforces retry policies and avoids repeating failed tool calls. Source: `packages/agent-runtime/src/orchestrator/errorRecovery.ts`.
- AgentManager supports spawning and parallel execution with profile-based tool scopes. Source: `packages/agent-runtime/src/agents/manager.ts`.
- Planning engine persists plans to file when enabled. Source: `packages/agent-runtime/src/orchestrator/planning.ts`.

## 2. Comparative Matrix (1-5 scale)

| Framework | Loop and Runtime | Memory and Persistence | Tooling and Execution | Multi-Agent Orchestration | Observability and DX | Provider Abstraction |
| --- | --- | --- | --- | --- | --- | --- |
| OpenCode | 4 - streaming loop + tool handling | 3 - summaries + session store | 4 - MCP + permissions + agent tool | 3 - recursion via agent tool | 3 - event broker + logs | 4 - provider interface |
| Gemini CLI | 5 - strict completion + recovery | 4 - compression + curated history | 5 - isolated registry + schema + complete tool | 2 - single agent focus | 5 - activity stream + telemetry | 5 - model routing + config |
| AutoGen | 4 - queue-based runtime | 4 - save/load state | 3 - message handler tools | 5 - actor model + subscriptions | 4 - OpenTelemetry | 3 - extension-based |
| MetaGPT | 3 - role ReAct and plan loops | 3 - role memory | 3 - action nodes | 4 - team and environment | 3 - logging | 2 - provider coupling |
| LangGraph | 5 - pregel steps + interrupts | 5 - checkpointer + durability | 4 - explicit read/write channels | 4 - graph + subgraphs | 4 - streaming + debug | 3 - LLM as nodes |
| CrewAI | 4 - sequential or hierarchical | 4 - memory tiers + retrieval | 4 - tool injection + guardrails | 4 - manager delegation | 4 - event bus + tracing | 3 - LLM wrapper |
| Keep-Up | 4 - state machine + planning | 4 - compression + plan persistence + checkpoints infra | 4 - scheduler + policies + MCP | 4 - agent manager + profiles | 4 - event bus + telemetry | 4 - IAgentLLM |

## 3. Cross-Framework Best Patterns

### A. Deterministic Agent Loop and Recovery
- Explicit completion tool is the most reliable finish mechanism (Gemini CLI).
- Recovery turns with a grace period reduce incomplete outputs under timeouts (Gemini CLI).
- Pregel step boundaries make execution resumable and debuggable (LangGraph).
- Avoid repeating failed actions via deduped error signatures (Keep-Up error recovery).

### B. Memory and Persistence
- Compression and curated history reduce context churn (Gemini CLI, Keep-Up TurnExecutor).
- Durable state snapshots enable pause/resume and audit (LangGraph, AutoGen).
- Role memory with structured observation buffers improves multi-role reasoning (MetaGPT).

### C. Tooling and Execution
- Tool schema injection and per-agent registry isolation prevent misuse (Gemini CLI).
- MCP discovery plus permission gating enables flexible integration (OpenCode, Keep-Up).
- Dependency-aware parallelism improves throughput for safe tool clusters (Keep-Up).

### D. Multi-Agent Orchestration
- Message routing via publish/subscribe scales agent collaboration (AutoGen).
- Manager delegation in hierarchical flows clarifies ownership and boundaries (CrewAI).
- Agent-as-tool provides recursive delegation with explicit boundaries (OpenCode).

### E. Observability and DX
- Structured event streams and OpenTelemetry tracing are consistent differentiators (AutoGen, CrewAI, Keep-Up).
- Step-level debug output and streamable traces improve tooling UX (LangGraph, Keep-Up).

### F. Provider Abstraction and Model Routing
- First-class model routing enables cost and quality optimization (Gemini CLI).
- A minimal, well-defined LLM interface keeps providers swappable (Keep-Up).

## 4. Gap Analysis for Keep-Up

The keep-up runtime is already strong, but these gaps are visible when mapped against the best patterns above:

1. Completion Semantics
- Keep-Up lacks a mandatory completion tool and does not enforce explicit finalization on tool-only loops.
- Recommendation: add a `complete_task` or `final_response` tool contract for agent tasks, with validation.

2. Recovery Turn Discipline
- Error recovery exists, but the loop does not include a final warning turn for timeouts or max-turn exits.
- Recommendation: implement a single recovery turn with a grace period and strict tool constraints.

3. Runtime-Level Messaging
- AgentManager handles spawning, but there is no explicit agent-to-agent message bus analogous to AutoGen publish/send.
- Recommendation: add a runtime message envelope and subscription layer for inter-agent collaboration.

4. Policy Consistency for Tool Parallelism
- The agent loop specification enforces single-tool calls while the orchestrator schedules parallel tool groups.
- Recommendation: define policy tiers (interactive vs batch) and enforce consistency via configuration.

5. Checkpoint Integration
- Checkpoint infrastructure exists, but it is not integrated into the core orchestrator loop for full run recovery.
- Recommendation: link checkpoint creation to turn boundaries and tool execution status.

6. Model Routing
- Keep-Up uses provider abstraction but lacks automatic routing and fallback strategies.
- Recommendation: add routing logic with model health and cost heuristics.

## 5. Unified 2026 Architecture for Keep-Up

### 5.1 Design Principles
- Deterministic execution with explicit completion and step boundaries.
- Local-first durability with resumable checkpoints and event sourcing.
- Safe tool execution with explicit permissions and precondition validation.
- Composable multi-agent collaboration via message routing and delegation.
- Observability by default with event streams and traces.

### 5.2 Core Components

1. Control Plane
- AgentManager: spawn, track, and limit nested agents.
- Runtime Message Bus: send, publish, respond envelopes (AutoGen pattern).
- Policy Engine: per-agent tool registry, escalation, approval gates.

2. Execution Plane
- Orchestrator: state machine for perception, thinking, decision, action, observation.
- TurnExecutor: compression, knowledge injection, caching, LLM execution.
- Tool Scheduler: dependency graph, parallel groups, concurrency limits.

3. Persistence Plane
- Checkpoint Manager: turn-level snapshots with tool call states.
- Plan Persistence: file-backed plan recovery and plan history.
- Event Log: append-only run stream for audit and replay.

4. Knowledge and Memory
- Short-term: compressed message history.
- Working memory: session facts and task graph state.
- Long-term: retrievable knowledge sources.

### 5.3 Turn Flow (Text Diagram)

```
User Input
  -> Orchestrator (start cycle)
    -> TurnExecutor
      -> Compress + Knowledge Inject
      -> LLM Complete
    -> Decision
      -> complete_task? -> finalize
      -> tool_calls? -> Tool Scheduler -> Tool Executor
    -> Observation -> Checkpoint -> Next cycle
```

### 5.4 Completion Contract
- Introduce a required completion tool for top-level tasks and delegated agents.
- Validate output schema and enforce single-call completion.
- On timeout or max turns, issue one recovery prompt with a strict grace period.

### 5.5 Multi-Agent Messaging
- Implement message envelopes and subscriptions similar to AutoGen.
- Provide a "delegation" tool that sends messages and awaits responses.
- Keep control plane responsible for limits and audit.

### 5.6 Tool Governance
- Per-agent tool registries with explicit allowlists.
- Permission gating and escalation for sensitive tools.
- MCP discovery unified with tool policies and audit logs.

### 5.7 Persistence and Recovery
- Create a checkpoint at the end of every completed turn.
- Store pending tool calls and their partial outputs.
- Allow replay from a checkpoint with deterministic tool and state rehydration.

### 5.8 Provider Abstraction and Routing
- Add a model router that selects between fast and large models based on task phase.
- Integrate fallback on routing failures and provider errors.

### 5.9 AI Envelope and LFCC Alignment
- Agent output mutates documents only via the AI Gateway.
- Every mutation includes doc_frontier and preconditions, ensuring deterministic CRDT merges.
- Agent state updates are recorded in Loro-derived artifacts for local-first consistency.

## 6. Implementation Roadmap

Phase 1 (2-4 weeks)
- Add completion tool contract and recovery turn.
- Define policy tiers for tool parallelism.
- Extend event stream to include completion and recovery events.

Phase 2 (4-8 weeks)
- Integrate CheckpointManager into orchestrator turn boundaries.
- Add runtime message bus and subscription APIs.
- Add model router and fallback behavior.

Phase 3 (8-12 weeks)
- Expand memory tiers and retrieval policies.
- Build SOP templates for role-based execution.
- Add visual run inspector powered by event log + checkpoints.

## 7. Risks and Mitigations

- Risk: Increased complexity in orchestration.
  Mitigation: Keep core loop minimal, move optional features behind config flags.
- Risk: Non-deterministic tool output breaks replay.
  Mitigation: record tool inputs and outputs in checkpoints and event logs.
- Risk: Permission escalation fatigue.
  Mitigation: cache approvals with explicit scope and expiry.

## 8. Open Questions

- Which tasks should require strict single-tool steps vs parallel execution?
- What is the minimal event payload to support full replay while respecting privacy?
- How should checkpoint storage map to local-first CRDT persistence and LFCC logs?

