/**
 * Graph Runtime Types
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { CheckpointCreateParams, ICheckpointManager } from "@ku0/agent-runtime-core";
import type { RuntimeLogger } from "../utils/logger";

export type ChannelReducer<T> = (current: T | undefined, update: T) => T;

export interface ChannelKey<_T> {
  readonly name: string;
}

export interface ChannelDefinition<T> {
  readonly key: ChannelKey<T>;
  readonly reducer: ChannelReducer<T>;
  readonly initial?: T;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly multiplier?: number;
}

export interface GraphNodeCachePolicy {
  readonly getKey: (inputs: Record<string, unknown>, context: GraphRunContext) => string;
  readonly ttlMs?: number;
}

export interface GraphNodeContext {
  read<T>(channel: ChannelKey<T>): T | undefined;
  write<T>(channel: ChannelKey<T>, value: T): void;
  emit<T>(type: string, payload: T): void;
  readonly signal: AbortSignal;
}

export interface GraphNodeResult {
  readonly status: "completed" | "skipped";
}

export interface GraphNodeDefinition {
  readonly id: string;
  readonly name: string;
  readonly reads: readonly ChannelKey<unknown>[];
  readonly writes: readonly ChannelKey<unknown>[];
  readonly run: (context: GraphNodeContext) => Promise<GraphNodeResult>;
  readonly retryPolicy?: RetryPolicy;
  readonly cachePolicy?: GraphNodeCachePolicy;
}

export type GraphNodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface GraphNodeState {
  readonly id: string;
  readonly status: GraphNodeStatus;
  readonly attempts: number;
  readonly lastSeen: Record<string, number>;
  readonly lastStartedAt?: number;
  readonly lastCompletedAt?: number;
  readonly error?: string;
}

export interface GraphDefinition {
  readonly channels: readonly ChannelDefinition<unknown>[];
  readonly nodes: readonly GraphNodeDefinition[];
}

export interface GraphCheckpointSnapshot {
  readonly channels: Record<string, unknown>;
  readonly channelVersions: Record<string, number>;
  readonly nodeStates: GraphNodeState[];
  readonly iteration: number;
}

export interface GraphRunContext {
  readonly runId: string;
  readonly signal: AbortSignal;
}

export interface GraphRunResult {
  readonly status: "completed" | "interrupted" | "failed";
  readonly channels: Record<string, unknown>;
  readonly nodeStates: GraphNodeState[];
  readonly iterations: number;
  readonly checkpointId?: string;
  readonly error?: string;
}

export interface GraphCheckpointOptions {
  readonly manager: ICheckpointManager;
  readonly checkpointId?: string;
  readonly create?: CheckpointCreateParams;
  readonly resume?: boolean;
}

export interface GraphRunnerConfig {
  readonly graph: GraphDefinition;
  readonly runId?: string;
  readonly eventBus?: RuntimeEventBus;
  readonly logger?: RuntimeLogger;
  readonly maxIterations?: number;
  readonly checkpoint?: GraphCheckpointOptions;
  readonly cache?: GraphNodeCache;
  readonly eventSource?: string;
}

export interface GraphNodeCacheEntry {
  readonly writes: GraphChannelWrite[];
  readonly storedAt: number;
  readonly ttlMs?: number;
}

export interface GraphNodeCache {
  get(key: string): GraphNodeCacheEntry | undefined;
  set(key: string, entry: GraphNodeCacheEntry): void;
}

export interface GraphChannelWrite {
  readonly channel: ChannelKey<unknown>;
  readonly value: unknown;
}
