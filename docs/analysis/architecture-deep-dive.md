# Architecture Deep Dive: .tmp/analysis Agent Frameworks

Analysis Date: 2026-01-20
Scope: Source-level analysis of `.tmp/analysis/`
Projects: OpenCode (Go), Cline (TypeScript), Roo-Code (TypeScript), AutoGPT (Python), AutoGen (Python), MetaGPT (Python), LangGraph (Python), CrewAI (Python), Gemini CLI (TypeScript), open-interpreter (Python)

---

## Executive Summary

This review expands the previous four-project snapshot to cover all 10 analyzed repositories under `.tmp/analysis/`.
Across these systems, the same pillars reappear:
- Event or message buses for deterministic orchestration.
- Tool governance with isolated registries, approvals, and hook systems.
- Durable checkpoints and rewindable history.
- Explicit multi-agent roles and team orchestration.
- Streaming-first execution loops and recovery contracts.

---

## 1. OpenCode (Go)

Key Finding: Event-driven runtime with explicit permission gating and session persistence.

Source Highlights:
- `internal/pubsub/broker.go`: Generic pub/sub broker with buffered channels and subscriber lifecycle management.
- `internal/permission/permission.go`: Tool permission requests, auto-approval per session, and pub/sub notifications.
- `internal/session/session.go`: SQLite-backed session service with pub/sub events.
- `internal/lsp/`: LSP lifecycle and transport wiring for editor integrations.

Relevance:
- Runtime message bus and permission gating map directly to Keep-Up execution-plane needs.

---

## 2. Cline (TypeScript)

Key Finding: Local-first VS Code agent with MCP hub, OAuth, auto-approval, and hooks.

Source Highlights:
- `src/services/mcp/McpHub.ts`: MCP server lifecycle, transport selection, OAuth-aware connections, and settings watch.
- `src/services/mcp/McpOAuthManager.ts`: OAuth token persistence and provider orchestration.
- `src/core/task/ToolExecutor.ts`: Tool routing, auto-approval, and hook integration via `TaskConfig`.
- `src/core/task/tools/ToolExecutorCoordinator.ts`: Registry-driven tool handler mapping.
- `src/core/hooks/hook-factory.ts`: Hook runner with validation, timeouts, and context injection.

Relevance:
- Provides reference implementations for MCP hub + hook policy integration.

---

## 3. Roo-Code (TypeScript)

Key Finding: Git-based shadow checkpoints with rewindable conversation history and file context tracking.

Source Highlights:
- `src/services/checkpoints/ShadowCheckpointService.ts`: Shadow git repo creation, sanitized git env, checkpoint save/restore, diffing.
- `src/services/checkpoints/RepoPerTaskCheckpointService.ts`: Per-task checkpoint directory strategy.
- `src/core/message-manager/index.ts`: Rewind logic that cleans summaries/truncation markers after checkpoint restore.
- `src/core/context-tracking/FileContextTracker.ts`: Stale-file detection and context reload tracking for safe edits.

Relevance:
- Strong blueprint for workspace-level time travel + context integrity.

---

## 4. AutoGPT (Python)

Key Finding: Agent Protocol with explicit task/step/artifact API and component-driven agent pipeline.

Source Highlights:
- `classic/forge/forge/agent/forge_agent.py`: Component pipeline (commands, directives, messages) and step execution flow.
- `classic/forge/forge/agent_protocol/agent.py`: Agent Protocol HTTP surface for tasks, steps, and artifacts.
- `classic/forge/forge/agent_protocol/models/task.py`: Typed schema for Task/Step lifecycle.

Relevance:
- Externalized agent protocol aligns with Keep-Up artifact pipeline and API strategy.

---

## 5. AutoGen (Python)

Key Finding: Actor-style agent runtime with message envelopes and tool workbench lifecycle.

Source Highlights:
- `python/packages/autogen-core/src/autogen_core/_agent_runtime.py`: Runtime interface (send, publish, register).
- `python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py`: Envelope queue, telemetry, intervention handlers.
- `python/packages/autogen-core/src/autogen_core/tools/_workbench.py`: Stateful tool workbench with list/call/save/load APIs.
- `python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat.py`: Group chat team wiring via topics.

