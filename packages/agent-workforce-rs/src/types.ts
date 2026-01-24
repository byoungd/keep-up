export type WorkforceFailurePolicy = {
  retryCount: number;
  backoffMs: number;
  escalateAfter: number;
};

export type WorkforceRuntimeConfig = {
  runId?: string;
  eventVersion?: number;
  failurePolicy?: WorkforceFailurePolicy;
};

export type WorkforceTaskInput = {
  taskId: string;
  title: string;
  requiredCapabilities?: string[];
  dependsOn?: string[];
  priority?: number;
  metadata?: Record<string, unknown>;
};

export type WorkforcePlanInput = {
  planId: string;
  goal?: string;
  tasks: WorkforceTaskInput[];
};

export type WorkforceWorkerRegistration = {
  workerId: string;
  capabilities: string[];
  capacity: number;
  state?: "idle" | "busy" | "draining";
};

export type WorkforceTaskStatus =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled";

export type WorkforceTaskNode = {
  taskId: string;
  title: string;
  status: WorkforceTaskStatus;
  dependsOn: string[];
  requiredCapabilities: string[];
  attempt: number;
  priority: number;
  assignedWorkerId?: string;
  blockedUntil?: number;
  blockedReason?: "dependencies" | "backoff" | "escalated";
  metadata?: Record<string, unknown>;
  result?: unknown;
  error?: string;
};

export type WorkforceWorkerProfile = {
  workerId: string;
  capabilities: string[];
  capacity: number;
  activeCount: number;
  state: "idle" | "busy" | "draining";
};

export type WorkforceAssignment = {
  taskId: string;
  workerId: string;
};

export type WorkforceResultEnvelope = {
  taskId: string;
  workerId: string;
  status: "completed" | "failed" | "canceled";
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type WorkforceEventType =
  | "plan_created"
  | "task_queued"
  | "task_assigned"
  | "task_started"
  | "task_blocked"
  | "task_completed"
  | "task_failed"
  | "task_canceled"
  | "task_retry_scheduled"
  | "task_escalated"
  | "task_dead_lettered"
  | "worker_registered"
  | "result_published"
  | "scheduler_tick";

export type WorkforceEvent = {
  sequence: number;
  eventVersion: number;
  runId: string;
  type: WorkforceEventType;
  taskId?: string;
  workerId?: string;
  logicalTime?: number;
  payload?: Record<string, unknown>;
};

export type WorkforceChannelMessage = {
  sequence: number;
  type: "task" | "result";
  taskId: string;
  payload: unknown;
};

export type WorkforceSnapshot = {
  runId: string;
  planId?: string;
  goal?: string;
  tasks: WorkforceTaskNode[];
  workers: WorkforceWorkerProfile[];
  eventCursor: number;
  channelCursor: number;
};

export type WorkforceOrchestratorBinding = {
  loadPlan: (plan: WorkforcePlanInput) => void;
  registerWorker: (worker: WorkforceWorkerRegistration) => void;
  registerWorkers: (workers: WorkforceWorkerRegistration[]) => void;
  schedule: (nowMs?: number) => WorkforceAssignment[];
  submitResult: (result: WorkforceResultEnvelope, nowMs?: number) => void;
  cancelTask: (taskId: string, reason?: string) => void;
  listTasks: () => WorkforceTaskNode[];
  listWorkers: () => WorkforceWorkerProfile[];
  drainEvents: (after?: number, limit?: number) => WorkforceEvent[];
  listChannelMessages: (after?: number, limit?: number) => WorkforceChannelMessage[];
  getSnapshot: () => WorkforceSnapshot;
  reset: () => void;
};

export type NativeAgentWorkforceBinding = {
  WorkforceOrchestrator: new (config?: WorkforceRuntimeConfig) => WorkforceOrchestratorBinding;
};
