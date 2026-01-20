import type { ExecutionQueueClass, ExecutionTaskStatus } from "../types";

export type ExecutionRejectionReason =
  | "queue_full"
  | "backpressure"
  | "quota_exceeded"
  | "handler_missing";

export type ExecutionCancelReason = "user_cancelled" | "timeout" | "lease_expired" | "shutdown";

export interface ExecutionTaskDefinition<TPayload = unknown> {
  type: string;
  payload: TPayload;
  name?: string;
  queueClass?: ExecutionQueueClass;
  metadata?: Record<string, unknown>;
  modelId?: string;
  toolName?: string;
}

export interface ExecutionTask<TPayload = unknown, TResult = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  name?: string;
  queueClass: ExecutionQueueClass;
  status: ExecutionTaskStatus;
  attempt: number;
  createdAt: number;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  workerId?: string;
  result?: TResult;
  error?: string;
  metadata?: Record<string, unknown>;
  modelId?: string;
  toolName?: string;
}

export interface ExecutionTaskContext {
  taskId: string;
  attempt: number;
  signal: AbortSignal;
  metadata: Record<string, unknown>;
}

export interface ExecutionTaskCleanupContext {
  taskId: string;
  attempt: number;
  metadata: Record<string, unknown>;
}

export interface ExecutionTaskHandler<TPayload = unknown, TResult = unknown> {
  execute(payload: TPayload, context: ExecutionTaskContext): Promise<TResult>;
  cleanup?: (context: ExecutionTaskCleanupContext) => Promise<void> | void;
}

export interface ExecutionTaskReceipt {
  taskId: string;
  accepted: boolean;
  status: ExecutionTaskStatus;
  reason?: ExecutionRejectionReason;
}

export interface ExecutionTaskFilter {
  status?: ExecutionTaskStatus | ExecutionTaskStatus[];
  type?: string | string[];
  queueClass?: ExecutionQueueClass | ExecutionQueueClass[];
  limit?: number;
}
