# Track P: State Evolution & Memory

**Owner**: Runtime Developer  
**Status**: Active  
**Priority**: 🟡 High  
**Timeline**: Week 2-4  
**Dependencies**: Track L  
**Reference**: Roo-Code `checkpoints/index.ts`, LangGraph `checkpoint/` libs

---

## Objective

Production-ready checkpoint system with thread management, memory consolidation, and time-travel debugging capabilities.

## Progress Snapshot (2026-01-21)
- `CheckpointThreadManager` and thread metadata live in `packages/agent-runtime-persistence/src/checkpoint/threads.ts`.
- Shadow git checkpoint store exists in `packages/agent-runtime-persistence/src/checkpoint/shadowGit.ts`.
- Time-travel scaffolding exists in `packages/agent-runtime-persistence/src/timetravel`.

## Remaining Work
- Wire checkpoint threads and time-travel navigator into runtime APIs.
- Add UX flows for checkpoint diff/restore in CLI or UI surfaces.
- Consolidate memory lifecycle (cache invalidation + persistence wiring).

---

## Source Analysis

### From Roo-Code Checkpoints (393 lines)

```typescript
// Key patterns from Roo-Code checkpoint implementation

// 1. Git-based shadow repository (lines 196-203)
service.on("initialize", () => {
  log("[Task#getCheckpointService] service initialized");
  task.checkpointServiceInitializing = false;
});

try {
  await service.initShadowGit();
} catch (err) {
  log(`[Task#getCheckpointService] initShadowGit -> ${err.message}`);
  task.enableCheckpoints = false;
}

// 2. Checkpoint save with message (lines 212-228)
export async function checkpointSave(task: Task, force = false, suppressMessage = false) {
  const service = await getCheckpointService(task);
  if (!service) return;
  
  TelemetryService.instance.captureCheckpointCreated(task.taskId);
  
  return service
    .saveCheckpoint(`Task: ${task.taskId}, Time: ${Date.now()}`, { 
      allowEmpty: force, 
      suppressMessage 
    })
    .catch((err) => {
      console.error("[Task#checkpointSave] caught unexpected error", err);
      task.enableCheckpoints = false;
    });
}

// 3. Checkpoint restore with message rewind (lines 260-273)
if (mode === "restore") {
  const deletedMessages = task.clineMessages.slice(index + 1);
  const metrics = getApiMetrics(task.combineMessages(deletedMessages));
  
  await task.messageManager.rewindToTimestamp(ts, {
    includeTargetMessage: operation === "edit",
  });
  
  await task.say("api_req_deleted", JSON.stringify(metrics));
}

// 4. Checkpoint diff modes (lines 304-315)
export type CheckpointDiffOptions = {
  mode: "from-init" | "checkpoint" | "to-current" | "full";
};
```

### From LangGraph Checkpoint Libs

```python
# LangGraph checkpoint backend abstraction
class BaseCheckpointSaver(ABC):
    @abstractmethod
    async def aget(self, config: RunnableConfig) -> Optional[Checkpoint]:
        """Get checkpoint by config."""
    
    @abstractmethod
    async def aput(self, config: RunnableConfig, checkpoint: Checkpoint) -> None:
        """Save checkpoint."""
    
    @abstractmethod
    async def alist(self, config: RunnableConfig) -> AsyncIterator[Checkpoint]:
        """List checkpoints for thread."""
```

---

## Tasks

### P1: Enhanced Checkpointing (Week 2)

**Goal**: Thread-based checkpoint organization with configurable persistence.

**Implementation**:

```typescript
// packages/agent-runtime-persistence/src/checkpoint/threads.ts

export interface CheckpointThread {
  /** Thread identifier */
  threadId: string;
  
  /** Parent thread for branching */
  parentThreadId?: string;
  
  /** Thread metadata */
  metadata: {
    name?: string;
    createdAt: number;
    updatedAt: number;
    checkpointCount: number;
  };
}

export interface Checkpoint {
  /** Unique checkpoint ID */
  id: string;
  
  /** Thread this checkpoint belongs to */
  threadId: string;
  
  /** Parent checkpoint for history */
  parentId?: string;
  
  /** Checkpoint timestamp */
  timestamp: number;
  
  /** State data */
  state: CheckpointState;
  
  /** Metadata */
  metadata: {
    /** Human-readable label */
    label?: string;
    /** Trigger source */
    trigger: "auto" | "tool" | "turn" | "manual";
    /** Compression applied */
    compressed: boolean;
    /** Size in bytes */
    sizeBytes: number;
  };
}

