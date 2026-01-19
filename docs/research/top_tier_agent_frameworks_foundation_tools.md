# Top-Tier Agent Frameworks: Deep Source Review and Foundation Tool Borrowing

Status: Draft  
Date: 2026-01-19  
Scope: `.tmp/analysis` (OpenCode, Gemini CLI, AutoGen, MetaGPT, LangGraph, CrewAI)  
Goal: Extract source-backed architecture patterns and map them to Keep-Up runtime upgrades.

## 1. Executive Summary

The strongest agent systems converge on a small set of repeatable building blocks:
- Deterministic loops with an explicit completion contract and recovery turn.
- Tool governance with isolated registries, schema gating, and permission checks.
- Durable checkpoints and replayable state at turn boundaries.
- Multi-agent orchestration with message routing and delegation boundaries.
- Context compression and output truncation to keep long tasks stable.
- Observability-first design: event streams, traces, and structured artifacts.

Keep-Up already implements many of these pillars, but the .tmp sources highlight specific
low-level mechanics (tool isolation, queue envelopes, truncation policy) that can elevate
robustness and recovery to a top-tier standard.

## 2. Source Highlights by Framework

### OpenCode (Go)
- Event-driven agent loop with session isolation and cancellation: `.tmp/analysis/opencode/internal/llm/agent/agent.go`.
- Agent-as-tool recursion with cost roll-up to parent session: `.tmp/analysis/opencode/internal/llm/agent/agent-tool.go`.
- MCP tool discovery with explicit permission gating: `.tmp/analysis/opencode/internal/llm/agent/mcp-tools.go`.
- Fuzzy patch parsing and tolerant context matching: `.tmp/analysis/opencode/internal/diff/patch.go`.

### Gemini CLI (TypeScript)
- Mandatory completion tool (`complete_task`) and strict termination rules: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`.
- Final warning recovery turn with a grace period for timeouts: `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts`.
- Isolated tool registry per agent and safe tool discovery: `.tmp/analysis/gemini-cli/packages/core/src/tools/tool-registry.ts`.
- Context compression plus tool output truncation and spooling: `.tmp/analysis/gemini-cli/packages/core/src/services/chatCompressionService.ts`.

### AutoGen (Python)
- Actor-style runtime with queue envelopes (send, publish, response): `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.
- Intervention handlers to drop or rewrite messages before delivery: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.
- OpenTelemetry hooks wired into runtime dispatch: `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`.

### MetaGPT (Python)
- Role objects with memory, SOP phases, and explicit plan/act modes: `.tmp/analysis/MetaGPT/metagpt/roles/role.py`.
- Message routing consolidated into Environment and role buffers: `.tmp/analysis/MetaGPT/metagpt/roles/role.py`.

### LangGraph (Python)
- Pregel step-based execution with explicit channels for reads/writes: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/main.py`.
- Checkpointer-backed durability and resumable steps: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/_loop.py`.
- Streaming and interrupt controls for long runs: `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/main.py`.

### CrewAI (Python)
- Sequential and hierarchical process modes with manager orchestration: `.tmp/analysis/crewAI/lib/crewai/src/crewai/crew.py`.
- Memory tiers, training hooks, and event bus for tracing: `.tmp/analysis/crewAI/lib/crewai/src/crewai/crew.py`.

## 3. Cross-Framework Architecture Patterns

1. Completion Contract
   - Termination must be explicit, tool-driven, and validated.
2. Tool Governance
   - Per-agent registry isolation + schema validation + permission checks.
3. Durable State
   - Turn-level checkpoints and replay-friendly logs.
4. Multi-Agent Orchestration
   - Clear delegation boundaries and message routing semantics.
5. Context Control
   - Compression and output truncation to avoid context collapse.
6. Observability
   - Streaming events, traces, and artifact pipelines for audits.

## 4. Foundational Toolset to Borrow (Keep-Up Mapping)

### Already Present in Keep-Up (Baseline Strengths)
- Completion contract and recovery warnings in the orchestrator: `packages/agent-runtime/src/orchestrator/orchestrator.ts`.
- Error recovery and tool dedupe: `packages/agent-runtime/src/orchestrator/errorRecovery.ts`.
- Per-agent SOP roles and gate enforcement: `packages/agent-runtime/src/sop/`.
- Delegation and subagent orchestration: `packages/agent-runtime/src/tools/core/delegation.ts`, `packages/agent-runtime/src/tools/core/subagent.ts`, `packages/agent-runtime/src/orchestrator/subagentOrchestrator.ts`.
- Event stream bridge and artifact telemetry: `packages/agent-runtime/src/streaming/runtimeEventBridge.ts`.
- Context compression for long tasks: `packages/agent-runtime/src/orchestrator/messageCompression.ts`.

### Gaps to Close (Source-Backed Upgrades)
1. Agent-to-Agent Message Bus
   - Add send/publish/response envelopes similar to AutoGen to support routed collaboration.
2. Turn-Boundary Checkpoints
   - Integrate `CheckpointManager` into orchestrator turn lifecycle for replayable recovery.
3. Tool Output Spooling
   - Add Gemini-style truncation and file spooling for large tool outputs.
4. Tool Registry Isolation for Subagents
   - Ensure subagents use isolated registries with explicit allowlists.
5. Model Routing Fallback
   - Extend router with health, cost, and failover signals (Gemini-style).

## 5. Priority Upgrade Backlog (Top-Tier Track)

### P0 (Reliability)
- Wire `CheckpointManager` into orchestrator turn boundaries and tool execution results.
- Introduce a runtime message bus for agent-to-agent send/publish/response.
- Add tool output truncation with honest disclosure and file spooling.
- Enforce tool registry isolation in delegated and subagent runs.

### P1 (Scale)
- Health-aware model routing and retry strategy.
- Intervention handlers for message-level safety and throttling.
- Manager agent flow for hierarchical orchestration (CrewAI pattern).

### P2 (Quality and Evaluation)
- Codified evaluation suite and scoring (task success, regression rate, recovery success).
- Training hooks for replay and offline analysis.

## 6. Keep-Up Action Plan Linkage

This memo feeds directly into `implementation_plan.md` and the top-tier upgrade tasks in `task.md`.
Each P0 item maps to the runtime modules identified above and should be tracked as a discrete
feature with targeted tests and walkthrough steps.
