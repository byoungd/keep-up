# Track 16: Phase G - Agentic Capabilities Expansion

> **Status**: 📝 Planned (2026-01-17)
> **Prior Track**: Track 15 (Phase F Architecture)
> **Goal**: Close the capability gap with top-tier agentic products (Claude Code, Devin) by implementing Browser Control, Git Worktree Isolation, and E2E Pipelines.

## Mission
Transform `@ku0/agent-runtime` from a passive tool executor into a proactive, autonomous agent capabilities suite.
Enable the agent to **see** (Browser), **branch** (Worktree), and **manage** long-running tasks (Pipelines).

## Standards & Compliance
- **Runtime**: Node.js 20+ (ESM only)
- **Validation**: `zod` v4.x (Strict schemas)
- **Linting**: `biome` (No ESLint/Prettier)
- **Testing**: `vitest` (Unit + E2E)
- **Logging**: `pino` (Structured)
- **Async**: Native Promises / Async Iterators

## Core Capabilities (Parallel Tracks)

### 🔴 G-1: Browser Agent (P0)
**Goal**: Enable the agent to control a browser for frontend validation, debugging, and web-based research.

**Architecture**:
- **Manager**: `agent-runtime/src/browser/browserManager.ts` (Singleton, Playwright context pooling)
- **Tool Server**: `agent-runtime/src/tools/browser/browserToolServer.ts` (MCP)

**Key Features:**
- **Headless Control**: Playwright `chromium` instance.
- **Visual Grounding**: `accessibility.snapshot()` for semantic DOM tree.
- **Console Capture**: `page.on('console')` event buffering.
- **Network Interception**: Block ads/trackers for speed.

**Tools & Zod Schemas**:
- `browser:navigate`: `{ url: z.string().url() }`
- `browser:click`: `{ selector: z.string(), timeout: z.number().optional() }`
- `browser:type`: `{ selector: z.string(), text: z.string() }`
- `browser:screenshot`: `{ fullPage: z.boolean().default(false) }`
- `browser:evaluate`: `{ script: z.string() }` (Requires `SecurityPolicy.code: "full"`)

### 🔴 G-2: Git Worktree Manager (P0)
**Goal**: Enable safe, parallel execution of agent tasks in isolated git worktrees.

**Architecture**:
- **Manager**: `agent-runtime/src/worktree/worktreeManager.ts`
- **Abstraction**: `ShadowWorkspace` class implementing `IWorkspace` interface.

**Key Features:**
- **Lifecycle**: `git worktree add` -> Execute -> `git worktree remove`.
- **Naming**: `.cowork/shadow/<task-id>-<short-hash>`.
- **Cleanup**: `process.on('exit')` hooks to remove orphaned worktrees.
- **Concurrency**: Limit max worktrees (e.g., 2) to save disk/CPU.
- **Merge Logic**: `git merge --squash` back to main vs `git push` shadow branch.

**Tools**:
- Extends `git:*` tools to support `cwd` override implicitly via `ToolContext`.
- No new public tools needed; infrastructure change.

### 🟡 G-3: E2E Task Pipelines (P1)
**Goal**: Support long-running, multi-step task delegation.

**Architecture**:
- **Manager**: `agent-runtime/src/pipelines/pipelineManager.ts`
- **Runner**: `agent-runtime/src/pipelines/taskRunner.ts`
- **Persistence**: `ActiveContextService` (FileSystem/SQLite)

**Key Features:**
- **Pipeline Schema**:
  ```typescript
  const PipelineSchema = z.object({
    id: z.string(),
    stages: z.array(z.object({
      name: z.string(),
      agent: z.enum(['planner', 'coder', 'reviewer']),
      task: z.string(),
      dependsOn: z.array(z.string()).optional()
    }))
  });
  ```
- **Async Execution**: `setImmediate` or Worker threads for non-blocking.
- **Resume Capability**: Store state to disk after every stage completion.
- **Triggers**: Webhook receiver for `POST /api/pipelines/trigger`.

---

## Implementation Plan (Detailed)

### G-1: Browser Agent
1. **Dependencies**: `pnpm add playwright` (ensure version matches root if exists).
2. **BrowserManager**:
   - Implement `launch()` with `headless: true`.
   - Implement `getContext(sessionId)` to isolate user sessions.
   - Implement `close()` to cleanup.
3. **Tools**:
   - Wrap Playwright APIs.
   - Convert `page.content()` to simplified Markdown (using `turndown` or similar if useful, else raw text).
4. **Safety**:
   - `SecurityPolicy.network` check before navigation.
   - Enforce timeouts (30s default).

### G-2: Worktree Manager
1. **WorktreeManager**:
   - `create(baseBranch: string): Promise<string>` returns path.
   - `cleanup(path: string): Promise<void>`.
2. **ShadowContext**:
   - Create `createShadowContext(originalContext)` helper.
   - Overrides `cwd` in `ToolContext`.
3. **Integration**:
   - In `AgentOrchestrator`, if `parallel: true`, request worktree from manager.

### G-3: Pipelines
1. **Schema**: Define `PipelineDef` and `PipelineRun` in `src/types`.
2. **Persistence**: Extend `ActiveContextService` to save `.cowork/pipelines/*.json`.
3. **Runner**: Simple loop executing generic `AgentOrchestrator.run()` for each stage.

---

## Acceptance Criteria
- [ ] **G-1**: Agent can pass "Search & Summarize" test: Navigate to Google, search "test", summarize results.
- [ ] **G-2**: "Shadow Edit" test: Agent edits file in shadow workspace, main workspace file is unchanged until merge.
- [ ] **G-3**: "Multi-stage" test: Run a 2-stage pipeline (Plan -> Code) successfully.

## Dependencies & Risks
- **Playwright**: ~100MB binary. Cache in CI.
- **Worktrees**: Requires clean git state? Manager should handle `stash` if needed, or error if dirty.
- **Disk IO**: Worktrees are fast on macOS (APFS copy-on-write) but watch out for IO limits.