export interface CheckpointState {
  /** Conversation messages */
  messages: unknown[];
  
  /** Agent memory state */
  memory?: unknown;
  
  /** Tool execution history */
  toolHistory?: unknown[];
  
  /** Custom state data */
  custom?: Record<string, unknown>;
}

export interface CheckpointSaver {
  /** Save a checkpoint */
  save(checkpoint: Checkpoint): Promise<void>;
  
  /** Get checkpoint by ID */
  get(checkpointId: string): Promise<Checkpoint | undefined>;
  
  /** Get latest checkpoint for thread */
  getLatest(threadId: string): Promise<Checkpoint | undefined>;
  
  /** List checkpoints for thread */
  list(threadId: string, options?: ListOptions): Promise<Checkpoint[]>;
  
  /** Delete checkpoint */
  delete(checkpointId: string): Promise<void>;
  
  /** Delete all checkpoints for thread */
  deleteThread(threadId: string): Promise<void>;
}

// Shadow Git implementation with Worktree Separation
export class ShadowCheckpointService {
  constructor(
    private taskId: string,
    private checkpointsDir: string, // Hidden global storage
    private workspaceDir: string    // User's actual workspace
  ) {}

  async initShadowGit(): Promise<void> {
    // 1. Sanitize environment to prevent pollution from user's env
    const git = createSanitizedGit(this.checkpointsDir);
    
    // 2. Initialize with core.worktree pointing to user workspace
    // This allows tracking files without polluting user's .git
    await git.init();
    await git.addConfig("core.worktree", this.workspaceDir);
    
    // 3. Handle nested git repositories (danger zone)
    await this.checkNestedGitRepos();
    
    // 4. Initial commit
    await git.commit("initial commit", { "--allow-empty": null });
  }

