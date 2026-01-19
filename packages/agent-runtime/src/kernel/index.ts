/**
 * Kernel Interfaces
 *
 * Defines the boundary between control-plane orchestration and data-plane services.
 */

import type { RuntimeEvent, RuntimeEventBus } from "@ku0/agent-runtime-control";
import { getGlobalEventBus } from "@ku0/agent-runtime-control";
import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import type {
  ArtifactEmissionContext,
  ArtifactEmissionResult,
  ArtifactPipeline,
} from "../artifacts";
import type {
  ToolConfirmationDetailsProvider,
  ToolConfirmationResolver,
  ToolExecutor,
} from "../executor";
import { createToolExecutor } from "../executor";
import type {
  AgentOrchestrator,
  CreateOrchestratorOptions,
  IAgentLLM,
  OrchestratorEvent,
} from "../orchestrator";
import { createOrchestrator } from "../orchestrator";
import type { IPermissionChecker, ToolPolicyEngine } from "../security";
import {
  createSecurityPolicy,
  createToolGovernancePolicyEngine,
  createToolPolicyEngine,
  resolveToolExecutionContext,
} from "../security";
import type { SessionState } from "../session";
import { createSessionState } from "../session";
import type { SkillPromptAdapter, SkillRegistry, SkillSession } from "../skills";
import { createSkillPolicyGuard, createSkillPromptAdapter, createSkillSession } from "../skills";
import { errorResult } from "../tools/mcp/baseServer";
import type { IToolRegistry } from "../tools/mcp/registry";
import type {
  AgentState,
  AuditLogger,
  ConfirmationHandler,
  MCPTool,
  MCPToolCall,
  ToolContext,
} from "../types";

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
  emitArtifact(
    artifact: Parameters<ArtifactPipeline["emit"]>[0],
    context?: ArtifactEmissionContext
  ): ArtifactEmissionResult;
}

export interface KernelConfig {
  orchestrator?: CreateOrchestratorOptions;
  skills?: {
    registry: SkillRegistry;
    session?: SkillSession;
    promptAdapter?: SkillPromptAdapter;
  };
}

export class RuntimeKernel implements Kernel {
  private readonly services: RuntimeServices;
  private readonly orchestrator: AgentOrchestrator;
  private readonly executor: ToolExecutor;
  private readonly eventBus: RuntimeEventBus;
  private readonly sessionState: SessionState;
  private readonly skillRegistry?: SkillRegistry;
  private readonly skillSession?: SkillSession;
  private readonly skillPromptAdapter?: SkillPromptAdapter;

