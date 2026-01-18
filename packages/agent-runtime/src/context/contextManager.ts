/**
 * Agent Context
 *
 * Provides shared context and state management for agents.
 * Enables context propagation between parent and child agents.
 */

// ============================================================================
// Context Types
// ============================================================================

/**
 * Shared context that can be passed between agents.
 */
export interface AgentContext {
  /** Unique context ID for tracing */
  readonly id: string;

  /** Parent context ID if spawned from another agent */
  readonly parentId?: string;

  /** Context creation timestamp */
  readonly createdAt: number;

  /** Working directory for file operations */
  workingDirectory?: string;

  /** Current document context (for LFCC operations) */
  documentId?: string;

  /** User-provided metadata */
  metadata: Record<string, unknown>;

  /** Accumulated facts/knowledge from the session */
  facts: ContextFact[];

  /** Files that have been read/modified in this context */
  touchedFiles: Set<string>;

  /** Tool results cache */
  resultCache: Map<string, CachedResult>;

  /** Unstructured persistent notes (scratchpad/NOTES.md) */
  scratchpad: string;

  /** Structured progress tracking */
  progress: {
    completedSteps: string[];
    pendingSteps: string[];
    currentObjective: string;
  };
}

/**
 * A fact learned during agent execution.
 */
export interface ContextFact {
  /** Fact type */
  type: "file" | "codebase" | "requirement" | "decision" | "error";

  /** The fact content */
  content: string;

  /** Source of the fact (tool name, user, etc.) */
  source: string;

  /** Confidence level */
  confidence: "high" | "medium" | "low";

  /** Timestamp */
  timestamp: number;
}

/**
 * Cached tool result.
 */
export interface CachedResult {
  /** Cache key (tool name + args hash) */
  key: string;

  /** The cached result */
  result: unknown;

  /** When the result was cached */
  cachedAt: number;

  /** Time-to-live in milliseconds */
  ttlMs: number;
}

/**
 * Live context view with overlay semantics.
 */
export interface ContextView {
  /** Unique view ID */
  readonly id: string;
  /** Parent context or view ID */
  readonly parentId: string;
  /** View creation timestamp */
  readonly createdAt: number;
}

// ============================================================================
// Context Manager
// ============================================================================

/**
 * Manages agent contexts with hierarchical propagation.
 */
export class ContextManager {
  private readonly contexts = new Map<string, AgentContext>();
  private readonly views = new Map<string, ContextViewState>();
  private readonly defaultTtlMs: number;

  constructor(options: ContextManagerOptions = {}) {
    this.defaultTtlMs = options.defaultCacheTtlMs ?? 60_000; // 1 minute default
  }

  /**
   * Create a new root context.
   */
  create(options: CreateContextOptions = {}): AgentContext {
    const id = this.generateId();

    const context: AgentContext = {
      id,
      parentId: options.parentId,
      createdAt: Date.now(),
      workingDirectory: options.workingDirectory,
      documentId: options.documentId,
      metadata: options.metadata ?? {},
      facts: [],
      touchedFiles: new Set(),
      resultCache: new Map(),
      scratchpad: "",
      progress: {
        completedSteps: [],
        pendingSteps: [],
        currentObjective: "",
      },
    };

    // Inherit from parent if specified
    if (options.parentId) {
      const parent = this.resolveContextSnapshot(options.parentId);
      if (parent) {
        context.workingDirectory = context.workingDirectory ?? parent.workingDirectory;
        context.documentId = context.documentId ?? parent.documentId;
        // Copy facts from parent
        context.facts = [...parent.facts];
        // Copy touched files
        for (const file of parent.touchedFiles) {
          context.touchedFiles.add(file);
        }
        // Inherit scratchpad and progress
        context.scratchpad = parent.scratchpad;
        context.progress = {
          completedSteps: [...parent.progress.completedSteps],
          pendingSteps: [...parent.progress.pendingSteps],
          currentObjective: parent.progress.currentObjective,
        };
      }
    }

    this.contexts.set(id, context);
    return context;
  }