  async saveCheckpoint(message: string): Promise<void> {
    const git = this.git;
    await git.add("."); // Adds from workspaceDir via worktree config
    await git.commit(message);
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-persistence/src/checkpoint/shadowGit.ts`
- [ ] `packages/agent-runtime-persistence/src/checkpoint/sanitizedEnv.ts`
- [ ] `packages/agent-runtime-persistence/src/checkpoint/threads.ts`
- [ ] `packages/agent-runtime-persistence/src/checkpoint/sqliteSaver.ts`
- [ ] Configurable checkpoint frequency
- [ ] Compression for large states

---

### P2: Memory Consolidation (Week 3)

**Goal**: Unified short-term and long-term memory management.

**Implementation**:

```typescript
// packages/agent-runtime-memory/src/consolidation/memoryManager.ts

export interface MemoryEntry {
  id: string;
  type: "episodic" | "semantic" | "procedural";
  content: string;
  embedding?: number[];
  metadata: {
    createdAt: number;
    accessedAt: number;
    accessCount: number;
    importance: number;
    source: string;
  };
}

export interface MemoryConfig {
  /** Maximum working memory entries */
  workingMemoryLimit: number;
  
  /** Long-term memory vector store */
  vectorStore: VectorStore;
  
  /** Consolidation interval (ms) */
  consolidationInterval: number;
  
  /** Importance threshold for promotion */
  promotionThreshold: number;
}

export class MemoryManager {
  private workingMemory: Map<string, MemoryEntry> = new Map();
  private consolidationTimer?: NodeJS.Timeout;
  
  constructor(private config: MemoryConfig) {}
  
  /** Add to working memory */
  async remember(content: string, type: MemoryEntry["type"]): Promise<string> {
    const entry: MemoryEntry = {
      id: generateId(),
      type,
      content,
      metadata: {
        createdAt: Date.now(),
        accessedAt: Date.now(),
        accessCount: 1,
        importance: await this.calculateImportance(content),
        source: "agent",
      },
    };
    
    this.workingMemory.set(entry.id, entry);
    await this.enforceLimit();
    
    return entry.id;
  }
  
  /** Recall from working or long-term memory */
  async recall(query: string, limit = 5): Promise<MemoryEntry[]> {
    // Search working memory first
    const working = this.searchWorking(query);
    
    // Then search long-term with vector similarity
    const longTerm = await this.config.vectorStore.search(query, {
      limit: limit - working.length,
    });
    
    // Update access metadata
    for (const entry of [...working, ...longTerm]) {
      entry.metadata.accessedAt = Date.now();
      entry.metadata.accessCount++;
    }
    
    return [...working, ...longTerm];
  }
  
  /** Consolidate working memory to long-term */
  async consolidate(): Promise<void> {
    const toPromote: MemoryEntry[] = [];
    const toEvict: string[] = [];
    
    for (const [id, entry] of this.workingMemory) {
      if (entry.metadata.importance >= this.config.promotionThreshold) {
        // Generate embedding for long-term storage
        entry.embedding = await this.embed(entry.content);
        toPromote.push(entry);
      }
      
      // Evict stale entries
      const age = Date.now() - entry.metadata.accessedAt;
      if (age > this.config.consolidationInterval * 2) {
        toEvict.push(id);
      }
    }
    
    // Promote to long-term
    for (const entry of toPromote) {
      await this.config.vectorStore.upsert(entry);
    }
    
    // Evict from working
    for (const id of toEvict) {
      this.workingMemory.delete(id);
    }
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-memory/src/working/sessionMemory.ts`
- [ ] `packages/agent-runtime-memory/src/semantic/vectorStore.ts`
- [ ] `packages/agent-runtime-memory/src/consolidation/memoryManager.ts`
- [ ] Cross-session memory linking

---

### P3: Time-Travel Debugging (Week 4)

**Goal**: Enable replay and navigation through checkpoint history.

**Implementation**:

```typescript
// packages/agent-runtime-persistence/src/timetravel/navigator.ts

export interface NavigationResult {
  checkpoint: Checkpoint;
  diff?: StateDiff;
  availableActions: NavigationAction[];
}

export type NavigationAction = 
  | { type: "forward"; targetId: string }
  | { type: "backward"; targetId: string }
  | { type: "branch"; fromId: string }
  | { type: "replay"; fromId: string; toId: string };

export class TimeTravelNavigator {
  constructor(
    private checkpointSaver: CheckpointSaver,
    private stateApplier: StateApplier
  ) {}
  
  /** Navigate to a specific checkpoint */
  async navigateTo(checkpointId: string): Promise<NavigationResult> {
    const checkpoint = await this.checkpointSaver.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    
    // Apply the checkpoint state
    await this.stateApplier.apply(checkpoint.state);
    
    // Calculate available navigation actions
    const actions = await this.getAvailableActions(checkpoint);
    
    return { checkpoint, availableActions: actions };
  }
  
  /** Get diff between two checkpoints */
  async getDiff(fromId: string, toId: string): Promise<StateDiff> {
    const from = await this.checkpointSaver.get(fromId);
    const to = await this.checkpointSaver.get(toId);
    
    if (!from || !to) {
      throw new Error("Checkpoint not found");
    }
    
    return this.calculateDiff(from.state, to.state);
  }
  
  /** Replay from one checkpoint to another */
  async replay(
    fromId: string, 
    toId: string,
    options?: { speed?: number; onStep?: (step: ReplayStep) => void }
  ): Promise<void> {
    const path = await this.findPath(fromId, toId);
    
    for (const checkpoint of path) {
      await this.stateApplier.apply(checkpoint.state);
      options?.onStep?.({
        checkpointId: checkpoint.id,
        timestamp: checkpoint.timestamp,
        state: checkpoint.state,
      });
      
      if (options?.speed) {
        await sleep(options.speed);
      }
    }
  }
  
  /** Create a branch from current checkpoint */
  async branch(fromId: string, branchName?: string): Promise<CheckpointThread> {
    const parent = await this.checkpointSaver.get(fromId);
    if (!parent) {
      throw new Error(`Checkpoint ${fromId} not found`);
    }
    
    const newThread: CheckpointThread = {
      threadId: generateId(),
      parentThreadId: parent.threadId,
      metadata: {
        name: branchName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        checkpointCount: 0,
      },
    };
    
    return newThread;
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-persistence/src/timetravel/navigator.ts`
- [ ] `packages/agent-runtime-telemetry/src/replay/visualizer.ts`
- [ ] Checkpoint navigation (forward/backward)
- [ ] Branch exploration from any checkpoint
- [ ] Deterministic replay guarantees

---

## Acceptance Criteria

- [ ] Checkpoints organized by thread with parent linking
- [ ] SQLite and in-memory backends working
- [ ] Compression reduces storage by >50%
- [ ] Memory consolidation with importance scoring
- [ ] Vector search for long-term memory recall
- [ ] Time-travel navigation with diff visualization
- [ ] Branching creates independent history lines

---

## Testing Requirements

```bash
# Unit tests
pnpm --filter @ku0/agent-runtime-persistence test -- --grep "checkpoint"

# Memory tests
pnpm --filter @ku0/agent-runtime-memory test -- --grep "consolidation"

# Integration tests
pnpm test:integration -- --grep "timetravel"
```
