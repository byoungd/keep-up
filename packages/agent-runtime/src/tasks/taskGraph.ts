/**
 * Task Graph Kernel
 *
 * Event-sourced task graph for planning, orchestration, and auditing.
 */

// ============================================================================
// Types
// ============================================================================

export type TaskNodeType = "plan" | "subtask" | "tool_call" | "artifact" | "review" | "summary";
export type TaskNodeStatus = "pending" | "running" | "blocked" | "completed" | "failed";

export interface TaskGraphNode {
  id: string;
  type: TaskNodeType;
  title: string;
  status: TaskNodeStatus;
  dependsOn: string[];
  toolCallId?: string;
  artifactId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskGraphEdge {
  from: string;
  to: string;
  type: "depends_on" | "blocks";
}

export type TaskGraphEventType =
  | "node_created"
  | "node_started"
  | "node_blocked"
  | "node_completed"
  | "node_failed"
  | "node_updated"
  | "tool_call_started"
  | "tool_call_finished"
  | "artifact_emitted"
  | "policy_decision";

export interface TaskGraphEvent {
  id: string;
  nodeId: string;
  type: TaskGraphEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TaskGraphSnapshot {
  graphId: string;
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
  events: TaskGraphEvent[];
  checkpoint?: { eventId: string; createdAt: string };
}

export interface TaskGraphConfig {
  graphId?: string;
  now?: () => string;
  idFactory?: () => string;
}

export interface TaskGraphNodeInput {
  type: TaskNodeType;
  title: string;
  dependsOn?: string[];
  toolCallId?: string;
  artifactId?: string;
  status?: TaskNodeStatus;
}

export interface TaskGraphNodeUpdate {
  title?: string;
  dependsOn?: string[];
  toolCallId?: string;
  artifactId?: string;
}

// ============================================================================
// Defaults and helpers
// ============================================================================

const DEFAULT_CONFIG: Required<Pick<TaskGraphConfig, "now" | "idFactory">> = {
  now: () => new Date().toISOString(),
  idFactory: () => crypto.randomUUID(),
};

const STATUS_TRANSITIONS: Record<TaskNodeStatus, TaskNodeStatus[]> = {
  pending: ["running", "blocked", "failed"],
  running: ["blocked", "completed", "failed"],
  blocked: ["running", "failed"],
  completed: [],
  failed: [],
};

const STATUS_EVENT_MAP: Record<TaskNodeStatus, TaskGraphEventType> = {
  pending: "node_updated",
  running: "node_started",
  blocked: "node_blocked",
  completed: "node_completed",
  failed: "node_failed",
};

const cloneNode = (node: TaskGraphNode): TaskGraphNode => ({ ...node });
const cloneEdge = (edge: TaskGraphEdge): TaskGraphEdge => ({ ...edge });
const cloneEvent = (event: TaskGraphEvent): TaskGraphEvent => ({
  ...event,
  payload: { ...event.payload },
});

// ============================================================================
// Task Graph Store
// ============================================================================

export class TaskGraphStore {
  private readonly graphId: string;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly nodes = new Map<string, TaskGraphNode>();
  private readonly edges: TaskGraphEdge[] = [];
  private readonly events: TaskGraphEvent[] = [];
  private checkpoint?: { eventId: string; createdAt: string };

  constructor(config: TaskGraphConfig = {}) {
    this.now = config.now ?? DEFAULT_CONFIG.now;
    this.idFactory = config.idFactory ?? DEFAULT_CONFIG.idFactory;
    this.graphId = config.graphId ?? this.idFactory();
  }

  getId(): string {
    return this.graphId;
  }

