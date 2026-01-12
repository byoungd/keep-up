/**
 * Kernel Interfaces
 *
 * Defines the boundary between control-plane orchestration and data-plane services.
 */

import { getGlobalEventBus } from "../events/eventBus";
import type { RuntimeEvent, RuntimeEventBus } from "../events/eventBus";
import { createToolExecutor } from "../executor";
import type { ToolExecutor } from "../executor";
import { createOrchestrator } from "../orchestrator";
import type {
  AgentOrchestrator,
  CreateOrchestratorOptions,
  IAgentLLM,
  OrchestratorEvent,
} from "../orchestrator";
import type { IPermissionChecker } from "../security";
import { createSessionState } from "../session";
import type { SessionState } from "../session";
import type { TelemetryContext } from "../telemetry";
import type { IToolRegistry } from "../tools/mcp/registry";
import type { AgentState, AuditLogger, ConfirmationHandler } from "../types";

export type LLMClient = IAgentLLM;

export interface Clock {
  now(): number;
}

export interface IdGenerator {
  next(): string;
}

export interface RuntimeServices {
  llm: LLMClient;
  registry: IToolRegistry;
  executor?: ToolExecutor;
  policy: IPermissionChecker;
  events?: RuntimeEventBus;
  state?: SessionState;
  audit?: AuditLogger;
  telemetry?: TelemetryContext;
  clock?: Clock;
  ids?: IdGenerator;
}

export interface KernelRunOptions {
  signal?: AbortSignal;
  confirmationHandler?: ConfirmationHandler;
}

export interface Kernel {
  run(input: string, options?: KernelRunOptions): Promise<AgentState>;
  runStream(input: string, options?: KernelRunOptions): AsyncIterable<RuntimeEvent>;
}

export interface KernelConfig {
  orchestrator?: CreateOrchestratorOptions;
}

export class RuntimeKernel implements Kernel {
  private readonly services: RuntimeServices;
  private readonly orchestrator: AgentOrchestrator;
  private readonly executor: ToolExecutor;
  private readonly eventBus: RuntimeEventBus;
  private readonly sessionState: SessionState;

  constructor(
    services: RuntimeServices,
    private readonly config: KernelConfig = {}
  ) {
    this.services = services;
    this.eventBus = services.events ?? getGlobalEventBus();
    this.sessionState = services.state ?? createSessionState();
    this.executor =
      services.executor ??
      createToolExecutor({
        registry: services.registry,
        policy: services.policy,
        audit: services.audit,
        telemetry: services.telemetry,
      });
    this.orchestrator = createOrchestrator(
      this.services.llm,
      this.services.registry,
      this.resolveOrchestratorOptions()
    );
  }

  async run(input: string, options?: KernelRunOptions): Promise<AgentState> {
    if (options?.confirmationHandler) {
      this.orchestrator.setConfirmationHandler(options.confirmationHandler);
    }
    return this.orchestrator.run(input);
  }

  async *runStream(input: string, options?: KernelRunOptions): AsyncIterable<RuntimeEvent> {
    if (options?.confirmationHandler) {
      this.orchestrator.setConfirmationHandler(options.confirmationHandler);
    }
    for await (const event of this.orchestrator.runStream(input)) {
      yield this.wrapOrchestratorEvent(event);
    }
  }

  private resolveOrchestratorOptions(): CreateOrchestratorOptions {
    if (!this.config.orchestrator) {
      return {
        telemetry: this.services.telemetry,
        components: {
          toolExecutor: this.executor,
          eventBus: this.eventBus,
          sessionState: this.sessionState,
        },
      };
    }
    return {
      ...this.config.orchestrator,
      telemetry: this.services.telemetry ?? this.config.orchestrator.telemetry,
      components: {
        ...this.config.orchestrator.components,
        toolExecutor: this.executor,
        eventBus: this.eventBus,
        sessionState: this.sessionState,
      },
    };
  }

  private wrapOrchestratorEvent(event: OrchestratorEvent): RuntimeEvent<OrchestratorEvent> {
    return {
      type: `orchestrator:${event.type}`,
      payload: event,
      meta: {
        id: this.services.ids?.next() ?? this.generateEventId(),
        timestamp: this.services.clock?.now() ?? Date.now(),
        source: "kernel",
        correlationId: undefined,
        priority: "normal",
      },
    };
  }

  private generateEventId(): string {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function createKernel(services: RuntimeServices, config?: KernelConfig): Kernel {
  return new RuntimeKernel(services, config);
}
