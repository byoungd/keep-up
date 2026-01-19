/**
 * Cowork Runtime
 *
 * Bundles TaskQueue, CoworkTaskRunner, and Cowork orchestration helpers.
 */

import type { IToolRegistry } from "@ku0/agent-runtime-tools";
import type { AgentOrchestrator, IAgentLLM } from "../orchestrator/orchestrator";
import { createAuditLogger } from "../security";
import { createTaskQueue } from "../tasks";
import type { ITaskQueue, TaskQueueConfig } from "../tasks/types";
import type { AuditLogger } from "../types";
import type { CoworkTaskEventHandler } from "./events";
import {
  type CoworkRuntimeConfig,
  type CreateCoworkOrchestratorOptions,
  createCoworkOrchestrator,
} from "./factory";
import {
  type CoworkAgentTaskResult,
  CoworkTaskRunner,
  type CoworkTaskRunnerConfig,
} from "./taskRunner";
import type { CoworkTaskSummary } from "./types";
import type { IVmProvider } from "./vm";

export interface CoworkRuntimeOptions {
  llm?: IAgentLLM;
  registry?: IToolRegistry;
  cowork?: CoworkRuntimeConfig;
  orchestratorOptions?: Omit<CreateCoworkOrchestratorOptions, "cowork" | "toolExecution">;
  orchestrator?: AgentOrchestrator;
  taskQueue?: ITaskQueue;
  taskQueueConfig?: Partial<TaskQueueConfig>;
  auditLogger?: AuditLogger;
  outputRoots?: string[];
  caseInsensitivePaths?: boolean;
  /** Optional VM provider for sandboxed execution */
  vmProvider?: IVmProvider;
  /**
   * Additional system prompt content to inject (e.g., AGENTS.md project context).
   * Will be appended to the base system prompt.
   */
  systemPromptAddition?: string;
}

export class CoworkRuntime {
  readonly queue: ITaskQueue;
  readonly orchestrator: AgentOrchestrator;
  readonly auditLogger: AuditLogger;
  readonly runner: CoworkTaskRunner;

  constructor(options: CoworkRuntimeOptions) {
    this.auditLogger = options.auditLogger ?? createAuditLogger();
    this.queue = options.taskQueue ?? createTaskQueue(options.taskQueueConfig);

    if (options.orchestrator) {
      this.orchestrator = options.orchestrator;
    } else {
      if (!options.llm || !options.registry || !options.cowork) {
        throw new Error("CoworkRuntime requires llm, registry, and cowork config");
      }

      this.orchestrator = createCoworkOrchestrator(options.llm, options.registry, {
        ...options.orchestratorOptions,
        systemPrompt: buildSystemPrompt(
          options.orchestratorOptions?.systemPrompt,
          options.systemPromptAddition
        ),
        cowork: {
          ...options.cowork,
          audit: options.cowork.audit ?? this.auditLogger,
        },
        toolExecution: {
          audit: this.auditLogger,
        },
      });
    }

    this.runner = new CoworkTaskRunner({
      queue: this.queue,
      orchestrator: this.orchestrator,
      auditLogger: this.auditLogger,
      outputRoots: options.outputRoots,
      caseInsensitivePaths: options.caseInsensitivePaths,
    } satisfies CoworkTaskRunnerConfig);
  }

  async enqueueTask(prompt: string, name?: string): Promise<string> {
    return this.runner.enqueueTask(prompt, name);
  }

  onCoworkEvents(handler: CoworkTaskEventHandler) {
    return this.runner.onCoworkEvents(handler);
  }

  async waitForTask(taskId: string): Promise<CoworkAgentTaskResult | undefined> {
    const result = await this.queue.waitFor<CoworkAgentTaskResult>(taskId);
    return result.value;
  }

  getTaskSummary(taskId: string): CoworkTaskSummary | undefined {
    const task = this.queue.getTask<unknown, CoworkAgentTaskResult>(taskId);
    return task?.result?.summary;
  }
}

export function createCoworkRuntime(options: CoworkRuntimeOptions): CoworkRuntime {
  return new CoworkRuntime(options);
}

/**
 * Build the combined system prompt from base and additional context
 */
function buildSystemPrompt(base?: string, addition?: string): string | undefined {
  if (!base && !addition) {
    return undefined;
  }
  if (!addition) {
    return base;
  }
  if (!base) {
    return addition;
  }
  return `${base}\n\n---\n\n${addition}`;
}
