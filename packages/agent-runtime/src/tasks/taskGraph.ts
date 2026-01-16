/**
 * Task Graph Kernel
 *
 * Event-sourced task graph for planning, orchestration, and auditing.
 * Features:
 * - Bounded storage with LRU eviction
 * - Event log compaction
 * - Snapshot/restore for persistence
 *
 * @example
 * ```typescript
 * const graph = createTaskGraphStore({
 *   maxNodes: 1000,
 *   maxEvents: 5000,
 *   compactionThreshold: 1000,
 * });
 *
 * const node = graph.createNode({ type: 'tool_call', title: 'Run tests' });
 * graph.updateNodeStatus(node.id, 'running');
 * graph.updateNodeStatus(node.id, 'completed');
 * ```
 *
 * @module tasks/taskGraph
 */

// ============================================================================
// Types
// ============================================================================

/** Types of nodes in the task graph */
export type TaskNodeType = "plan" | "subtask" | "tool_call" | "artifact" | "review" | "summary";

/** Possible statuses for a task node */
export type TaskNodeStatus = "pending" | "running" | "blocked" | "completed" | "failed";

/**
 * A node in the task graph.
 */
export interface TaskGraphNode {
  readonly id: string;
  readonly type: TaskNodeType;
  readonly title: string;
  readonly status: TaskNodeStatus;
  readonly dependsOn: readonly string[];
  readonly toolCallId?: string;
  readonly artifactId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Last access time for LRU eviction (internal use) */
  readonly lastAccessedAt: string;
}

/**
 * An edge connecting two nodes.
 */
export interface TaskGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: "depends_on" | "blocks";
}

/** Event types for the task graph event log */
export type TaskGraphEventType =
  | "node_created"
  | "node_started"
  | "node_blocked"
  | "node_completed"
  | "node_failed"
  | "node_updated"
  | "node_evicted"
  | "tool_call_started"
  | "tool_call_finished"
  | "artifact_emitted"
  | "policy_decision"
  | "compaction";

/**
 * An event in the task graph event log.
 */
export interface TaskGraphEvent {
  readonly id: string;
  readonly sequenceId: number;
  readonly eventVersion: number;
  readonly nodeId: string;
  readonly type: TaskGraphEventType;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly idempotencyKey?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Shared event context applied to all events in a run.
 */
export interface TaskGraphEventContext {
  readonly correlationId?: string;
  readonly source?: string;
}

/**
 * Per-event metadata overrides.
 */
export interface TaskGraphEventMeta extends TaskGraphEventContext {
  readonly idempotencyKey?: string;
}

/**
 * A complete snapshot of the task graph state.
 */
export interface TaskGraphSnapshot {
  readonly graphId: string;
  readonly nodes: readonly TaskGraphNode[];
  readonly edges: readonly TaskGraphEdge[];
  readonly events: readonly TaskGraphEvent[];
  readonly checkpoint?: { readonly eventId: string; readonly createdAt: string };
  readonly stats: TaskGraphStats;
}

/**
 * Statistics about the task graph.
 */
export interface TaskGraphStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly eventCount: number;
  readonly evictedNodeCount: number;
  readonly compactionCount: number;
}

/**
 * Configuration for the task graph store.
 */
export interface TaskGraphConfig {
  /** Graph ID (auto-generated if not provided) */
  readonly graphId?: string;
  /** Event schema version (default: 1) */
  readonly eventVersion?: number;
  /** Shared event context for correlation */
  readonly eventContext?: TaskGraphEventContext;
  /** Maximum number of nodes to keep (default: 10000) */
  readonly maxNodes?: number;
  /** Maximum number of events to keep (default: 50000) */
  readonly maxEvents?: number;
  /** Number of events to trigger compaction (default: 1000) */
  readonly compactionThreshold?: number;
  /** Custom timestamp function */
  readonly now?: () => string;
  /** Custom ID factory */
  readonly idFactory?: () => string;
}

/** Input for creating a new node */
export interface TaskGraphNodeInput {
  readonly type: TaskNodeType;
  readonly title: string;
  readonly dependsOn?: readonly string[];
  readonly toolCallId?: string;
  readonly artifactId?: string;
  readonly status?: TaskNodeStatus;
}

/** Input for updating an existing node */
export interface TaskGraphNodeUpdate {
  readonly title?: string;
  readonly dependsOn?: readonly string[];
  readonly toolCallId?: string;
  readonly artifactId?: string;
}

/** Handler for eviction events */
export type EvictionHandler = (node: TaskGraphNode) => void;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_NODES = 10000;
const DEFAULT_MAX_EVENTS = 50000;
const DEFAULT_COMPACTION_THRESHOLD = 1000;
const DEFAULT_EVENT_VERSION = 1;

