# Cowork Architecture Gap Analysis & Phase F Spec

> **Date**: 2026-01-17
> **Target**: 2026 Q1/Q2 Roadmap
> **Status**: DRAFT

## 1. Executive Summary

As of Jan 2026, the AI coding agent market has shifted from "Chat-with-Context" to "Autonomous Co-working". While `cowork` has established a solid foundation with its Task Runtime and Project Context (Track 8), it effectively competes with late-2025 standards.

To match and exceed 2026 market leaders like **OpenCode (Cisphus)**, **GeminiCLI (Conductor)**, and **Claude Cowork/Code**, `cowork` must evolve from a reactive assistant to a proactive, sworn-based system with deep semantic understanding.

## 2. Competitive Landscape (2026)

| Feature | **Cowork (Current)** | **OpenCode / Cisphus** | **Claude Cowork** | **GeminiCLI** |
| :--- | :--- | :--- | :--- | :--- |
| **Orchestration** | Single threaded loop | Multi-Agent Swarm (Parallel) | Sub-agent Delegation | Single Agent + Routing |
| **Context** | Session + `AGENTS.md` | Session + Multi-Model | "Virtual Coworker" (OS-level) | 1M+ Window + `Conductor` |
| **Tooling** | `grep`, `fs`, `bash` | **LSP & AST Native** | File System + OS | Google Ecosystem |
| **Persistence** | `task.md` (Passive) | Git-integrated | Local State | **Persistent Workflow MD** |
| **Autonomy** | Reactive (Wait for prompt) | Semi-Proactive | **Proactive (Background Work)** | Reactive |

## 3. Critical Architecture Gaps

### 3.1. The "Single-Threaded" Bottleneck
**Problem**: `CoworkTaskRuntime` is primarily a single execution loop. If the user asks for a complex refactor, they are blocked until completion.
**Market Standard**: **OpenCode** and **Claude Cowork** use background "swarms". One agent plans, another executes tests, a third updates docs—all in parallel.
**Gap**: Lack of `SwarmOrchestrator` and "Background Job" primitives in the runtime.

### 3.2. "Grep-based" vs. "Semantic" Understanding
**Problem**: We rely on text search tools (`grep`, `find`). This is error-prone for large-scale refactors (e.g., renaming a symbol across files).
**Market Standard**: **OpenCode** integrates directly with **LSP (Language Server Protocol)** and AST parsers. It "knows" where `UserService` is used, not just where the string appears.
**Gap**: Missing `@ku0/tool-lsp` or an AST-aware toolset.

### 3.3. Ephemeral vs. Persistent Workflow State
**Problem**: `task.md` is useful but often passive. **GeminiCLI's Conductor** treats markdown files as *executable state machines* that survive session restarts and guide long-running migrations.
**Gap**: `task.md` needs to become a "Driver" that the agent *reads on boot* to resume state, not just a log output.

### 3.4. Reactive vs. Proactive "Ghost Mode"
**Problem**: Cowork waits for input. **Claude Cowork** proactively monitors the file system. If you break a build, it might pop up saying "I see a type error in `utils.ts`, want me to fix it?"
**Gap**: No "File Watcher -> Agent Trigger" loop.

## 4. Proposed Spec: Phase F (Future Architecture)

### 4.1. Architecture: The "Hive" Runtime
Refactor `CoworkTaskRuntime` to support a **Swarm Architecture**.

> [!NOTE]
> **Terminology**: "Swarm" here refers to the architectural pattern (Multi-Agent Orchestration), NOT the OpenAI `swarm` Python library. This runtime is **Provider Agnostic** (see Track 7).

```typescript
// Proposed Interface
interface CoworkSwarmRuntime {
  // Main conductor (talks to user)
  conductor: AgentInstance;
  
  // Background workers (invisible to user until reduced)
  workers: Map<string, AgentInstance>;
  
  // Spawn a worker for a sub-task
  spawnWorker(task: TaskDefinition): Promise<WorkerId>;
}
```

- **Feature**: `background-mode` in `CoworkAIPanel` to allow "fire and forget" tasks ("Fix all lint errors in `src/`").
- **UI**: A "Job Queue" indicator in the panel header.

### 4.2. Tooling: Deep Semantic Tools
Introduce a new tool server package `@ku0/tool-lsp`.

- **Capabilities**:
  - `lsp.findReferences(symbol)`: 100% accurate usage finding.
  - `lsp.rename(symbol, newName)`: Safe refactoring.
  - `lsp.getDiagnostics()`: Instant error checking without running a full build.

### 4.3. Persistence: "Active Context" Engine
Upgrade `AGENTS.md` and `task.md` integration.

- **Conductor Mode**: When opening a workspace, the agent reads `task.md`. If it detects an in-progress task `[/]`, it proactively asks: *"We were working on 'Refactor Auth', want to resume at step 3?"*
- **State**: Persist agent memory snapshot to `.cowork/memory.json` (or hidden artifact) to preserve "thought process" across reloads.

### 4.4. Proactive "Ghost" Agent
Add a `FileWatcherService` to the runtime.

- **Trigger**: Debounced file save events -> run specialized "Check" agents.
- **Action**: If high-confidence fix found -> Propose in UI toast.
- **Config**: User enables/disables "Ghost Mode" in `CoworkSettings`.

## 5. Implementation Roadmap (Draft)

### Phase F1: Deep Semantic Tooling
- [ ] Implement `@ku0/tool-lsp`
- [ ] Integrate `typescript-language-server`
- [ ] Replace `grep` usage with `lsp` usage in complex prompts

### Phase F2: Swarm Runtime
- [ ] Refactor `CoworkTaskRuntime` to support multiple `AgentRuntime` instances
- [ ] Add `spawnWorker` tool
- [ ] Build "Job Queue" UI in `CoworkAIPanel`

### Phase F3: Proactive Workflow
- [ ] Implement `Conductor` logic (auto-resume from `task.md`)
- [ ] Add `FileWatcherService` and "Ghost Agent" triggers
