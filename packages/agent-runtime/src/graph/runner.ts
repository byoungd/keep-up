/**
 * Graph Runner
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { ICheckpointManager } from "@ku0/agent-runtime-core";
import { getLogger, type RuntimeLogger } from "../utils/logger";
import { createGraphNodeCache } from "./cache";
import type {
  ChannelDefinition,
  ChannelKey,
  ChannelReducer,
  GraphChannelWrite,
  GraphCheckpointSnapshot,
  GraphDefinition,
  GraphNodeCache,
  GraphNodeCacheEntry,
  GraphNodeContext,
  GraphNodeDefinition,
  GraphNodeResult,
  GraphNodeStatus,
  GraphRunnerConfig,
  GraphRunResult,
  RetryPolicy,
} from "./types";

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_BACKOFF_MS = 200;
const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_MAX_BACKOFF_MS = 5000;

interface MutableGraphNodeState {
  id: string;
  status: GraphNodeStatus;
  attempts: number;
  lastSeen: Record<string, number>;
  lastStartedAt?: number;
  lastCompletedAt?: number;
  error?: string;
}

interface GraphEventEmitter {
  emit<T>(type: string, payload: T): void;
}

class ChannelStore {
  private readonly values = new Map<string, unknown>();
  private readonly versions = new Map<string, number>();
  private readonly reducers = new Map<string, ChannelReducer<unknown>>();

  constructor(channels: readonly ChannelDefinition<unknown>[], snapshot?: GraphCheckpointSnapshot) {
    for (const channel of channels) {
      this.reducers.set(channel.key.name, channel.reducer as ChannelReducer<unknown>);
    }

    if (snapshot) {
      this.loadSnapshot(snapshot);
      return;
    }

    for (const channel of channels) {
      if (channel.initial !== undefined) {
        this.values.set(channel.key.name, channel.initial);
        this.versions.set(channel.key.name, 1);
      } else {
        this.versions.set(channel.key.name, 0);
      }
    }
  }

  read<T>(channel: ChannelKey<T>): T | undefined {
    const value = this.values.get(channel.name);
    return value as T | undefined;
  }

  applyWrites(writes: GraphChannelWrite[]): void {
    for (const write of writes) {
      const reducer = this.reducers.get(write.channel.name);
      if (!reducer) {
        throw new Error(`Missing reducer for channel '${write.channel.name}'`);
      }
      const current = this.values.get(write.channel.name) as unknown | undefined;
      const nextValue = reducer(current, write.value as unknown);
      this.values.set(write.channel.name, nextValue);
      const version = (this.versions.get(write.channel.name) ?? 0) + 1;
      this.versions.set(write.channel.name, version);
    }
  }

  getVersion(channelName: string): number {
    return this.versions.get(channelName) ?? 0;
  }

  getSnapshot(): { channels: Record<string, unknown>; channelVersions: Record<string, number> } {
    const channels: Record<string, unknown> = {};
    const channelVersions: Record<string, number> = {};

    for (const [name, value] of this.values.entries()) {
      channels[name] = value;
    }

    for (const [name, version] of this.versions.entries()) {
      channelVersions[name] = version;
    }

    return { channels, channelVersions };
  }

  loadSnapshot(snapshot: GraphCheckpointSnapshot): void {
    this.values.clear();
    this.versions.clear();

    for (const [name, value] of Object.entries(snapshot.channels)) {
      this.values.set(name, value);
    }

    for (const [name, version] of Object.entries(snapshot.channelVersions)) {
      this.versions.set(name, version);
    }
  }
}

class GraphNodeContextImpl implements GraphNodeContext {
  private readonly writes: GraphChannelWrite[] = [];

  constructor(
    private readonly store: ChannelStore,
    private readonly emitter: GraphEventEmitter,
    public readonly signal: AbortSignal
  ) {}

  read<T>(channel: ChannelKey<T>): T | undefined {
    return this.store.read(channel);
  }

  write<T>(channel: ChannelKey<T>, value: T): void {
    this.writes.push({ channel, value });
  }

  emit<T>(type: string, payload: T): void {
    this.emitter.emit(type, payload);
  }

  flushWrites(): GraphChannelWrite[] {
    return [...this.writes];
  }
}

export class GraphRunner {
  private readonly graph: GraphDefinition;
  private readonly eventBus?: RuntimeEventBus;
  private readonly logger: RuntimeLogger;
  private readonly runId: string;
  private readonly maxIterations: number;
  private readonly cache: GraphNodeCache;
  private readonly eventSource: string;

  private store?: ChannelStore;
  private nodeStates = new Map<string, MutableGraphNodeState>();
  private iteration = 0;
  private checkpointManager?: ICheckpointManager;
  private checkpointId?: string;
  private checkpointResume = false;
  private activeSignal?: AbortSignal;

  constructor(private readonly config: GraphRunnerConfig) {
    this.graph = config.graph;
    this.eventBus = config.eventBus;
    this.logger = config.logger ?? getLogger();
    this.runId = config.runId ?? crypto.randomUUID();
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.cache = config.cache ?? createGraphNodeCache();
    this.eventSource = config.eventSource ?? "graph-runtime";
    this.checkpointManager = config.checkpoint?.manager;
    this.checkpointId = config.checkpoint?.checkpointId;
    this.checkpointResume = config.checkpoint?.resume ?? false;
  }

  async run(options: { signal?: AbortSignal } = {}): Promise<GraphRunResult> {
    const signal = options.signal ?? new AbortController().signal;
    this.activeSignal = signal;
    const snapshot = await this.initializeCheckpoint();

    this.store = new ChannelStore(this.graph.channels, snapshot ?? undefined);
    this.initializeNodeStates(snapshot ?? undefined);

    this.emitEvent("graph:run_started", {
      runId: this.runId,
      nodeCount: this.graph.nodes.length,
    });

    const outcome = await this.runLoop(signal);
    return this.finishRun(outcome.status, outcome.error);
  }

  private async runLoop(
    signal: AbortSignal
  ): Promise<{ status: GraphRunResult["status"]; error?: string }> {
    while (this.iteration < this.maxIterations) {
      const abort = this.checkAbort(signal);
      if (abort) {
        return abort;
      }

      const runnableNodes = this.getRunnableNodes();
      if (runnableNodes.length === 0) {
        return { status: "completed" };
      }

      const runResult = await this.executeNodes(runnableNodes, signal);
      if (runResult.status !== "ok") {
        return { status: runResult.status, error: runResult.error };
      }

      this.iteration += 1;
    }

    if (this.getRunnableNodes().length > 0) {
      return { status: "interrupted", error: "max iterations reached" };
    }

    return { status: "completed" };
  }

  private checkAbort(
    signal: AbortSignal
  ): { status: GraphRunResult["status"]; error?: string } | null {
    if (!signal.aborted) {
      return null;
    }
    return { status: "interrupted", error: signal.reason ?? "aborted" };
  }

  private async executeNodes(
    nodes: GraphNodeDefinition[],
    signal: AbortSignal
  ): Promise<{ status: "ok" | GraphRunResult["status"]; error?: string }> {
    for (const node of nodes) {
      const abort = this.checkAbort(signal);
      if (abort) {
        return abort;
      }

      const status = await this.executeNode(node, signal);
      if (status === "interrupted") {
        return { status: "interrupted", error: signal.reason ?? "aborted" };
      }
      if (status === "failed") {
        return {
          status: "failed",
          error: this.nodeStates.get(node.id)?.error ?? "node failed",
        };
      }
    }

    return { status: "ok" };
  }

  private getRunnableNodes(): GraphNodeDefinition[] {
    return this.graph.nodes.filter((node) => {
      const state = this.nodeStates.get(node.id);
      if (!state) {
        return false;
      }
      return this.shouldRunNode(node, state);
    });
  }

  private shouldRunNode(node: GraphNodeDefinition, state: MutableGraphNodeState): boolean {
    if (state.status === "running" || state.status === "failed") {
      return false;
    }

    if (node.reads.length === 0) {
      return state.attempts === 0;
    }

    for (const channel of node.reads) {
      const version = this.store?.getVersion(channel.name) ?? 0;
      const lastSeen = state.lastSeen[channel.name] ?? 0;
      if (version > lastSeen) {
        return true;
      }
    }

    return false;
  }

  private async executeNode(
    node: GraphNodeDefinition,
    signal: AbortSignal
  ): Promise<"ok" | "failed" | "interrupted"> {
    const state = this.nodeStates.get(node.id);
    if (!state || !this.store) {
      return "failed";
    }

    const inputSnapshot = this.buildInputSnapshot(node);
    const cached = this.getCachedWrites(node, inputSnapshot);
    if (cached) {
      this.applyCachedWrites(node, state, cached);
      await this.recordCheckpoint();
      return "ok";
    }

    return this.executeNodeWithRetries(node, state, inputSnapshot, signal);
  }

  private async executeNodeWithRetries(
    node: GraphNodeDefinition,
    state: MutableGraphNodeState,
    inputSnapshot: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<"ok" | "failed" | "interrupted"> {
    const retryPolicy = node.retryPolicy;
    let attempt = 0;

    while (true) {
      attempt += 1;
      const attemptResult = await this.runNodeAttempt(node, state, signal, attempt);

      if (attemptResult.status === "interrupted") {
        return "interrupted";
      }

      if (attemptResult.status === "ok") {
        await this.handleNodeSuccess(
          node,
          state,
          inputSnapshot,
          attemptResult.result,
          attemptResult.writes
        );
        return "ok";
      }

      if (!this.shouldRetry(retryPolicy, attempt)) {
        await this.handleNodeFailure(node, state, attemptResult.error);
        return "failed";
      }

      const slept = await this.waitForRetry(
        node,
        attempt,
        attemptResult.error,
        retryPolicy,
        signal
      );
      if (!slept) {
        state.status = "failed";
        state.error = "aborted";
        return "interrupted";
      }
    }
  }

  private async runNodeAttempt(
    node: GraphNodeDefinition,
    state: MutableGraphNodeState,
    signal: AbortSignal,
    attempt: number
  ): Promise<
    | { status: "ok"; result: GraphNodeResult; writes: GraphChannelWrite[] }
    | { status: "error"; error: string }
    | { status: "interrupted"; error: string }
  > {
    this.markNodeStarted(node, state, attempt);

    const context = new GraphNodeContextImpl(
      this.store as ChannelStore,
      { emit: this.emitEvent.bind(this) },
      signal
    );

    try {
      state.attempts += 1;
      const result = await node.run(context);
      if (signal.aborted) {
        const error = signal.reason ? String(signal.reason) : "aborted";
        state.error = error;
        return { status: "interrupted", error };
      }
      return { status: "ok", result, writes: context.flushWrites() };
    } catch (error) {
      const errorMessage = resolveErrorMessage(error);
      state.error = errorMessage;
      state.lastCompletedAt = Date.now();
      return { status: "error", error: errorMessage };
    }
  }

  private markNodeStarted(
    node: GraphNodeDefinition,
    state: MutableGraphNodeState,
    attempt: number
  ): void {
    state.status = "running";
    state.lastStartedAt = Date.now();
    this.emitEvent("graph:node_started", {
      runId: this.runId,
      nodeId: node.id,
      nodeName: node.name,
      attempt,
    });
  }

  private async handleNodeSuccess(
    node: GraphNodeDefinition,
    state: MutableGraphNodeState,
    inputSnapshot: Record<string, unknown>,
    result: GraphNodeResult,
    writes: GraphChannelWrite[]
  ): Promise<void> {
    this.store?.applyWrites(writes);
    this.updateLastSeen(state, node);
    state.status = result.status;
    state.lastCompletedAt = Date.now();
    state.error = undefined;

    this.emitEvent("graph:node_completed", {
      runId: this.runId,
      nodeId: node.id,
      nodeName: node.name,
      status: result.status,
    });

    this.storeCache(node, inputSnapshot, writes);
    await this.recordCheckpoint();
  }

  private async handleNodeFailure(
    node: GraphNodeDefinition,
    state: MutableGraphNodeState,
    errorMessage: string
  ): Promise<void> {
    state.status = "failed";
    state.lastCompletedAt = Date.now();
    state.error = errorMessage;
    this.emitEvent("graph:node_failed", {
      runId: this.runId,
      nodeId: node.id,
      nodeName: node.name,
      error: errorMessage,
    });
    await this.recordCheckpoint();
  }

  private async waitForRetry(
    node: GraphNodeDefinition,
    attempt: number,
    errorMessage: string,
    retryPolicy: RetryPolicy | undefined,
    signal: AbortSignal
  ): Promise<boolean> {
    const backoffMs = resolveBackoffMs(retryPolicy, attempt);
    this.emitEvent("graph:retry", {
      runId: this.runId,
      nodeId: node.id,
      nodeName: node.name,
      attempt,
      backoffMs,
      error: errorMessage,
    });

    return sleepWithSignal(backoffMs, signal);
  }

  private buildInputSnapshot(node: GraphNodeDefinition): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    for (const channel of node.reads) {
      inputs[channel.name] = this.store?.read(channel);
    }
    return inputs;
  }

  private getCachedWrites(
    node: GraphNodeDefinition,
    inputs: Record<string, unknown>
  ): GraphNodeCacheEntry | undefined {
    if (!node.cachePolicy) {
      return undefined;
    }

    const cacheKey = node.cachePolicy.getKey(inputs, this.getRunContext());
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return undefined;
    }
    return cached;
  }

  private applyCachedWrites(
    node: GraphNodeDefinition,
    state: MutableGraphNodeState,
    cached: GraphNodeCacheEntry
  ): void {
    if (!this.store) {
      return;
    }

    this.store.applyWrites(cached.writes);
    this.updateLastSeen(state, node);
    state.status = "skipped";
    state.lastCompletedAt = Date.now();

    this.emitEvent("graph:cache_hit", {
      runId: this.runId,
      nodeId: node.id,
      nodeName: node.name,
    });
  }

  private storeCache(
    node: GraphNodeDefinition,
    inputs: Record<string, unknown>,
    writes: GraphChannelWrite[]
  ): void {
    if (!node.cachePolicy) {
      return;
    }

    const cacheKey = node.cachePolicy.getKey(inputs, this.getRunContext());
    const entry: GraphNodeCacheEntry = {
      writes,
      storedAt: Date.now(),
      ttlMs: node.cachePolicy.ttlMs,
    };
    this.cache.set(cacheKey, entry);
  }

  private updateLastSeen(state: MutableGraphNodeState, node: GraphNodeDefinition): void {
    if (!this.store) {
      return;
    }
    for (const channel of node.reads) {
      state.lastSeen[channel.name] = this.store.getVersion(channel.name);
    }
  }

  private initializeNodeStates(snapshot?: GraphCheckpointSnapshot): void {
    this.nodeStates.clear();
    const snapshotStates = new Map(snapshot?.nodeStates.map((state) => [state.id, state]) ?? []);

    for (const node of this.graph.nodes) {
      const existing = snapshotStates.get(node.id);
      this.nodeStates.set(node.id, {
        id: node.id,
        status: existing?.status ?? "pending",
        attempts: existing?.attempts ?? 0,
        lastSeen: { ...(existing?.lastSeen ?? {}) },
        lastStartedAt: existing?.lastStartedAt,
        lastCompletedAt: existing?.lastCompletedAt,
        error: existing?.error,
      });
    }

    if (snapshot) {
      this.iteration = snapshot.iteration;
    }
  }

  private async initializeCheckpoint(): Promise<GraphCheckpointSnapshot | undefined> {
    if (!this.config.checkpoint || !this.checkpointManager) {
      return undefined;
    }

    if (!this.checkpointId && this.config.checkpoint.create) {
      const created = await this.checkpointManager.create(this.config.checkpoint.create);
      this.checkpointId = created.id;
    }

    if (this.checkpointResume && this.checkpointId) {
      const checkpoint = await this.checkpointManager.load(this.checkpointId);
      const snapshot = checkpoint?.metadata?.graph;
      if (snapshot && isGraphCheckpointSnapshot(snapshot)) {
        return snapshot;
      }
    }

    return undefined;
  }

  private async recordCheckpoint(): Promise<void> {
    if (!this.checkpointManager || !this.checkpointId || !this.store) {
      return;
    }

    const snapshot: GraphCheckpointSnapshot = {
      ...this.store.getSnapshot(),
      nodeStates: Array.from(this.nodeStates.values()).map((state) => ({
        id: state.id,
        status: state.status,
        attempts: state.attempts,
        lastSeen: { ...state.lastSeen },
        lastStartedAt: state.lastStartedAt,
        lastCompletedAt: state.lastCompletedAt,
        error: state.error,
      })),
      iteration: this.iteration,
    };

    await this.checkpointManager.updateMetadata(this.checkpointId, { graph: snapshot });
    await this.checkpointManager.advanceStep(this.checkpointId);
  }

  private async finishRun(
    status: GraphRunResult["status"],
    error?: string
  ): Promise<GraphRunResult> {
    const result: GraphRunResult = {
      status,
      channels: this.store?.getSnapshot().channels ?? {},
      nodeStates: Array.from(this.nodeStates.values()),
      iterations: this.iteration,
      checkpointId: this.checkpointId,
      error,
    };

    if (this.checkpointManager && this.checkpointId) {
      const checkpointStatus =
        status === "completed" ? "completed" : status === "failed" ? "failed" : "cancelled";
      await this.checkpointManager.updateStatus(
        this.checkpointId,
        checkpointStatus,
        error ? { message: error } : undefined
      );
    }

    this.emitEvent("graph:run_completed", {
      runId: this.runId,
      status,
      iterations: this.iteration,
    });

    if (error) {
      this.logger.warn(`Graph run ${this.runId} ended with ${status}: ${error}`);
    } else {
      this.logger.info(`Graph run ${this.runId} completed with status ${status}`);
    }

    return result;
  }

  private shouldRetry(policy: RetryPolicy | undefined, attempt: number): boolean {
    if (!policy) {
      return false;
    }
    return attempt <= policy.maxRetries;
  }

  private getRunContext() {
    return { runId: this.runId, signal: this.activeSignal ?? new AbortController().signal };
  }

  private emitEvent<T>(type: string, payload: T): void {
    this.eventBus?.emitRaw(type, payload, {
      source: this.eventSource,
      correlationId: this.runId,
    });
  }
}

function resolveBackoffMs(policy: RetryPolicy | undefined, attempt: number): number {
  if (!policy) {
    return DEFAULT_BACKOFF_MS;
  }
  const initial = policy.initialDelayMs ?? DEFAULT_BACKOFF_MS;
  const multiplier = policy.multiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
  const maxDelay = policy.maxDelayMs ?? DEFAULT_MAX_BACKOFF_MS;
  const delay = initial * multiplier ** Math.max(0, attempt - 1);
  return Math.min(delay, maxDelay);
}

async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<boolean> {
  if (ms <= 0) {
    return !signal.aborted;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(true);
    }, ms);

    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      resolve(false);
    };

    if (signal.aborted) {
      cleanup();
      resolve(false);
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isGraphCheckpointSnapshot(snapshot: unknown): snapshot is GraphCheckpointSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const value = snapshot as GraphCheckpointSnapshot;
  return (
    typeof value.iteration === "number" &&
    typeof value.channels === "object" &&
    typeof value.channelVersions === "object" &&
    Array.isArray(value.nodeStates)
  );
}