  createNode(input: TaskGraphNodeInput): TaskGraphNode {
    const now = this.now();
    const status = input.status ?? "pending";
    const node: TaskGraphNode = {
      id: this.idFactory(),
      type: input.type,
      title: input.title,
      status,
      dependsOn: input.dependsOn ?? [],
      toolCallId: input.toolCallId,
      artifactId: input.artifactId,
      createdAt: now,
      updatedAt: now,
    };

    this.nodes.set(node.id, node);
    this.recordEvent(node.id, "node_created", { node: cloneNode(node) });

    if (status !== "pending") {
      this.recordEvent(node.id, STATUS_EVENT_MAP[status], { status });
    }

    return cloneNode(node);
  }

  updateNode(nodeId: string, update: TaskGraphNodeUpdate): TaskGraphNode {
    const node = this.getNodeOrThrow(nodeId);
    const updated: TaskGraphNode = {
      ...node,
      ...update,
      dependsOn: update.dependsOn ?? node.dependsOn,
      updatedAt: this.now(),
    };

    this.nodes.set(nodeId, updated);
    this.recordEvent(nodeId, "node_updated", { update: { ...update } });
    return cloneNode(updated);
  }

  updateNodeStatus(nodeId: string, status: TaskNodeStatus): TaskGraphNode {
    const node = this.getNodeOrThrow(nodeId);

    if (node.status === status) {
      return cloneNode(node);
    }

    if (!this.isValidTransition(node.status, status)) {
      throw new Error(`Invalid status transition from ${node.status} to ${status}`);
    }

    const updated: TaskGraphNode = {
      ...node,
      status,
      updatedAt: this.now(),
    };

    this.nodes.set(nodeId, updated);
    this.recordEvent(nodeId, STATUS_EVENT_MAP[status], { status });
    return cloneNode(updated);
  }

  addEdge(edge: TaskGraphEdge): TaskGraphEdge {
    this.assertNodeExists(edge.from);
    this.assertNodeExists(edge.to);

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

  setCheckpoint(eventId: string): void {
    this.checkpoint = { eventId, createdAt: this.now() };
  }

  getNode(nodeId: string): TaskGraphNode | undefined {
    const node = this.nodes.get(nodeId);
    return node ? cloneNode(node) : undefined;
  }

  listNodes(): TaskGraphNode[] {
    return Array.from(this.nodes.values(), cloneNode);
  }

  listEdges(): TaskGraphEdge[] {
    return this.edges.map(cloneEdge);
  }

  listEvents(): TaskGraphEvent[] {
    return this.events.map(cloneEvent);
  }

  getSnapshot(): TaskGraphSnapshot {
    return {
      graphId: this.graphId,
      nodes: this.listNodes(),
      edges: this.listEdges(),
      events: this.listEvents(),
      checkpoint: this.checkpoint ? { ...this.checkpoint } : undefined,
    };
  }

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
      this.events.push(cloneEvent(event));
    }

    this.checkpoint = snapshot.checkpoint ? { ...snapshot.checkpoint } : undefined;
  }

  private recordEvent(
    nodeId: string,
    type: TaskGraphEventType,
    payload: Record<string, unknown>
  ): TaskGraphEvent {
    const event: TaskGraphEvent = {
      id: this.idFactory(),
      nodeId,
      type,
      timestamp: this.now(),
      payload,
    };
    this.events.push(event);
    return cloneEvent(event);
  }

  private assertNodeExists(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Task node not found: ${nodeId}`);
    }
  }

  private getNodeOrThrow(nodeId: string): TaskGraphNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Task node not found: ${nodeId}`);
    }
    return node;
  }

  private isValidTransition(from: TaskNodeStatus, to: TaskNodeStatus): boolean {
    return STATUS_TRANSITIONS[from].includes(to);
  }
}

export function createTaskGraphStore(config?: TaskGraphConfig): TaskGraphStore {
  return new TaskGraphStore(config);
}

export function createTaskGraphStoreFromSnapshot(
  snapshot: TaskGraphSnapshot,
  config: TaskGraphConfig = {}
): TaskGraphStore {
  const store = new TaskGraphStore({ ...config, graphId: snapshot.graphId });
  store.restore(snapshot);
  return store;
}