const DEFAULT_CONFIG: Required<Pick<TaskGraphConfig, "now" | "idFactory">> = {
  now: () => new Date().toISOString(),
  idFactory: () => crypto.randomUUID(),
};

const STATUS_TRANSITIONS: Readonly<Record<TaskNodeStatus, readonly TaskNodeStatus[]>> = {
  pending: ["running", "blocked", "failed"],
  running: ["blocked", "completed", "failed"],
  blocked: ["running", "failed"],
  completed: [],
  failed: [],
} as const;

const STATUS_EVENT_MAP: Readonly<Record<TaskNodeStatus, TaskGraphEventType>> = {
  pending: "node_updated",
  running: "node_started",
  blocked: "node_blocked",
  completed: "node_completed",
  failed: "node_failed",
} as const;

// ============================================================================
// Helpers
// ============================================================================

const cloneNode = (node: TaskGraphNode): TaskGraphNode => ({
  ...node,
  dependsOn: [...node.dependsOn],
});
const cloneEdge = (edge: TaskGraphEdge): TaskGraphEdge => ({ ...edge });
const cloneEvent = (event: TaskGraphEvent): TaskGraphEvent => ({
  ...event,
  payload: { ...event.payload },
});

// ============================================================================
// Task Graph Store
// ============================================================================

/**
 * Event-sourced task graph with bounded storage.
 *
 * Features:
 * - LRU eviction when maxNodes is exceeded
 * - Event log compaction when maxEvents is exceeded
 * - Eviction handlers for cleanup notifications
 */
export class TaskGraphStore {
  private readonly graphId: string;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly eventVersion: number;
  private readonly maxNodes: number;
  private readonly maxEvents: number;
  private readonly compactionThreshold: number;
  private eventContext: TaskGraphEventContext;

  private readonly nodes = new Map<string, TaskGraphNode>();
  private readonly edges: TaskGraphEdge[] = [];
  private readonly events: TaskGraphEvent[] = [];
  private readonly evictionHandlers = new Set<EvictionHandler>();

  private checkpoint?: { eventId: string; createdAt: string };
  private evictedNodeCount = 0;
  private compactionCount = 0;
  private eventsSinceCompaction = 0;
  private nextSequenceId = 1;

  constructor(config: TaskGraphConfig = {}) {
    this.now = config.now ?? DEFAULT_CONFIG.now;
    this.idFactory = config.idFactory ?? DEFAULT_CONFIG.idFactory;
    this.graphId = config.graphId ?? this.idFactory();
    this.eventVersion = config.eventVersion ?? DEFAULT_EVENT_VERSION;
    this.eventContext = { ...config.eventContext };
    this.maxNodes = config.maxNodes ?? DEFAULT_MAX_NODES;
    this.maxEvents = config.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.compactionThreshold = config.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /** Get the graph ID */
  getId(): string {
    return this.graphId;
  }

  /** Get current statistics */
  getStats(): TaskGraphStats {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      eventCount: this.events.length,
      evictedNodeCount: this.evictedNodeCount,
      compactionCount: this.compactionCount,
    };
  }

  /**
   * Create a new node in the graph.
   * May trigger LRU eviction if maxNodes is exceeded.
   */
  createNode(input: TaskGraphNodeInput): TaskGraphNode {
    this.maybeEvictNodes();

    const now = this.now();
    const status = input.status ?? "pending";
    const node: TaskGraphNode = {
      id: this.idFactory(),
      type: input.type,
      title: input.title,
      status,
      dependsOn: [...(input.dependsOn ?? [])],
      toolCallId: input.toolCallId,
      artifactId: input.artifactId,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };

    this.nodes.set(node.id, node);
    this.recordEvent(node.id, "node_created", { node: cloneNode(node) });

    if (status !== "pending") {
      this.recordEvent(node.id, STATUS_EVENT_MAP[status], { status });
    }

    return cloneNode(node);
  }

  /**
   * Update a node's properties.
   */
  updateNode(nodeId: string, update: TaskGraphNodeUpdate): TaskGraphNode {
    const node = this.touchNode(nodeId);
    const updated: TaskGraphNode = {
      ...node,
      ...update,
      dependsOn: update.dependsOn ? [...update.dependsOn] : [...node.dependsOn],
      updatedAt: this.now(),
      lastAccessedAt: this.now(),
    };

    this.nodes.set(nodeId, updated);
    this.recordEvent(nodeId, "node_updated", { update: { ...update } });
    return cloneNode(updated);
  }

