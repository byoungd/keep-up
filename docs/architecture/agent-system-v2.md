# Agent System v2 Architecture

> **NOTE:** The Core Agent Runtime architecture is now strictly defined in `docs/specs/agent-runtime-spec-2026.md`. This document outlines the broader system vision (Thinking, Memory, UI), but runtime implementation details (loops, recovery, state) should follow the Spec.

# Agent System v2 Architecture

> Upgrade plan inspired by Claude Code, Codex, and top-tier AI coding assistants.

## Executive Summary

This document outlines the architectural upgrades to transform the existing agent runtime into a world-class AI coding assistant platform. The upgrades focus on three pillars:

1. **Intelligence** - Enhanced reasoning, memory, and code understanding
2. **Experience** - Better streaming, interactive flows, and progress tracking
3. **Reliability** - Robust error recovery, sandboxing, and cancellation

---

## P0: Critical Upgrades

### 1. Extended Thinking & Reasoning Chain

**Problem**: Current agents lack explicit reasoning structure, making complex tasks harder to debug and verify.

**Solution**: Implement a dedicated reasoning layer with:
- Explicit thinking budget (token allocation for reasoning)
- Structured reasoning chain with steps
- Reasoning visibility for transparency
- Self-correction through reflection

**Architecture**:

```typescript
interface ThinkingConfig {
  enabled: boolean;
  budget: 'minimal' | 'standard' | 'extended' | 'unlimited';
  budgetTokens?: number;  // Override for specific token count
  visibility: 'hidden' | 'streaming' | 'summary';
}

interface ReasoningStep {
  id: string;
  type: 'observation' | 'hypothesis' | 'plan' | 'reflection' | 'decision';
  content: string;
  confidence: number;
  timestamp: number;
}

interface ReasoningChain {
  steps: ReasoningStep[];
  totalTokens: number;
  summary: string;
}
```

**Files to create**:
- `packages/agent-runtime/src/reasoning/thinkingEngine.ts`
- `packages/agent-runtime/src/reasoning/reasoningChain.ts`
- `packages/agent-runtime/src/reasoning/types.ts`
- `packages/agent-runtime/src/reasoning/index.ts`

---

### 2. Memory System (Cross-Session Knowledge)

**Problem**: Agents lose context between sessions, requiring repeated explanations.

**Solution**: Implement a persistent memory layer with:
- Short-term memory (conversation context)
- Long-term memory (persistent facts, preferences)
- Semantic search (vector-based retrieval)
- Memory consolidation (automatic summarization)

**Architecture**:

```typescript
interface MemoryConfig {
  shortTermLimit: number;      // Max tokens in conversation
  longTermEnabled: boolean;
  vectorSearchEnabled: boolean;
  consolidationInterval: number; // Auto-consolidate every N turns
}

interface Memory {
  id: string;
  type: 'fact' | 'preference' | 'codebase' | 'conversation' | 'decision';
  content: string;
  embedding?: number[];        // For vector search
  importance: number;          // 0-1, for consolidation
  createdAt: number;
  lastAccessedAt: number;
  source: string;              // Agent/tool that created it
  tags: string[];
}

interface IMemoryStore {
  add(memory: Omit<Memory, 'id'>): Promise<string>;
  get(id: string): Promise<Memory | null>;
  search(query: string, limit?: number): Promise<Memory[]>;
  semanticSearch(embedding: number[], limit?: number): Promise<Memory[]>;
  forget(id: string): Promise<void>;
  consolidate(): Promise<void>;
}
```

**Files to create**:
- `packages/agent-runtime/src/memory/memoryStore.ts`
- `packages/agent-runtime/src/memory/vectorIndex.ts`
- `packages/agent-runtime/src/memory/consolidation.ts`
- `packages/agent-runtime/src/memory/types.ts`
- `packages/agent-runtime/src/memory/index.ts`

---

### 3. Enhanced Streaming

**Problem**: Current streaming is event-based but lacks granularity and partial result support.

**Solution**: Implement token-level streaming with:
- Token-by-token output
- Partial tool results (progress during long operations)
- Backpressure handling
- Stream recovery after disconnection

**Architecture**:

```typescript
interface StreamConfig {
  tokenLevel: boolean;         // Enable token-by-token streaming
  partialResults: boolean;     // Enable partial tool results
  backpressure: {
    highWaterMark: number;     // Pause when buffer exceeds
    lowWaterMark: number;      // Resume when buffer drops below
  };
  recovery: {
    enabled: boolean;
    checkpointInterval: number; // Save state every N tokens
  };
}

type StreamEvent =
  | { type: 'token'; token: string; index: number }
  | { type: 'thinking'; content: string; step: number }
  | { type: 'tool:start'; toolName: string; callId: string }
  | { type: 'tool:progress'; callId: string; progress: number; partial?: unknown }
  | { type: 'tool:end'; callId: string; result: MCPToolResult }
  | { type: 'error'; error: Error; recoverable: boolean }
  | { type: 'done'; summary: string };

interface IStreamWriter {
  write(event: StreamEvent): Promise<void>;
  pause(): void;
  resume(): void;
  checkpoint(): Promise<string>;  // Returns checkpoint ID
  recover(checkpointId: string): Promise<void>;
}
```

**Files to create**:
- `packages/agent-runtime/src/streaming/tokenStreamer.ts`
- `packages/agent-runtime/src/streaming/backpressureController.ts`
- `packages/agent-runtime/src/streaming/streamRecovery.ts`
- `packages/agent-runtime/src/streaming/types.ts`

---

## P1: Important Upgrades

### 4. Multi-Modal Support

**Problem**: Cannot understand screenshots, diagrams, or UI mockups.

**Solution**: Integrate vision capabilities:
- Image input in conversations
- Screenshot analysis for UI debugging
- Diagram understanding for architecture
- Auto-screenshot on error (configurable)

**Architecture**:

```typescript
interface MultiModalConfig {
  visionEnabled: boolean;
  autoScreenshot: {
    enabled: boolean;
    onError: boolean;
    onUIChange: boolean;
  };
  supportedFormats: ('png' | 'jpeg' | 'webp' | 'gif')[];
  maxImageSize: number;  // bytes
}

interface ImageInput {
  type: 'image';
  data: string;          // Base64 or URL
  mediaType: string;
  description?: string;  // Alt text for context
}

// Extended message type
type MultiModalMessage = AgentMessage & {
  images?: ImageInput[];
};
```

**Files to create**:
- `packages/agent-runtime/src/multimodal/imageProcessor.ts`
- `packages/agent-runtime/src/multimodal/screenshotCapture.ts`
- `packages/agent-runtime/src/multimodal/types.ts`
- `packages/agent-runtime/src/multimodal/index.ts`

---

### 5. Background Tasks

**Problem**: Long-running operations block the conversation.

**Solution**: Implement async task execution:
- Background task queue
- Progress reporting
- Graceful cancellation
- Result notification

**Architecture**:

```typescript
interface BackgroundTask {
  id: string;
  type: 'agent' | 'tool' | 'pipeline';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;        // 0-100
  progressMessage?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

interface ITaskQueue {
  enqueue(task: TaskDefinition): Promise<string>;
  cancel(taskId: string): Promise<boolean>;
  getStatus(taskId: string): BackgroundTask | undefined;
  listTasks(filter?: TaskFilter): BackgroundTask[];
  onProgress(taskId: string, handler: ProgressHandler): () => void;
  onComplete(taskId: string, handler: CompleteHandler): () => void;
}

interface TaskDefinition {
  type: 'agent' | 'tool' | 'pipeline';
  payload: unknown;
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
  retries?: number;
}
```

**Files to create**:
- `packages/agent-runtime/src/tasks/taskQueue.ts`
- `packages/agent-runtime/src/tasks/taskExecutor.ts`
- `packages/agent-runtime/src/tasks/cancellation.ts`
- `packages/agent-runtime/src/tasks/types.ts`
- `packages/agent-runtime/src/tasks/index.ts`

---

### 6. Git Intelligence

**Problem**: Basic git operations without intelligent diff handling.

**Solution**: Native git integration with:
- Semantic diff analysis
- Change preview before commit
- Branch awareness
- Conflict detection and resolution hints

**Architecture**:

```typescript
interface GitToolConfig {
  enabled: boolean;
  autoStage: boolean;
  previewChanges: boolean;
  conflictResolution: 'auto' | 'prompt' | 'manual';
}

interface GitDiff {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: DiffHunk[];
  binary: boolean;
  oldPath?: string;  // For renames
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

// Git Tool Server with intelligent operations
interface IGitToolServer extends MCPToolServer {
  // Enhanced operations
  semanticDiff(options: { staged?: boolean; file?: string }): Promise<GitDiff[]>;
  suggestCommitMessage(diffs: GitDiff[]): Promise<string>;
  detectConflicts(): Promise<ConflictInfo[]>;
  resolveConflict(file: string, strategy: 'ours' | 'theirs' | 'merge'): Promise<void>;
}
```

