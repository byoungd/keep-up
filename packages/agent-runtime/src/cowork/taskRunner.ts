/**
 * Cowork Task Runner
 *
 * Bridges TaskQueue execution to orchestrator runs and Cowork summaries.
 */

import type { AgentOrchestrator } from "../orchestrator/orchestrator";
import type { ITaskExecutor, ITaskQueue, TaskExecutionContext } from "../tasks/types";
import type { AgentState, AuditLogger } from "../types";
import { type CoworkTaskEventHandler, attachCoworkTaskEvents } from "./events";
import { buildCoworkTaskSummary } from "./summary";
import type { CoworkTaskSummary } from "./types";

export interface CoworkAgentTaskPayload {
  prompt: string;
  outputRoots?: string[];
}

export interface CoworkAgentTaskResult {
  state: AgentState;
  summary?: CoworkTaskSummary;
  runId: string;
}

export interface CoworkTaskRunnerConfig {
  queue: ITaskQueue;
  orchestrator: AgentOrchestrator;
  auditLogger?: AuditLogger;
  outputRoots?: string[];
  caseInsensitivePaths?: boolean;
}

export class CoworkTaskRunner {
  private readonly queue: ITaskQueue;
  private readonly orchestrator: AgentOrchestrator;
  private readonly auditLogger?: AuditLogger;
  private readonly outputRoots?: string[];
  private readonly caseInsensitivePaths?: boolean;

  constructor(config: CoworkTaskRunnerConfig) {
    this.queue = config.queue;
    this.orchestrator = config.orchestrator;
    this.auditLogger = config.auditLogger;
    this.outputRoots = config.outputRoots;
    this.caseInsensitivePaths = config.caseInsensitivePaths;

    this.queue.registerExecutor("agent", new CoworkAgentTaskExecutor(this));
  }

  async enqueueTask(prompt: string, name = "Cowork Task"): Promise<string> {
    return this.queue.enqueue({
      type: "agent",
      name,
      payload: { prompt, outputRoots: this.outputRoots },
    });
  }

  onCoworkEvents(handler: CoworkTaskEventHandler): () => void {
    return attachCoworkTaskEvents(this.queue, handler);
  }

  async executeTask(
    payload: CoworkAgentTaskPayload,
    context: TaskExecutionContext
  ): Promise<CoworkAgentTaskResult> {
    if (context.isCancelled()) {
      throw new Error("Task cancelled");
    }

    const runId = context.taskId;
    const state = await this.orchestrator.runWithRunId(payload.prompt, runId);

    const summary = this.auditLogger
      ? buildCoworkTaskSummary({
          taskId: runId,
          auditEntries: this.auditLogger.getEntries({ correlationId: runId }),
          outputRoots: payload.outputRoots ?? this.outputRoots,
          caseInsensitivePaths: this.caseInsensitivePaths,
        })
      : undefined;

    return { state, summary, runId };
  }
}

class CoworkAgentTaskExecutor
  implements ITaskExecutor<CoworkAgentTaskPayload, CoworkAgentTaskResult>
{
  private readonly runner: CoworkTaskRunner;

  constructor(runner: CoworkTaskRunner) {
    this.runner = runner;
  }

  canHandle(type: string): boolean {
    return type === "agent";
  }

  async execute(payload: CoworkAgentTaskPayload, context: TaskExecutionContext) {
    return this.runner.executeTask(payload, context);
  }
}
