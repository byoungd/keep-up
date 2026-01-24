# Agent Runtime Deep Research Report
Date: 2026-01-24
Scope: Source analysis of agent runtimes and core-agent patterns across local clones in .tmp/analysis (Claude Code, Codex, OpenCode, and related agent frameworks). Output is intended to inform optimization of Open Wrap agent-runtime core agents.

## 1) Methodology
- Read top-level docs and architecture notes.
- Inspected runtime and agent-loop code where available.
- Focused on: agent loop design, tool orchestration, memory and context, multi-agent control, safety/approval/sandboxing, and extensibility.

## 2) Repo-by-repo findings

### 2.1 Claude Code (anthropics/claude-code)
Status: The repo does not contain the closed-source core runtime; it includes plugin examples and integration scaffolding.
Key findings:
- Plugin system supports commands, agents, skills, hooks, and MCP server configuration.
- Plugins are structured with explicit directories for commands, agents, skills, hooks, and MCP config.
- Several example plugins demonstrate multi-agent orchestration and role-based agent design (e.g., code review toolkits with parallel agents).
Implication:
- Claude Code exposes a clean external agent extension model; runtime remains opaque, but plugin system demonstrates that agent definitions are first-class objects with lifecycle hooks and tool integration.

Key files:
- .tmp/analysis/claude-code/plugins/README.md

### 2.2 Codex (openai/codex)
Status: Full Rust implementation of Codex CLI (codex-rs) with rich runtime logic.
Key findings:
- codex-core implements the agent business logic and tool routing.
- Tool orchestration centralizes approvals, sandbox selection, and escalation. The orchestrator performs approval checks, selects sandbox, runs tool, and optionally escalates to no-sandbox execution on denial.
- Tool routing supports multiple tool call types (function, custom, MCP, local shell). Tool calls can be executed in parallel with per-tool gating (parallel vs exclusive tools).
- Multi-agent collaboration exists via tools/handlers/collab (spawn, send input, wait, close). AgentControl manages agent threads with status tracking and interruption.
- MCP is supported as a client and (experimentally) as a server.
- Execution policies and sandbox modes are first-class (read-only, workspace-write, danger-full-access, etc.).
- Headless mode (codex exec) supports non-interactive runs.
Implication:
- Codex provides one of the most complete reference implementations for local agent runtime: explicit approval pipeline, sandbox escalation, tool call concurrency rules, agent spawning, and multi-agent status control.

Key files:
- .tmp/analysis/codex/codex-rs/core/src/agent/control.rs
- .tmp/analysis/codex/codex-rs/core/src/tools/orchestrator.rs
- .tmp/analysis/codex/codex-rs/core/src/tools/router.rs
- .tmp/analysis/codex/codex-rs/core/src/tools/parallel.rs
- .tmp/analysis/codex/codex-rs/core/src/mcp/mod.rs

### 2.3 OpenCode (opencode-ai/opencode) [Archived, moved to "Crush"]
Status: Archived. Codebase provides a clear view of a CLI coding agent runtime in Go.
Key findings:
- Multiple agent profiles (coder, task, summarizer, title) with configurable models and max tokens.
- Agent loop streams LLM output, handles tool calls, and iterates until no tool calls remain.
- Explicit agent tool spawns a stateless sub-agent with a restricted tool set (glob/grep/ls/view). This is used for delegated searching; results are returned to the parent for user-visible output.
- Auto-compact: automatic summarization when approaching model context limit, creating a new session with summary.
- Persistent storage (SQLite), session management, file change tracking, and LSP integration.
- System prompt includes strong operational constraints and emphasis on applying patches, sandboxing, and telemetry.
Implication:
- OpenCode demonstrates clean separation of main agent and stateless sub-agent tool, plus automatic summarization and multi-agent task sessions with cost aggregation.

Key files:
- .tmp/analysis/opencode/internal/llm/agent/agent.go
- .tmp/analysis/opencode/internal/llm/agent/agent-tool.go
- .tmp/analysis/opencode/internal/llm/prompt/coder.go
- .tmp/analysis/opencode/README.md

