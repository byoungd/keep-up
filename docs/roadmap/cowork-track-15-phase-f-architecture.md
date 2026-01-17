# Track 15: Phase F - Autonomous Swarm Architecture

> **Status**: 📅 Planned (2026 Q1)
> **Package**: `@ku0/cortex` (New), `@ku0/tool-lsp`, `@ku0/agent-runtime`
> **Links**: [Gap Analysis](./cowork-architecture-gap-analysis-2026.md)
> **Supersedes**: Track 14 (Multi-Agent Orchestration)
> **Parallelism**: Can run alongside Tracks 11, 12, 13


## Mission
Transition Cowork from a "Reactive Chatbot" to an "Autonomous Swarm" that matches 2026 market leaders (OpenCode Swarms, Gemini Conductor). Enable parallel background execution, deep semantic code understanding, and proactive "Ghost Mode" assistance.

## Primary Goal
Unlock "fire and forget" productivity: User assigns a high-level goal ("Refactor Auth"), and the agent spawns extensive background workers to plan, lint, test, and document in parallel, without blocking the UI.

## Background
Gap analysis (Jan 2026) revealed Cowork lags in concurrency and semantic tooling.
- **Current**: Single-threaded `grep` loops.
- **Target**: Multi-agent "Hive" runtime with LSP-native accuracy.

## Scope

### 1. "Hive" Swarm Runtime
- **Multi-Agent Orchestrator**: Refactor `CoworkTaskRuntime` to manage a "Conductor" (UI) and multiple "Workers".
- **Background Jobs**: Ability to run tasks invisible to the main chat thread (e.g., "Scanning 50 files...").
- **Parallelism**: Run "Plan", "Code", "Test" agents simultaneously.

### 2. Deep Semantic Tooling (`@ku0/tool-lsp`)
- **LSP Integration**: Wrap `typescript-language-server` into a tool.
- **Capabilities**: `findReferences`, `renameSymbol`, `getDiagnostics`, `structure` (Outline).
- **Benefit**: 100% accurate refactoring, zero hallucinated references.

### 3. Active Context Engine (Legacy `task.md` -> `Conductor`)
- **Stateful Workflow**: Treat `task.md` as an executable driver.
- **Auto-Resume**: Detect incomplete tasks on boot and offer to resume.
- **Memory Persistence**: Save "Thought Process" snapshots to avoid context loss on reload.

### 4. Proactive "Ghost" Agent
- **File Watcher**: Listen for file saves globally.
- **Proactive Checks**: Run quick lint/type checks on change.
- **UI Signals**: Toast notifications ("I found a fix for the error in `utils.ts`").

## Decisions and Contracts
- **Runtime**: Use `Worker` threads for isolation, communicating via `EventBus`.
- **Tooling**: `@ku0/tool-lsp` will require a local `node` environment (not web-compatible initially).
- **UI**: Add a "Job Queue" indicator in the top navbar.
- **Context**: `task.md` remains the source of truth for human-readable state; hidden JSON for machine state.

## Execution Steps

### F1: Deep Semantic Tooling (The Foundation)
1. **Create `@ku0/tool-lsp` package**.
2. Implement **LSP Client** using `vscode-jsonrpc`.
3. Wrap `typescript-language-server` setup.
4. Expose tools: `lsp_find_references`, `lsp_rename`, `lsp_document_symbol`.
5. Integrate into standard runtime tool registry.

### F2: Swarm Runtime (The Engine)
1. **Refactor `AgentRuntime` to `SwarmRuntime`**.
2. Implement `spawnWorker(task)` primitive.
3. specific **Bus** for worker-to-conductor messaging.
4. **UI**: Job Queue component in `CoworkAIPanel`.

### F3: Active Context (The Memory)
1. **Parser**: Upgrade `task.md` parser to support "State" metadata.
2. **Boot Hook**: Add `onSessionStart` check for `[/]` tasks.
3. **Prompt Injection**: "You are resuming task X at step Y...".

### F4: Ghost Agent (The Autonomy)
1. **Watcher Service**: Integrate `chokidar` into server runtime.
2. **Trigger Engine**: Rules for when to wake up (e.g., "file saved + error count > 0").
3. **Toast UI**: Non-intrusive suggestions in the IDE.

## Deliverables
- [ ] `@ku0/tool-lsp` package (LSP client wrapper)
- [ ] `SwarmOrchestrator` in `@ku0/agent-runtime`
- [ ] "Job Queue" UI Component
- [ ] `ActiveContextService` (e.g., `task.md` auto-resume)
- [ ] `FileWatcherService` & Proactive Toast UI

## Acceptance Criteria
- [ ] **LSP Tool**: Can rename `User` to `Customer` across 10 files without regex errors.
- [ ] **Parallelism**: Can run "Run Tests" in background while user chats with Conductor.
- [ ] **Resume**: Restarting a session with in-progress `task.md` immediately restores context.
- [ ] **Ghost Mode**: Saving a file with a syntax error triggers an invisible agent check; solution appears in toast within 5s.

## Constraints
- **Performance**: Background workers must not starve the main UI thread.
- **Token Usage**: "Ghost Mode" must have a strict daily budget (user configurable) to avoid draining credits.
- **Security**: LSP tools strictly sandboxed to project root.

## Dependencies
- `@ku0/agent-runtime` (Requires major refactor).
- `@ku0/agent-runtime` (Requires major refactor).
- `typescript-language-server` (External dep).
- **Phase E Relationship**:
  - **Track 11 (Semantic Index)**: Complementary. Can be developed in parallel.
  - **Track 12 (Workflows)**: Complementary. Can be developed in parallel.
  - **Track 13 (QA)**: Recommended to wait for F2 (Swarm Runtime) to run QA in background, but can start independently.
  - **Track 14 (Orchestration)**: **OBSOLETE**. Phase F replaces this track entirely.


## Owner Checklist
- Ensure `CODING_STANDARDS.md` compliance.
- Update `walkthrough.md` with "Swarm" demos.
- Add telemetry for "Background Job" success rates.