  /**
   * Get a context by ID.
   */
  get(id: string): AgentContext | undefined {
    const context = this.contexts.get(id);
    if (context) {
      return context;
    }
    return this.getViewSnapshot(id);
  }

  /**
   * Fork a context for a child agent.
   */
  fork(parentId: string, options: Partial<CreateContextOptions> = {}): AgentContext {
    return this.create({ ...options, parentId });
  }

  /**
   * Create a live context view with overlay semantics.
   */
  createView(parentId: string, options: CreateContextViewOptions = {}): ContextView {
    if (!this.has(parentId)) {
      throw new Error(`Cannot create view for missing context: ${parentId}`);
    }

    const id = this.generateId("view");
    const view: ContextViewState = {
      id,
      parentId,
      createdAt: Date.now(),
      workingDirectory: options.workingDirectory,
      documentId: options.documentId,
      metadata: options.metadata ?? {},
      facts: [],
      touchedFiles: new Set(),
      resultCache: new Map(),
      scratchpadOps: [],
      progress: {},
    };

    this.views.set(id, view);
    return view;
  }

  /**
   * Get a context view by ID.
   */
  getView(id: string): ContextView | undefined {
    return this.views.get(id);
  }

  /**
   * Check whether a context or view exists.
   */
  has(id: string): boolean {
    return this.contexts.has(id) || this.views.has(id);
  }