### 2.4 Gemini CLI (google-gemini/gemini-cli)
Status: Full open-source CLI with a structured agent runtime in packages/core.
Key findings:
- Agent definitions are typed (inputs, outputs, prompt config, tool config, run config). Local vs remote agents are supported.
- Local agent executor runs a tool-driven loop that requires a complete_task tool call to terminate, and enforces max time/turns.
- Tool registry is isolated per agent and explicitly prevents recursion (agents cannot call other agents as tools unless explicitly permitted).
- Subagent tool wraps agent definitions; remote agents can require confirmation before execution.
- Agent registry loads built-in agents plus user/project/extension agents; uses folder trust gating; supports model overrides.
- Policy engine controls approval modes and safety checks; supports in-process and external safety checkers.
- Chat compression service reduces context size during long runs.
Implication:
- Gemini CLI provides a modern, typed agent definition model with explicit termination protocol, per-agent tool isolation, schema validation for inputs, and a configurable policy engine.

Key files:
- .tmp/analysis/gemini-cli/packages/core/src/agents/types.ts
- .tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts
- .tmp/analysis/gemini-cli/packages/core/src/agents/registry.ts
- .tmp/analysis/gemini-cli/packages/core/src/agents/subagent-tool.ts
- .tmp/analysis/gemini-cli/packages/core/src/policy/types.ts

### 2.5 Cline (cline/cline)
Status: Full VS Code extension with human-in-the-loop agent runtime.
Key findings:
- Task loop orchestrates tools through a ToolExecutorCoordinator with extensive tool handlers (files, browser, MCP, skills, patching, plan/act modes).
- Auto-approval and permission gating are core; command permission controller and cline ignore integration.
- Focus chain mechanism drives explicit progress tracking via a task checklist file, with UI updates and telemetry.
- Checkpoints and diff views support safe rollback and human review.
Implication:
- Cline demonstrates a mature, user-facing agent runtime that prioritizes transparent tool usage, checkpoints, and explicit progress tracking to avoid silent failure modes.

Key files:
- .tmp/analysis/cline/src/core/task/ToolExecutor.ts
- .tmp/analysis/cline/src/core/task/focus-chain/index.ts
- .tmp/analysis/cline/README.md

### 2.6 Roo Code (RooVetGit/Roo-Code)
Status: VS Code extension, similar class of product as Cline.
Key findings:
- Task orchestrator with tool invocation, context management, and tool repetition detection.
- Auto-approval logic and MCP tool gating, plus model-specific tool result normalization for many providers.
- File context tracking and diff view integration.
Implication:
- Roo Code shows the operational need for provider-specific tool formatting and loop-detection safeguards, and reinforces the importance of auto-approval heuristics.

