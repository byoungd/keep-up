import type {
  WorkforceAssignment,
  WorkforceChannelMessage,
  WorkforceEvent,
  WorkforcePlanInput,
  WorkforceResultEnvelope,
  WorkforceRuntimeConfig,
  WorkforceSnapshot,
  WorkforceTaskNode,
  WorkforceWorkerProfile,
  WorkforceWorkerRegistration,
} from "@ku0/agent-runtime-core";
import {
  getNativeAgentWorkforce,
  getNativeAgentWorkforceError,
  type NativeAgentWorkforceBinding,
  type WorkforceOrchestratorBinding,
} from "@ku0/agent-workforce-rs/node";

let cachedBinding: NativeAgentWorkforceBinding | null | undefined;

function resolveBinding(): NativeAgentWorkforceBinding {
  if (cachedBinding !== undefined) {
    if (!cachedBinding) {
      throw new Error("Agent workforce native binding unavailable.");
    }
    return cachedBinding;
  }

  const binding = getNativeAgentWorkforce();
  if (!binding) {
    const error = getNativeAgentWorkforceError();
    cachedBinding = null;
    const detail = error ? ` ${error.message}` : "";
    throw new Error(`Agent workforce native binding unavailable.${detail}`);
  }

  cachedBinding = binding;
  return binding;
}

export class WorkforceOrchestrator {
  private readonly native: WorkforceOrchestratorBinding;

  constructor(config?: WorkforceRuntimeConfig) {
    const binding = resolveBinding();
    this.native = new binding.WorkforceOrchestrator(config);
  }

  loadPlan(plan: WorkforcePlanInput): void {
    this.native.loadPlan(plan);
  }

  registerWorker(worker: WorkforceWorkerRegistration): void {
    this.native.registerWorker(worker);
  }

  registerWorkers(workers: WorkforceWorkerRegistration[]): void {
    this.native.registerWorkers(workers);
  }

  schedule(nowMs?: number): WorkforceAssignment[] {
    return this.native.schedule(nowMs);
  }

  submitResult(result: WorkforceResultEnvelope, nowMs?: number): void {
    this.native.submitResult(result, nowMs);
  }

  cancelTask(taskId: string, reason?: string): void {
    this.native.cancelTask(taskId, reason);
  }

  listTasks(): WorkforceTaskNode[] {
    return this.native.listTasks();
  }

  listWorkers(): WorkforceWorkerProfile[] {
    return this.native.listWorkers();
  }

  drainEvents(after?: number, limit?: number): WorkforceEvent[] {
    return this.native.drainEvents(after, limit);
  }

  listChannelMessages(after?: number, limit?: number): WorkforceChannelMessage[] {
    return this.native.listChannelMessages(after, limit);
  }

  getSnapshot(): WorkforceSnapshot {
    return this.native.getSnapshot();
  }

  reset(): void {
    this.native.reset();
  }
}