  /**
   * Add a fact to the context.
   */
  addFact(contextId: string, fact: Omit<ContextFact, "timestamp">): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.facts.push({ ...fact, timestamp: Date.now() });
      return;
    }

    const view = this.views.get(contextId);
    if (view) {
      view.facts.push({ ...fact, timestamp: Date.now() });
    }
  }

  /**
   * Mark a file as touched in the context.
   */
  touchFile(contextId: string, filePath: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.touchedFiles.add(filePath);
      return;
    }

    const view = this.views.get(contextId);
    if (view) {
      view.touchedFiles.add(filePath);
    }
  }

  /**
   * Update metadata entries for the context.
   */
  updateMetadata(contextId: string, updates: Record<string, unknown>): void {
    const context = this.contexts.get(contextId);
    if (context) {
      Object.assign(context.metadata, updates);
      return;
    }

    const view = this.views.get(contextId);
    if (view) {
      Object.assign(view.metadata, updates);
    }
  }

  /**
   * Update the scratchpad (append or replace).
   */
  updateScratchpad(
    contextId: string,
    content: string,
    mode: "append" | "replace" = "replace"
  ): void {
    const context = this.contexts.get(contextId);
    if (context) {
      if (mode === "append") {
        context.scratchpad = context.scratchpad ? `${context.scratchpad}\n${content}` : content;
      } else {
        context.scratchpad = content;
      }
      return;
    }

    const view = this.views.get(contextId);
    if (view) {
      view.scratchpadOps.push({ type: mode, content });
    }
  }

  /**
   * Update progress tracking.
   */
  updateProgress(
    contextId: string,
    update: Partial<{ completedSteps: string[]; pendingSteps: string[]; currentObjective: string }>
  ): void {
    const context = this.contexts.get(contextId);
    if (context) {
      if (update.completedSteps !== undefined) {
        context.progress.completedSteps = update.completedSteps;
      }
      if (update.pendingSteps !== undefined) {
        context.progress.pendingSteps = update.pendingSteps;
      }
      if (update.currentObjective !== undefined) {
        context.progress.currentObjective = update.currentObjective;
      }
      return;
    }

    const view = this.views.get(contextId);
    if (view) {
      if (update.completedSteps !== undefined) {
        view.progress.completedSteps = [...update.completedSteps];
      }
      if (update.pendingSteps !== undefined) {
        view.progress.pendingSteps = [...update.pendingSteps];
      }
      if (update.currentObjective !== undefined) {
        view.progress.currentObjective = update.currentObjective;
      }
    }
  }

  /**
   * Mark a step as completed and move to next.
   */
  completeStep(contextId: string, stepName: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      // Add to completed if not already there
      if (!context.progress.completedSteps.includes(stepName)) {
        context.progress.completedSteps.push(stepName);
      }
      // Remove from pending if present
      context.progress.pendingSteps = context.progress.pendingSteps.filter((s) => s !== stepName);
      return;
    }

    const view = this.views.get(contextId);
    if (view) {
      const snapshot = this.getViewSnapshot(contextId);
      if (!snapshot) {
        return;
      }
      const completed = new Set(snapshot.progress.completedSteps);
      completed.add(stepName);
      view.progress.completedSteps = Array.from(completed);
      view.progress.pendingSteps = snapshot.progress.pendingSteps.filter((s) => s !== stepName);
    }
  }

  /**
   * Cache a tool result.
   */
  cacheResult(contextId: string, key: string, result: unknown, ttlMs?: number): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.resultCache.set(key, {
        key,
        result,
        cachedAt: Date.now(),
        ttlMs: ttlMs ?? this.defaultTtlMs,
      });
      return;
    }

    const view = this.views.get(contextId);
    if (view) {
      view.resultCache.set(key, {
        key,
        result,
        cachedAt: Date.now(),
        ttlMs: ttlMs ?? this.defaultTtlMs,
      });
    }
  }

  /**
   * Get a cached result if valid.
   */
  getCachedResult(contextId: string, key: string): unknown | undefined {
    const context = this.contexts.get(contextId);
    if (!context) {
      const view = this.views.get(contextId);
      if (!view) {
        return undefined;
      }

      const cached = view.resultCache.get(key);
      if (cached) {
        if (Date.now() - cached.cachedAt > cached.ttlMs) {
          view.resultCache.delete(key);
        } else {
          return cached.result;
        }
      }

      return this.getCachedResult(view.parentId, key);
    }

    const cached = context.resultCache.get(key);
    if (!cached) {
      return undefined;
    }

    // Check if expired
    if (Date.now() - cached.cachedAt > cached.ttlMs) {
      context.resultCache.delete(key);
      return undefined;
    }

    return cached.result;
  }

  /**
   * Merge child context facts back to parent.
   */
  mergeToParent(childId: string): void {
    const child = this.contexts.get(childId);
    if (!child?.parentId) {
      return;
    }

    const parentContext = this.contexts.get(child.parentId);
    if (parentContext) {
      this.mergeFacts(parentContext.facts, child.facts);
      for (const file of child.touchedFiles) {
        parentContext.touchedFiles.add(file);
      }
      return;
    }

    const parentView = this.views.get(child.parentId);
    if (!parentView) {
      return;
    }

    this.applyContextToView(parentView, child);
  }

  /**
   * Merge a context view overlay back to its parent.
   */
  mergeView(viewId: string): void {
    const view = this.views.get(viewId);
    if (!view) {
      return;
    }

    const parentContext = this.contexts.get(view.parentId);
    if (parentContext) {
      this.applyOverlayToContext(parentContext, view);
      return;
    }

    const parentView = this.views.get(view.parentId);
    if (parentView) {
      this.applyOverlayToView(parentView, view);
    }
  }

  /**
   * Dispose a context view and optionally merge to parent.
   */
  disposeView(id: string, mergeToParent = true): void {
    if (mergeToParent) {
      this.mergeView(id);
    }
    this.views.delete(id);
  }

  /**
   * Dispose a context and optionally merge to parent.
   */
  dispose(id: string, mergeToParent = true): void {
    if (this.views.has(id)) {
      this.disposeView(id, mergeToParent);
      return;
    }

    if (mergeToParent) {
      this.mergeToParent(id);
    }
    this.contexts.delete(id);
  }

  /**
   * Get summary of context for LLM.
   */
  getSummary(contextId: string): string {
    const context = this.resolveContextSnapshot(contextId);
    if (!context) {
      return "";
    }

    const lines: string[] = [];

    if (context.workingDirectory) {
      lines.push(`Working directory: ${context.workingDirectory}`);
    }

    if (context.documentId) {
      lines.push(`Document: ${context.documentId}`);
    }

    if (context.touchedFiles.size > 0) {
      lines.push(`Files accessed: ${Array.from(context.touchedFiles).slice(0, 10).join(", ")}`);
      if (context.touchedFiles.size > 10) {
        lines.push(`  ... and ${context.touchedFiles.size - 10} more`);
      }
    }

    if (context.facts.length > 0) {
      lines.push("\nKnown facts:");
      const recentFacts = context.facts.slice(-10);
      for (const fact of recentFacts) {
        lines.push(`- [${fact.type}] ${fact.content}`);
      }
    }

    return lines.join("\n");
  }

  private generateId(prefix = "ctx"): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getViewSnapshot(viewId: string): AgentContext | undefined {
    if (!this.views.has(viewId)) {
      return undefined;
    }
    return this.resolveContextSnapshot(viewId);
  }

  private resolveContextSnapshot(
    contextId: string,
    visited: Set<string> = new Set()
  ): AgentContext | undefined {
    const context = this.contexts.get(contextId);
    if (context) {
      return context;
    }

    const view = this.views.get(contextId);
    if (!view) {
      return undefined;
    }

    if (visited.has(contextId)) {
      return undefined;
    }
    visited.add(contextId);

    const parent = this.resolveContextSnapshot(view.parentId, visited);
    if (!parent) {
      return undefined;
    }

    const snapshot = this.cloneContext(parent);
    this.applyOverlayToContext(snapshot, view);
    // Allow overwriting read-only properties for view resolution
    const mutableSnapshot = snapshot as { -readonly [K in keyof AgentContext]: AgentContext[K] };
    mutableSnapshot.id = view.id;
    mutableSnapshot.parentId = view.parentId;
    mutableSnapshot.createdAt = view.createdAt;

    return snapshot;
  }

  private cloneContext(context: AgentContext): AgentContext {
    return {
      ...context,
      metadata: { ...context.metadata },
      facts: [...context.facts],
      touchedFiles: new Set(context.touchedFiles),
      resultCache: new Map(context.resultCache),
      scratchpad: context.scratchpad,
      progress: {
        completedSteps: [...context.progress.completedSteps],
        pendingSteps: [...context.progress.pendingSteps],
        currentObjective: context.progress.currentObjective,
      },
    };
  }

  private applyOverlayToContext(target: AgentContext, overlay: ContextViewState): void {
    if (overlay.workingDirectory !== undefined) {
      target.workingDirectory = overlay.workingDirectory;
    }
    if (overlay.documentId !== undefined) {
      target.documentId = overlay.documentId;
    }

    if (Object.keys(overlay.metadata).length > 0) {
      target.metadata = { ...target.metadata, ...overlay.metadata };
    }

    this.mergeFacts(target.facts, overlay.facts);

    for (const file of overlay.touchedFiles) {
      target.touchedFiles.add(file);
    }

    for (const [key, entry] of overlay.resultCache.entries()) {
      target.resultCache.set(key, entry);
    }

    if (overlay.scratchpadOps.length > 0) {
      target.scratchpad = this.applyScratchpadOperations(target.scratchpad, overlay.scratchpadOps);
    }

    if (overlay.progress.completedSteps !== undefined) {
      target.progress.completedSteps = [...overlay.progress.completedSteps];
    }
    if (overlay.progress.pendingSteps !== undefined) {
      target.progress.pendingSteps = [...overlay.progress.pendingSteps];
    }
    if (overlay.progress.currentObjective !== undefined) {
      target.progress.currentObjective = overlay.progress.currentObjective;
    }
  }

  private applyOverlayToView(target: ContextViewState, overlay: ContextViewState): void {
    if (overlay.workingDirectory !== undefined) {
      target.workingDirectory = overlay.workingDirectory;
    }
    if (overlay.documentId !== undefined) {
      target.documentId = overlay.documentId;
    }

    if (Object.keys(overlay.metadata).length > 0) {
      Object.assign(target.metadata, overlay.metadata);
    }

    this.mergeFacts(target.facts, overlay.facts);

    for (const file of overlay.touchedFiles) {
      target.touchedFiles.add(file);
    }

    for (const [key, entry] of overlay.resultCache.entries()) {
      target.resultCache.set(key, entry);
    }

    if (overlay.scratchpadOps.length > 0) {
      target.scratchpadOps.push(...overlay.scratchpadOps);
    }

    if (overlay.progress.completedSteps !== undefined) {
      target.progress.completedSteps = [...overlay.progress.completedSteps];
    }
    if (overlay.progress.pendingSteps !== undefined) {
      target.progress.pendingSteps = [...overlay.progress.pendingSteps];
    }
    if (overlay.progress.currentObjective !== undefined) {
      target.progress.currentObjective = overlay.progress.currentObjective;
    }
  }

  private applyContextToView(target: ContextViewState, source: AgentContext): void {
    if (source.workingDirectory !== undefined) {
      target.workingDirectory = source.workingDirectory;
    }
    if (source.documentId !== undefined) {
      target.documentId = source.documentId;
    }

    if (Object.keys(source.metadata).length > 0) {
      Object.assign(target.metadata, source.metadata);
    }

    this.mergeFacts(target.facts, source.facts);

    for (const file of source.touchedFiles) {
      target.touchedFiles.add(file);
    }

    for (const [key, entry] of source.resultCache.entries()) {
      target.resultCache.set(key, entry);
    }

    target.scratchpadOps.push({ type: "replace", content: source.scratchpad });

    target.progress.completedSteps = [...source.progress.completedSteps];
    target.progress.pendingSteps = [...source.progress.pendingSteps];
    target.progress.currentObjective = source.progress.currentObjective;
  }

  private mergeFacts(targetFacts: ContextFact[], incoming: ContextFact[]): void {
    if (incoming.length === 0) {
      return;
    }
    const existing = new Set(targetFacts.map((fact) => fact.content));
    for (const fact of incoming) {
      if (!existing.has(fact.content)) {
        targetFacts.push(fact);
        existing.add(fact.content);
      }
    }
  }

  private applyScratchpadOperations(base: string, ops: ScratchpadOperation[]): string {
    let current = base;
    for (const op of ops) {
      if (op.type === "append") {
        current = current ? `${current}\n${op.content}` : op.content;
      } else {
        current = op.content;
      }
    }
    return current;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ContextManagerOptions {
  /** Default TTL for cached results in milliseconds */
  defaultCacheTtlMs?: number;
}

export interface CreateContextOptions {
  /** Parent context ID for inheritance */
  parentId?: string;
  /** Working directory */
  workingDirectory?: string;
  /** Document ID for LFCC operations */
  documentId?: string;
  /** Initial metadata */
  metadata?: Record<string, unknown>;
}

export interface CreateContextViewOptions {
  /** Optional working directory override */
  workingDirectory?: string;
  /** Optional document ID override */
  documentId?: string;
  /** Optional metadata overrides */
  metadata?: Record<string, unknown>;
}

type ScratchpadOperation = {
  type: "append" | "replace";
  content: string;
};

interface ContextViewState extends ContextView {
  workingDirectory?: string;
  documentId?: string;
  metadata: Record<string, unknown>;
  facts: ContextFact[];
  touchedFiles: Set<string>;
  resultCache: Map<string, CachedResult>;
  scratchpadOps: ScratchpadOperation[];
  progress: Partial<AgentContext["progress"]>;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a context manager.
 *
 * @example
 * ```typescript
 * const contextManager = createContextManager();
 *
 * // Create root context
 * const ctx = contextManager.create({
 *   workingDirectory: '/path/to/project',
 * });
 *
 * // Add facts as agent learns
 * contextManager.addFact(ctx.id, {
 *   type: 'codebase',
 *   content: 'Uses React 19 with TypeScript',
 *   source: 'explore-agent',
 *   confidence: 'high',
 * });
 *
 * // Fork for child agent
 * const childCtx = contextManager.fork(ctx.id);
 *
 * // Child inherits parent's facts and state
 * ```
 */
export function createContextManager(options?: ContextManagerOptions): ContextManager {
  return new ContextManager(options);
}
