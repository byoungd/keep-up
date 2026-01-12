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

// ============================================================================
// Context Manager
// ============================================================================

/**
 * Manages agent contexts with hierarchical propagation.
 */
export class ContextManager {
  private readonly contexts = new Map<string, AgentContext>();
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
    };

    // Inherit from parent if specified
    if (options.parentId) {
      const parent = this.contexts.get(options.parentId);
      if (parent) {
        context.workingDirectory = context.workingDirectory ?? parent.workingDirectory;
        context.documentId = context.documentId ?? parent.documentId;
        // Copy facts from parent
        context.facts = [...parent.facts];
        // Copy touched files
        for (const file of parent.touchedFiles) {
          context.touchedFiles.add(file);
        }
      }
    }

    this.contexts.set(id, context);
    return context;
  }

  /**
   * Get a context by ID.
   */
  get(id: string): AgentContext | undefined {
    return this.contexts.get(id);
  }

  /**
   * Fork a context for a child agent.
   */
  fork(parentId: string, options: Partial<CreateContextOptions> = {}): AgentContext {
    return this.create({ ...options, parentId });
  }

  /**
   * Add a fact to the context.
   */
  addFact(contextId: string, fact: Omit<ContextFact, "timestamp">): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.facts.push({ ...fact, timestamp: Date.now() });
    }
  }

  /**
   * Mark a file as touched in the context.
   */
  touchFile(contextId: string, filePath: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.touchedFiles.add(filePath);
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
    }
  }

  /**
   * Get a cached result if valid.
   */
  getCachedResult(contextId: string, key: string): unknown | undefined {
    const context = this.contexts.get(contextId);
    if (!context) {
      return undefined;
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

    const parent = this.contexts.get(child.parentId);
    if (!parent) {
      return;
    }

    // Merge facts (avoid duplicates)
    const existingContents = new Set(parent.facts.map((f) => f.content));
    for (const fact of child.facts) {
      if (!existingContents.has(fact.content)) {
        parent.facts.push(fact);
      }
    }

    // Merge touched files
    for (const file of child.touchedFiles) {
      parent.touchedFiles.add(file);
    }
  }

  /**
   * Dispose a context and optionally merge to parent.
   */
  dispose(id: string, mergeToParent = true): void {
    if (mergeToParent) {
      this.mergeToParent(id);
    }
    this.contexts.delete(id);
  }

  /**
   * Get summary of context for LLM.
   */
  getSummary(contextId: string): string {
    const context = this.contexts.get(contextId);
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

  private generateId(): string {
    return `ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