Key files:
- .tmp/analysis/Roo-Code/src/core/task/Task.ts
- .tmp/analysis/Roo-Code/src/core/auto-approval/index.ts
- .tmp/analysis/Roo-Code/src/api/transform/*.ts

### 2.7 AutoGen (microsoft/autogen)
Status: Framework for multi-agent systems with layered architecture.
Key findings:
- autogen-core uses an actor model and supports local and distributed runtime.
- autogen-agentchat provides higher-level agents and teams (AssistantAgent, UserProxy, SocietyOfMind, etc.).
- AssistantAgent supports iterative tool use, parallel tool calls, reflection on tool use, tool-call summaries, and structured outputs.
- Model context can be bounded with token-limited contexts.
Implication:
- AutoGen provides modular, composable primitives for multi-agent orchestration, with strong separation between runtime (core) and application-level workflows (agentchat).

Key files:
- .tmp/analysis/autogen/README.md
- .tmp/analysis/autogen/python/packages/autogen-agentchat/src/autogen_agentchat/agents/_assistant_agent.py

### 2.8 LangGraph (langchain-ai/langgraph)
Status: Graph-based orchestration framework for long-running, stateful agents.
Key findings:
- State graph model (nodes, edges, typed state) with durable execution and checkpointing.
- Human-in-the-loop support via interrupts and state inspection.
- Memory support for short-term and long-term persistence.
Implication:
- Graph orchestration is a strong fit for complex multi-agent flows and long-running processes with durable execution and state inspection.

Key files:
- .tmp/analysis/langgraph/README.md

### 2.9 CrewAI (crewAIInc/crewAI)
Status: Multi-agent orchestration framework.
Key findings:
- "Crews" model autonomous role-based collaboration.
- "Flows" model event-driven workflows for production reliability.
- Emphasis on flexibility and low-level customization.
Implication:
- CrewAI highlights the value of separate abstractions for autonomous teams vs deterministic workflow graphs.

Key files:
- .tmp/analysis/crewAI/README.md

### 2.10 MetaGPT (geekan/MetaGPT)
Status: Multi-agent framework modeled as a software company with SOP-driven roles.
Key findings:
- Agents mapped to roles (PM, architect, engineer, etc.).
- Emphasis on SOPs to standardize multi-step software delivery.
Implication:
- SOP-driven role orchestration is a practical way to increase reliability and reduce agent drift on complex tasks.

Key files:
- .tmp/analysis/MetaGPT/README.md

### 2.11 AutoGPT (Significant-Gravitas/AutoGPT)
Status: Platform for building, deploying, and running agents and workflows.
Key findings:
- Focuses on agent builder, workflow blocks, and deployment orchestration.
- Agent protocol and benchmarking (agbenchmark) are central to evaluation.
Implication:
- AutoGPT emphasizes productized agent workflows and benchmarks to validate agent performance in production.

Key files:
- .tmp/analysis/AutoGPT/README.md

### 2.12 Open Interpreter (OpenInterpreter/open-interpreter)
Status: Local code execution agent with explicit approval before running code.
Key findings:
- Runs code locally with user approval gates.
- Supports multiple languages and streaming results.
- Emphasizes local execution and tool safety.
Implication:
- Strong human-in-loop safeguards and local execution model are key for trust when running arbitrary code.

Key files:
- .tmp/analysis/open-interpreter/README.md

### 2.13 Eigent (eigent-ai/eigent)
Status: Cowork desktop for multi-agent workforce.
Key findings:
- Multi-agent workforce with predefined specialized agents (developer, browser, document, multimodal).
- MCP integration and human-in-the-loop support.
Implication:
- Eigent shows a practical division of labor across agent types and highlights the importance of MCP tooling in an agent workforce.

Key files:
- .tmp/analysis/eigent/README.md

## 3) Cross-repo patterns and contrasts

### 3.1 Agent loop patterns
Common:
- Tool-call-driven loops with repeated tool invocations until a termination condition is met.
- Context compression or summarization mechanisms for long runs (OpenCode auto-compact, Gemini chat compression, AutoGen model_context).

Notable variations:
- Gemini requires an explicit complete_task tool to terminate (strong protocol enforcement).
- AutoGen supports reflective loops (tool result -> model reflection) and a configurable max tool iteration count.

### 3.2 Tooling and orchestration
Common:
- Tool registries with tool metadata and structured schemas.
- Explicit tool gating for approvals and safety.

Notable variations:
- Codex: centralized ToolOrchestrator handles approvals, sandbox selection, and escalation.
- Gemini: policy engine with approval modes and pluggable safety checkers.
- OpenCode: sub-agent tool with fixed tool set for delegated search tasks.

### 3.3 Multi-agent orchestration
Common:
- Agents are named, typed, and tracked; multi-agent is supported via tools or workflow abstractions.

Notable variations:
- Codex: agent control via collab tool with spawn/interrupt/close and status tracking.
- Gemini: agent definitions with local/remote and subagent tool wrapper; prevents recursive agent calls by default.
- MetaGPT / CrewAI: explicit role-based multi-agent teams.
- LangGraph: graph orchestration for long-running stateful workflows.

### 3.4 Safety, approval, and sandboxing
Common:
- Human-in-loop approval for high-risk actions.
- Execution policies and sandboxing for local commands.

Notable variations:
- Codex: sandbox escalation with explicit approval and retry semantics.
- Gemini: policy engine supports allow/deny/ask_user, plus safety checkers for tool arguments.
- Open Interpreter: explicit approval before executing code.

### 3.5 Extensibility
Common:
- MCP support is widespread.
- Plugin or extension systems exist in Claude Code, Gemini CLI, Codex, and others.

Notable variations:
- Claude Code: plugin system for commands, agents, skills, hooks.
- Gemini: agent registry loads user/project/extension agents with trust gating.
- Codex: MCP client/server plus configuration-based tool definitions.

## 4) Implications for Open Wrap agent-runtime core agents

### 4.1 Current baseline (from Open Wrap code)
Open Wrap already contains a rich agent runtime:
- AgentManager supports spawning, parallel execution, status tracking, and tool registry scoping (packages/agent-runtime-execution/src/agents/manager.ts).
- Orchestrator coordinates planning, tool scheduling, approvals, security, telemetry, tool discovery, caching, and checkpointing (packages/agent-runtime-execution/src/orchestrator/orchestrator.ts).
- Runtime composition integrates tool registries, security policy, audit telemetry, and session state (packages/agent-runtime-execution/src/runtime.ts).

### 4.2 Observed gaps vs external patterns
1) Explicit protocol-level termination
- Gemini enforces a complete_task tool call, which prevents ambiguous termination. Our runtime uses completion tools, but could further standardize termination enforcement and error modes.

2) Sub-agent isolation
- Gemini and OpenCode isolate subagents with restricted tool registries and schema-validated inputs; Codex uses AgentControl. We have profiles and allowedTools, but would benefit from stricter isolation defaults and explicit recursion guards (beyond maxDepth).

3) Policy and safety checkers
- Gemini's policy engine supports structured allow/deny/ask_user rules and external safety checkers. Codex has clear approval -> sandbox -> escalation flow. We have permission checkers and tool governance, but can tighten policy evaluation by adding pluggable safety checkers and standardized decision explainability.

4) Tool-call concurrency contracts
- Codex separates parallel vs exclusive tool calls via locking. We have SmartToolScheduler but should explicitly encode per-tool concurrency constraints and default to safe serialization where required.

5) Context compression strategies
- OpenCode and Gemini have runtime compression paths. We have SmartMessageCompressor, but could add explicit auto-compact thresholds, plus observable compression events and fallback heuristics.

6) Role-driven SOPs and teams
- MetaGPT and CrewAI emphasize structured roles and SOPs; LangGraph provides deterministic workflow graphs. Our SOP and Teams modules exist but should be surfaced as first-class agent orchestration patterns in runtime APIs.

7) Tool result normalization
- Roo Code implements provider-specific normalization of tool result message formats. Our ai-core handles provider adaptation; ensure tool output formatting is consistent across providers, especially for reasoning models that are sensitive to tool result placement.

## 5) Optimization recommendations for core agents

### 5.1 Short-term (1-2 sprints)
- Add explicit termination protocol enforcement for core agents.
  - Require a completion tool invocation for automatic termination; otherwise surface a recoverable protocol error.
- Harden subagent spawning defaults.
  - Default to restricted tool registries and schema-validated inputs for subagents.
  - Enforce recursion guards plus total agent budget at the orchestrator level (not only manager).
- Introduce per-tool concurrency policy.
  - Annotate tools with concurrency semantics (parallel-safe vs exclusive) and enforce via scheduler locks.
- Add structured policy decision telemetry.
  - Emit events for allow/deny/ask_user with reason codes and tool context.

### 5.2 Mid-term (3-6 sprints)
- Pluggable safety checkers and policy rules.
  - Implement a policy engine similar to Gemini's with rule matching on tool name/arguments and optional external checkers.
- Auto-compact with explicit thresholds.
  - Add a configurable auto-compact policy (percent of context window) with summarization into a new session window.
- Subagent tool wrapper pattern.
  - Implement a SubagentTool that wraps agent definitions with schema validation, confirmation for remote agents, and structured activity events.
- Tool execution escalation pipeline.
  - Adopt Codex-style "approval -> sandbox -> escalate" semantics with explicit user prompts and audit trail.

### 5.3 Long-term (6+ sprints)
- Formalized workflow/graph runtime.
  - Provide LangGraph-style state graphs for deterministic, long-running workflows with durable checkpoints.
- Role/SOP orchestration templates.
  - Provide MetaGPT-like SOPs for common software workflows (design -> plan -> implement -> verify) with explicit artifacts and checklists.
- Unified multi-agent governance.
  - Add agent lineage and dependency-based budgets (token, tools, cost) across parent/child agents.

## 6) Proposed report deliverables for agent runtime optimization
- A unified policy engine spec (allow/deny/ask_user + safety checker hooks).
- A subagent protocol spec (inputs schema, tool registry isolation, completion criteria, activity events).
- A tool concurrency contract spec (parallel-safe vs exclusive + scheduler behavior).
- A context compression policy spec (thresholds, compression strategy, rehydration).
- An orchestration template library for SOP-driven roles and graph-based workflows.

## 7) Appendix: key Open Wrap references
- packages/agent-runtime-execution/src/orchestrator/orchestrator.ts
- packages/agent-runtime-execution/src/agents/manager.ts
- packages/agent-runtime-execution/src/runtime.ts
- packages/agent-runtime-core/src/index.ts