**Files to create**:
- `packages/agent-runtime/src/tools/git/gitServer.ts`
- `packages/agent-runtime/src/tools/git/diffAnalyzer.ts`
- `packages/agent-runtime/src/tools/git/commitHelper.ts`
- `packages/agent-runtime/src/tools/git/conflictResolver.ts`
- `packages/agent-runtime/src/tools/git/types.ts`
- `packages/agent-runtime/src/tools/git/index.ts`

---

## P2: Enhancement Upgrades

### 7. Interactive Terminal

**Problem**: Current bash tool executes commands but lacks interactive session support.

**Solution**: Full terminal integration with:
- PTY (pseudo-terminal) support
- Session persistence
- Input/output streaming
- Environment management

**Architecture**:

```typescript
interface TerminalSession {
  id: string;
  pid: number;
  cwd: string;
  env: Record<string, string>;
  status: 'active' | 'idle' | 'closed';
  createdAt: number;
  lastActivityAt: number;
}

interface ITerminalManager {
  create(options?: TerminalOptions): Promise<TerminalSession>;
  execute(sessionId: string, command: string): AsyncIterable<TerminalOutput>;
  sendInput(sessionId: string, input: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  close(sessionId: string): Promise<void>;
  list(): TerminalSession[];
}

type TerminalOutput =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'exit'; code: number };
```

**Files to create**:
- `packages/agent-runtime/src/terminal/terminalManager.ts`
- `packages/agent-runtime/src/terminal/ptySession.ts`
- `packages/agent-runtime/src/terminal/types.ts`
- `packages/agent-runtime/src/terminal/index.ts`

---

### 8. Code Intelligence (LSP Integration)

**Problem**: Agents lack deep code understanding (types, definitions, references).

**Solution**: LSP client integration for:
- Go to definition
- Find references
- Symbol search
- Type information
- Diagnostics

**Architecture**:

```typescript
interface CodeIntelligenceConfig {
  enabled: boolean;
  languages: string[];           // e.g., ['typescript', 'python']
  serverPaths?: Record<string, string>;  // Custom LSP server paths
}

interface ICodeIntelligence {
  getDefinition(file: string, position: Position): Promise<Location | null>;
  getReferences(file: string, position: Position): Promise<Location[]>;
  getSymbols(file: string): Promise<Symbol[]>;
  getHover(file: string, position: Position): Promise<HoverInfo | null>;
  getDiagnostics(file: string): Promise<Diagnostic[]>;
  getCompletions(file: string, position: Position): Promise<CompletionItem[]>;
}

interface Symbol {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

type SymbolKind = 
  | 'class' | 'function' | 'method' | 'property' 
  | 'variable' | 'interface' | 'type' | 'enum';
```

**Files to create**:
- `packages/agent-runtime/src/intelligence/lspClient.ts`
- `packages/agent-runtime/src/intelligence/languageServer.ts`
- `packages/agent-runtime/src/intelligence/symbolIndex.ts`
- `packages/agent-runtime/src/intelligence/types.ts`
- `packages/agent-runtime/src/intelligence/index.ts`

---

## Implementation Phases

### Phase 1 (P0) - Core Intelligence
- Week 1-2: Extended Thinking & Reasoning
- Week 3-4: Memory System
- Week 5: Enhanced Streaming

### Phase 2 (P1) - Developer Experience
- Week 6: Multi-Modal Support
- Week 7: Background Tasks
- Week 8: Git Intelligence

### Phase 3 (P2) - Advanced Features
- Week 9: Interactive Terminal
- Week 10: Code Intelligence (LSP)

---

## Migration Strategy

1. **Non-breaking changes**: All new features are additive
2. **Feature flags**: Each upgrade has an enable/disable flag
3. **Gradual rollout**: Start with internal testing, then opt-in beta
4. **Backward compatibility**: Existing APIs remain unchanged

---

## Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Extended Thinking | Task completion rate | +15% |
| Memory System | Context recall accuracy | >90% |
| Enhanced Streaming | Time to first token | <100ms |
| Multi-Modal | UI issue resolution | +25% |
| Background Tasks | Interrupted task recovery | >95% |
| Git Intelligence | Commit message quality | 4.5/5 rating |
| Terminal | Interactive session success | >90% |
| Code Intelligence | Symbol resolution accuracy | >98% |