Relevance:
- Patterns for runtime messaging and stateful tool workbenches.

---

## 6. MetaGPT (Python)

Key Finding: Role-based SOPs with environment routing and explicit memory buffers.

Source Highlights:
- `metagpt/team.py`: Team orchestration with budget guardrails and environment linkage.
- `metagpt/environment/base_env.py`: Environment messaging with send_to routing and API registries.
- `metagpt/roles/role.py`: Role context, memory buffers, and plan/act strategies.

Relevance:
- Informs multi-agent role design and message routing semantics.

---

## 7. LangGraph (Python)

Key Finding: Graph execution engine with explicit channels, retry policies, and durable checkpoints.

Source Highlights:
- `libs/langgraph/langgraph/pregel/main.py`: Pregel graph orchestration, channel IO, streaming, and retries.
- `libs/checkpoint/langgraph/checkpoint/base/__init__.py`: Checkpoint schema and saver interface.

Relevance:
- Guides graph runtime design and checkpoint durability requirements.

---

## 8. CrewAI (Python)

Key Finding: Team orchestration with sequential/hierarchical processes and event bus tracing.

Source Highlights:
- `lib/crewai/src/crewai/crew.py`: Crew orchestration, process modes, memory tiers.
- `lib/crewai/src/crewai/events/event_bus.py`: Event bus with sync/async handler scheduling.
- `lib/crewai/src/crewai/memory/`: Short-term, long-term, entity, and external memory stores.

Relevance:
- Provides process-mode patterns and event bus design for tracing.

---

## 9. Gemini CLI (TypeScript)

Key Finding: Strict completion contract with tool isolation, policy engine, and confirmation bus.

Source Highlights:
- `packages/core/src/agents/local-executor.ts`: Mandatory `complete_task`, recovery turn, isolated tool registry.
- `packages/core/src/confirmation-bus/message-bus.ts`: Policy-gated request/response bus.
- `packages/core/src/policy/policy-engine.ts`: Rule-based approvals and command parsing.
- `packages/core/src/tools/tool-registry.ts`: Dynamic tool discovery and registry isolation.

Relevance:
- Blueprint for completion enforcement, tool isolation, and approval policies.

---

## 10. open-interpreter (Python)

Key Finding: Streaming loop with OS-level tools and computer-use sampling pipeline.

Source Highlights:
- `interpreter/core/async_core.py`: Async server, streaming output queue, and run control.
- `interpreter/core/respond.py`: LLM loop with tool execution and error handling.
- `interpreter/computer_use/loop.py`: Computer-use tool collection and streaming sampling loop.

Relevance:
- Reference for computer-use tool loop, multimodal outputs, and streaming control.

---

## Cross-Framework Patterns

1. Message Bus and Event Streams
   - OpenCode pub/sub, CrewAI event bus, AutoGen runtime envelopes.
2. Tool Governance and Isolation
   - Gemini CLI isolated tool registry, Cline auto-approval + hooks, OpenCode permission gating.
3. Durable State and Rewind
   - LangGraph checkpoint savers, Roo-Code shadow git checkpoints.
4. Multi-Agent Collaboration
   - AutoGen group chat teams, MetaGPT roles, CrewAI process modes.
5. Streaming-First Execution
   - Gemini CLI and open-interpreter emphasize streaming loops and recovery turns.

---

## Keep-Up Implications (Next Phase)

- Add graph execution runtime with explicit channel reads/writes and retry policies (LangGraph).
- Formalize team orchestration and role routing (AutoGen, MetaGPT, CrewAI).
- Introduce a workbench abstraction for stateful tool lifecycles and dynamic discovery (AutoGen, Gemini CLI, Cline).
- Expand policy and approval engine beyond MCP to cover all tools (Gemini CLI, OpenCode).
- Implement workspace-level checkpoints and time travel (Roo-Code).
- Add computer-use tools and streaming loops for multimodal tasks (open-interpreter).