  /**
   * Update a node's status.
   * @throws Error if the transition is invalid
   */
  updateNodeStatus(nodeId: string, status: TaskNodeStatus): TaskGraphNode {
    const node = this.touchNode(nodeId);

    if (node.status === status) {
      return cloneNode(node);
    }

    if (!this.isValidTransition(node.status, status)) {
      throw new InvalidStatusTransitionError(node.status, status);
    }

    const updated: TaskGraphNode = {
      ...node,
      status,
      updatedAt: this.now(),
      lastAccessedAt: this.now(),
    };

    this.nodes.set(nodeId, updated);
    this.recordEvent(nodeId, STATUS_EVENT_MAP[status], { status });
    return cloneNode(updated);
  }

  /**
   * Add an edge between two nodes.
   * @throws Error if either node doesn't exist or edge already exists
   */
  addEdge(edge: TaskGraphEdge): TaskGraphEdge {
    this.touchNode(edge.from);
    this.touchNode(edge.to);

    const exists = this.edges.some(
      (existing) =>
        existing.from === edge.from && existing.to === edge.to && existing.type === edge.type
    );

    if (exists) {
      throw new Error(`Edge already exists: ${edge.from} -> ${edge.to} (${edge.type})`);
    }

    const nextEdge = cloneEdge(edge);
    this.edges.push(nextEdge);
    this.recordEvent(edge.from, "node_updated", {
      updateType: "edge_added",
      edge: cloneEdge(nextEdge),
    });
    return cloneEdge(nextEdge);
  }

  /** Set a checkpoint at the given event ID */
  setCheckpoint(eventId: string): void {
    this.checkpoint = { eventId, createdAt: this.now() };
  }

  /** Get a node by ID */
  getNode(nodeId: string): TaskGraphNode | undefined {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.touchNode(nodeId);
      return cloneNode(node);
    }
    return undefined;
  }

  /** List all nodes */
  listNodes(): TaskGraphNode[] {
    return Array.from(this.nodes.values(), cloneNode);
  }

  /** List all edges */
  listEdges(): TaskGraphEdge[] {
    return this.edges.map(cloneEdge);
  }

  /** List all events */
  listEvents(): TaskGraphEvent[] {
    return this.events.map(cloneEvent);
  }

  /** Get a full snapshot of the graph */
  getSnapshot(): TaskGraphSnapshot {
    return {
      graphId: this.graphId,
      nodes: this.listNodes(),
      edges: this.listEdges(),
      events: this.listEvents(),
      checkpoint: this.checkpoint ? { ...this.checkpoint } : undefined,
      stats: this.getStats(),
    };
  }

  /** Restore state from a snapshot */
  restore(snapshot: TaskGraphSnapshot): void {
    this.nodes.clear();
    this.edges.length = 0;
    this.events.length = 0;

    for (const node of snapshot.nodes) {
      this.nodes.set(node.id, cloneNode(node));
    }

    for (const edge of snapshot.edges) {
      this.edges.push(cloneEdge(edge));
    }

    for (const event of snapshot.events) {
      this.events.push(
        cloneEvent({
          ...event,
          eventVersion: event.eventVersion ?? this.eventVersion,
        })
      );
    }

    this.checkpoint = snapshot.checkpoint ? { ...snapshot.checkpoint } : undefined;
    this.evictedNodeCount = snapshot.stats?.evictedNodeCount ?? 0;
    this.compactionCount = snapshot.stats?.compactionCount ?? 0;

    // Restore nextSequenceId based on max sequence in events
    const maxSeq = this.events.reduce((max, e) => Math.max(max, e.sequenceId), 0);
    this.nextSequenceId = maxSeq + 1;
  }

  /** Register a handler to be called when nodes are evicted */
  onEviction(handler: EvictionHandler): () => void {
    this.evictionHandlers.add(handler);
    return () => this.evictionHandlers.delete(handler);
  }

  /** Update shared event context for future events */
  setEventContext(context: TaskGraphEventContext): void {
    this.eventContext = { ...this.eventContext, ...context };
  }

  /** Record a custom event against an existing node */
  recordNodeEvent(
    nodeId: string,
    type: TaskGraphEventType,
    payload: Record<string, unknown>,
    meta: TaskGraphEventMeta = {}
  ): TaskGraphEvent {
    this.touchNode(nodeId);
    return this.recordEvent(nodeId, type, payload, meta);
  }

  /** Manually trigger compaction */
  compact(): number {
    return this.performCompaction();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private recordEvent(
    nodeId: string,
    type: TaskGraphEventType,
    payload: Record<string, unknown>,
    meta: TaskGraphEventMeta = {}
  ): TaskGraphEvent {
    const event: TaskGraphEvent = {
      id: this.idFactory(),
      sequenceId: this.nextSequenceId++,
      eventVersion: this.eventVersion,
      nodeId,
      type,
      timestamp: this.now(),
      correlationId: meta.correlationId ?? this.eventContext.correlationId,
      source: meta.source ?? this.eventContext.source,
      idempotencyKey: meta.idempotencyKey,
      payload,
    };
    this.events.push(event);
    this.eventsSinceCompaction++;

    this.maybeCompact();
    return cloneEvent(event);
  }

  private touchNode(nodeId: string): TaskGraphNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NodeNotFoundError(nodeId);
    }

    // Update last accessed time for LRU
    const touched: TaskGraphNode = {
      ...node,
      lastAccessedAt: this.now(),
    };
    this.nodes.set(nodeId, touched);
    return touched;
  }

  private maybeEvictNodes(): void {
    if (this.nodes.size < this.maxNodes) {
      return;
    }

    // Find the least recently accessed completed/failed node
    let lruNode: TaskGraphNode | undefined;
    let lruTime = "";

    for (const node of this.nodes.values()) {
      // Only evict terminal nodes (completed or failed)
      if (node.status !== "completed" && node.status !== "failed") {
        continue;
      }

      if (!lruNode || node.lastAccessedAt < lruTime) {
        lruNode = node;
        lruTime = node.lastAccessedAt;
      }
    }

    if (lruNode) {
      this.evictNode(lruNode);
    }
  }

  private evictNode(node: TaskGraphNode): void {
    this.nodes.delete(node.id);
    this.evictedNodeCount++;

    // Remove edges involving this node
    for (let i = this.edges.length - 1; i >= 0; i--) {
      if (this.edges[i].from === node.id || this.edges[i].to === node.id) {
        this.edges.splice(i, 1);
      }
    }

    this.recordEvent(node.id, "node_evicted", { node: cloneNode(node) });
    this.notifyEviction(node);
  }

  private notifyEviction(node: TaskGraphNode): void {
    for (const handler of this.evictionHandlers) {
      try {
        handler(cloneNode(node));
      } catch {
        // Ignore handler errors
      }
    }
  }

  private maybeCompact(): void {
    if (
      this.eventsSinceCompaction >= this.compactionThreshold ||
      this.events.length > this.maxEvents
    ) {
      this.performCompaction();
    }
  }

  private performCompaction(): number {
    const targetSize = Math.floor(this.maxEvents * 0.8);
    const eventsToRemove = this.events.length - targetSize;

    if (eventsToRemove <= 0) {
      return 0;
    }

    // Remove oldest events
    const removed = this.events.splice(0, eventsToRemove);
    this.compactionCount++;
    this.eventsSinceCompaction = 0;

    // Record compaction event
    this.events.push({
      id: this.idFactory(),
      sequenceId: this.nextSequenceId++,
      eventVersion: this.eventVersion,
      nodeId: "",
      type: "compaction",
      timestamp: this.now(),
      correlationId: this.eventContext.correlationId,
      source: this.eventContext.source,
      payload: { removedCount: removed.length },
    });

    return removed.length;
  }

  private isValidTransition(from: TaskNodeStatus, to: TaskNodeStatus): boolean {
    return STATUS_TRANSITIONS[from].includes(to);
  }
}

