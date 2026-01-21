# Deep Source Analysis: Expanded Agent Frameworks (Phase 2)

> **Date**: 2026-01-21
> **Scope**: AutoGPT (Classic), Open Interpreter, Cline, Roo-Code
> **Focus**: Local Execution, Persistence Patterns, and IDE Integration

## 1. Executive Summary

Following the initial analysis of server-side agent frameworks, this phase investigates **client-side and local-first** agent architectures. The analysis reveals a shift towards:
1.  **Direct Local Execution**: Moving away from sandboxed containers to direct host OS interaction (Open Interpreter).
2.  **IDE-Native Control Planes**: Embedding the agent loop directly into the IDE extension host (Cline).
3.  **Shadow Git Persistence**: Using invisible git repositories to track agent modifications and enable "undo" (Roo-Code).

| Framework | Core Mechanism | State Persistence | Key Innovation |
|-----------|----------------|-------------------|----------------|
| **AutoGPT** | `OneShotAgentPromptStrategy` | `EpisodicActionHistory` (JSON) | Component-based "Forge" architecture |
| **Open Interpreter** | `OpenInterpreter.chat()` | `conversations/*.json` | Direct "Computer" API (Screen/Keyboard) |
| **Cline** | `Controller.initTask()` | `StateManager` (VSCode Global State) | MCP Hub + Browser/IDE Tooling |
| **Roo-Code** | `RepoPerTaskCheckpointService` | **Shadow Git Repository** | Robust "Time Travel" & Checkpoints |

---

## 2. Framework Deep Dive

### 2.1 AutoGPT (Classic/Forge)
**Source**: `autogpt/agents/agent.py`

AutoGPT's classic architecture has evolved into "Forge", a component-driven system.
- **Loop**: The `Agent` class executes a `propose_action` -> `execute` loop. It relies on a `PromptStrategy` (specifically `OneShotAgentPromptStrategy`) to construct context.
- **Components**: Heavy use of dependency injection via components (`SystemComponent`, `GitOperationsComponent`, `CodeExecutorComponent`).
- **Sandboxing**: Explicitly uses Docker for code execution (`docker_container_name=f"{settings.agent_id}_sandbox"`), enforcing a strong security boundary even for local agents.
- **Observation**: It is "heavy" — designed for autonomous operation with safety rails, rather than collaborative coding.

### 2.2 Open Interpreter
**Source**: `interpreter/core/core.py`

Open Interpreter takes the opposite approach: **Zero-Sovereignty, High-Utility**.
- **Loop**: `OpenInterpreter.chat()` flows through a generator (`_respond_and_store`). It treats the LLM as a READ-EVAL-PRINT loop driver.
- **Active Line Markers**: The streaming response is parsed for `active_line` events, allowing the UI to highlight code *as it runs*.
- **Computer API**: Exposes raw `computer` object, allowing the agent to control mouse/keyboard/screen, effectively acting as a human operator substitute.
- **Persistence**: Simple JSON dumps of message history.
- **Key Insight**: The `respond.py` stream handler allows for "Interrupted by Human" exceptions, enabling the user to barge in during execution—a critical feature for collaborative agents.

### 2.3 Cline
**Source**: `src/core/controller/index.ts`

Cline (and its forks) represents the **IDE-Native Agent**.
- **Controller as Kernel**: The `Controller` class manages the lifecycle of a `Task`. It is tightly coupled to VS Code's `ExtensionContext`.
- **MCP Hub**: Cline embeds a standard-compliant `McpHub` (`src/services/mcp/McpHub.ts`) to manage Model Context Protocol servers, making it extensible.
- **State Management**: Uses `StateManager` to sync persistent state to VSCode's `globalState`.
- **Task Lock**: Implements `tryAcquireTaskLockWithRetry` to prevent concurrent agent runs in the same workspace, solving a common race condition in local agents.

### 2.4 Roo-Code
**Source**: `src/core/checkpoints/index.ts`

Roo-Code (a Cline fork) introduces a SOTA pattern for safety: **Shadow Git Persistence**.
- **Mechanism**: Instead of relying on the user's git repo, it initializes a separate, hidden git repository (`options.shadowDir`) to track changes made by the agent.
- **Checkpoint Service**: `RepoPerTaskCheckpointService` wraps file operations. Every agent tool execution that modifies files triggers a commit in the shadow repo.
- **Time Travel**: `checkpointRestore` allows the user to perform a hard reset to a previous state by leveraging `git checkout/reset` on the shadow repo, then syncing the workspace.
- **Why it matters**: This solves the "destructive agent" problem without requiring complex file-system virtualization or distinct VMs.

---

## 3. Architectural Implications for Keep-Up

### 3.1 Adoption of Shadow Git
The **Shadow Git** pattern from Roo-Code is superior to our current plan of "snapshotting" or "virtual file systems" for local development.
- **Recommendation**: Implement `ShadowGitPersistence` in `agent-runtime-fs`.
- **Benefit**: Zero-overhead versioning, standard diff tooling, and instant rollback.

### 3.2 The "Controller" Pattern
Cline's `Controller` is a better model for our `AgentRuntime` than the current loose collection of services.
- **Recommendation**: Centralize `Task` lifecycle management into a `RuntimeController` that owns `McpHub`, `Auth`, and `Persistence`.

### 3.3 Active Execution Markers
Open Interpreter's `active_line` feedback loop provides superior UX.
- **Recommendation**: Ensure our `ToolRunner` emits precise "execution pointer" events, not just "started/finished" events.