  constructor(
    services: RuntimeServices,
    private readonly config: KernelConfig = {}
  ) {
    this.services = services;
    this.eventBus = services.events ?? getGlobalEventBus();
    this.sessionState = services.state ?? createSessionState();
    const skillOptions = this.resolveSkillOptions();
    this.skillRegistry = skillOptions?.registry;
    this.skillSession =
      skillOptions?.session ??
      (this.skillRegistry ? createSkillSession(this.skillRegistry, services.audit) : undefined);
    this.skillPromptAdapter =
      skillOptions?.promptAdapter ?? (this.skillRegistry ? createSkillPromptAdapter() : undefined);

    const basePolicyEngine = createToolPolicyEngine(services.policy);
    const skillPolicyEngine = this.skillRegistry
      ? createSkillPolicyGuard(basePolicyEngine, this.skillRegistry)
      : basePolicyEngine;
    const securityPolicy =
      typeof services.policy.getPolicy === "function"
        ? services.policy.getPolicy()
        : createSecurityPolicy("balanced");
    const toolExecutionContext = resolveToolExecutionContext(
      this.config.orchestrator?.toolExecutionContext,
      securityPolicy
    );
    const policyEngine = createToolGovernancePolicyEngine(skillPolicyEngine, toolExecutionContext);
    const defaultExecutor = createToolExecutor({
      registry: services.registry,
      policy: services.policy,
      policyEngine,
      audit: services.audit,
      telemetry: services.telemetry,
    });
    const rawExecutor = services.executor ?? defaultExecutor;
    this.executor =
      this.skillRegistry && services.executor
        ? new GuardedToolExecutor(rawExecutor, policyEngine, services.registry)
        : rawExecutor;
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

  emitArtifact(
    artifact: Parameters<ArtifactPipeline["emit"]>[0],
    context?: ArtifactEmissionContext
  ): ArtifactEmissionResult {
    return this.orchestrator.emitArtifact(artifact, context);
  }

  private resolveOrchestratorOptions(): CreateOrchestratorOptions {
    const skillOptions = this.resolveSkillOptions();

    if (!this.config.orchestrator) {
      return {
        telemetry: this.services.telemetry,
        skills: skillOptions,
        components: {
          toolExecutor: this.executor,
          eventBus: this.eventBus,
          sessionState: this.sessionState,
          skillRegistry: this.skillRegistry,
          skillSession: this.skillSession,
          skillPromptAdapter: this.skillPromptAdapter,
        },
      };
    }
    return {
      ...this.config.orchestrator,
      telemetry: this.services.telemetry ?? this.config.orchestrator.telemetry,
      skills: this.config.orchestrator.skills ?? skillOptions,
      components: {
        ...this.config.orchestrator.components,
        toolExecutor: this.executor,
        eventBus: this.eventBus,
        sessionState: this.sessionState,
        skillRegistry: this.config.orchestrator.components?.skillRegistry ?? this.skillRegistry,
        skillSession: this.config.orchestrator.components?.skillSession ?? this.skillSession,
        skillPromptAdapter:
          this.config.orchestrator.components?.skillPromptAdapter ?? this.skillPromptAdapter,
      },
    };
  }

  private resolveSkillOptions(): CreateOrchestratorOptions["skills"] | undefined {
    // Prefer explicit orchestrator skills config, fall back to kernel skills config
    const orchestratorSkills = this.config.orchestrator?.skills;
    if (orchestratorSkills) {
      return orchestratorSkills;
    }
    // Convert kernel skills config to orchestrator skills config format
    return this.config.skills;
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

class GuardedToolExecutor
  implements ToolExecutor, ToolConfirmationResolver, ToolConfirmationDetailsProvider
{
  private toolCache = new Map<string, MCPTool>();

  constructor(
    private readonly executor: ToolExecutor,
    private readonly policyEngine: ToolPolicyEngine,
    private readonly registry: IToolRegistry
  ) {}

  async execute(call: MCPToolCall, context: ToolContext) {
    const decision = this.evaluate(call, context);
    if (!decision.allowed) {
      return errorResult(
        "PERMISSION_DENIED",
        decision.reason ?? "Permission denied",
        decision.riskTags ? { riskTags: decision.riskTags } : undefined
      );
    }
    return this.executor.execute(call, context);
  }

  requiresConfirmation(call: MCPToolCall, context: ToolContext): boolean {
    return this.getConfirmationDetails(call, context).requiresConfirmation;
  }

  getConfirmationDetails(call: MCPToolCall, context: ToolContext) {
    const decision = this.evaluate(call, context);
    if (!decision.allowed) {
      return {
        requiresConfirmation: false,
        reason: decision.reason,
        riskTags: decision.riskTags,
      };
    }

    const baseDetails = this.getBaseConfirmationDetails(call, context);
    const riskTags = mergeRiskTags(decision.riskTags, baseDetails.riskTags);

    return {
      requiresConfirmation: decision.requiresConfirmation || baseDetails.requiresConfirmation,
      reason: baseDetails.reason ?? decision.reason,
      riskTags,
    };
  }

  private getBaseConfirmationDetails(
    call: MCPToolCall,
    context: ToolContext
  ): { requiresConfirmation: boolean; reason?: string; riskTags?: string[] } {
    const provider = this.executor as ToolConfirmationDetailsProvider;
    if (typeof provider.getConfirmationDetails === "function") {
      return provider.getConfirmationDetails(call, context);
    }

    const resolver = this.executor as ToolConfirmationResolver;
    if (typeof resolver.requiresConfirmation === "function") {
      return { requiresConfirmation: resolver.requiresConfirmation(call, context) };
    }

    return { requiresConfirmation: false };
  }

  private evaluate(call: MCPToolCall, context: ToolContext) {
    const toolDefinition = this.resolveTool(call.name);
    const { tool, operation } = parseToolName(call.name);
    return this.policyEngine.evaluate({
      call,
      tool,
      operation,
      toolDefinition,
      context,
    });
  }

  private resolveTool(name: string): MCPTool | undefined {
    if (this.toolCache.has(name)) {
      return this.toolCache.get(name);
    }

    const tool = this.registry.listTools().find((entry) => entry.name === name);
    if (tool) {
      this.toolCache.set(name, tool);
    }
    return tool;
  }
}

function parseToolName(name: string): { tool: string; operation: string } {
  const parts = name.split(":");
  if (parts.length > 1) {
    return { tool: parts[0], operation: parts.slice(1).join(":") };
  }
  return { tool: name, operation: name };
}

function mergeRiskTags(...tags: Array<string[] | undefined>): string[] | undefined {
  const set = new Set<string>();
  for (const group of tags) {
    if (!group) {
      continue;
    }
    for (const tag of group) {
      set.add(tag);
    }
  }
  return set.size > 0 ? Array.from(set) : undefined;
}

export function createKernel(services: RuntimeServices, config?: KernelConfig): Kernel {
  return new RuntimeKernel(services, config);
}