// ============================================================================
// Errors
// ============================================================================

/** Error thrown when a node is not found */
export class NodeNotFoundError extends Error {
  readonly nodeId: string;

  constructor(nodeId: string) {
    super(`Task node not found: ${nodeId}`);
    this.name = "NodeNotFoundError";
    this.nodeId = nodeId;
  }
}

/** Error thrown when an invalid status transition is attempted */
export class InvalidStatusTransitionError extends Error {
  readonly fromStatus: TaskNodeStatus;
  readonly toStatus: TaskNodeStatus;

  constructor(from: TaskNodeStatus, to: TaskNodeStatus) {
    super(`Invalid status transition from ${from} to ${to}`);
    this.name = "InvalidStatusTransitionError";
    this.fromStatus = from;
    this.toStatus = to;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new TaskGraphStore.
 *
 * @param config - Configuration options
 * @returns A new TaskGraphStore instance
 */
export function createTaskGraphStore(config?: TaskGraphConfig): TaskGraphStore {
  return new TaskGraphStore(config);
}

/**
 * Create a TaskGraphStore from a snapshot.
 *
 * @param snapshot - The snapshot to restore from
 * @param config - Additional configuration options
 * @returns A restored TaskGraphStore instance
 */
export function createTaskGraphStoreFromSnapshot(
  snapshot: TaskGraphSnapshot,
  config: TaskGraphConfig = {}
): TaskGraphStore {
  const store = new TaskGraphStore({ ...config, graphId: snapshot.graphId });
  store.restore(snapshot);
  return store;
}
