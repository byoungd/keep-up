/**
 * Kernel Interfaces
 *
 * Defines the boundary between control-plane orchestration and data-plane services.
 */

import {
  A2AMessageBusAdapter,
  createMessageBus,
  getGlobalEventBus,
  type RuntimeEvent,
  type RuntimeEventBus,
} from "@ku0/agent-runtime-control";
import {
  type ArtifactEmissionContext,
  type ArtifactEmissionResult,
  type ArtifactPipeline,
  createArtifactPipeline,
  createArtifactRegistry,
  createImageArtifactStore,
} from "@ku0/agent-runtime-persistence/artifacts";
import { createCheckpointManager } from "@ku0/agent-runtime-persistence/checkpoint";
import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import {
  createSkillPolicyGuard,
  createSkillPromptAdapter,
  createSkillSession,
  type SkillPromptAdapter,
  type SkillRegistry,
  type SkillSession,
} from "@ku0/agent-runtime-tools/skills";
import { errorResult, type IToolRegistry } from "@ku0/agent-runtime-tools/tools/mcp";
import type { FileContextTracker } from "../context";
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
  withAuditTelemetry,
} from "../security";
import type { SessionState } from "../session";
import { createSessionState } from "../session";
import { createTaskGraphStore, type TaskGraphStore } from "../tasks/taskGraph";
import type {
  A2AContext,
  AgentState,
  AuditLogger,
  ConfirmationHandler,
  ICheckpointManager,
  MCPTool,
  MCPToolCall,
  RuntimeMessageBus,
  SecurityPolicy,
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
  messageBus?: RuntimeMessageBus;
  state?: SessionState;
  checkpointManager?: ICheckpointManager;
  fileContextTracker?: FileContextTracker;
  audit?: AuditLogger;
  persistenceStore?: import("@ku0/agent-runtime-persistence").PersistenceStore;
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
  stop(): void;
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
  private readonly messageBus: RuntimeMessageBus;
  private readonly a2aContext?: A2AContext;
  private readonly checkpointManager: ICheckpointManager;
  private readonly taskGraph: TaskGraphStore;
  private readonly artifactPipeline: ArtifactPipeline;
  private readonly skillRegistry?: SkillRegistry;
  private readonly skillSession?: SkillSession;
  private readonly skillPromptAdapter?: SkillPromptAdapter;

  constructor(
    services: RuntimeServices,
    private readonly config: KernelConfig = {}
  ) {
    const resolvedAudit = services.audit
      ? withAuditTelemetry(services.audit, {
          eventBus: services.events ?? getGlobalEventBus(),
          telemetry: services.telemetry,
          source: "audit:kernel",
        })
      : undefined;
    this.services = { ...services, audit: resolvedAudit ?? services.audit };
    this.eventBus = services.events ?? getGlobalEventBus();
    this.sessionState = services.state ?? createSessionState();
    this.messageBus = services.messageBus ?? createMessageBus(this.eventBus);
    this.a2aContext = this.resolveA2AContext();
    this.checkpointManager = services.checkpointManager ?? createCheckpointManager();
    this.taskGraph = this.resolveTaskGraph();
    this.artifactPipeline = this.resolveArtifactPipeline(this.taskGraph);
    const skillOptions = this.resolveSkillOptions();
    const skillComponents = this.resolveSkillComponents(skillOptions, services.audit);
    this.skillRegistry = skillComponents.skillRegistry;
    this.skillSession = skillComponents.skillSession;
    this.skillPromptAdapter = skillComponents.skillPromptAdapter;

    const securityPolicy = this.resolveSecurityPolicy(services.policy);
    const policyEngine = this.resolveToolPolicyEngine(services.policy, securityPolicy);
    const defaultExecutor = this.createDefaultExecutor(policyEngine);
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

  stop(): void {
    this.orchestrator.stop();
  }

  emitArtifact(
    artifact: Parameters<ArtifactPipeline["emit"]>[0],
    context?: ArtifactEmissionContext
  ): ArtifactEmissionResult {
    return this.orchestrator.emitArtifact(artifact, context);
  }

  private resolveOrchestratorOptions(): CreateOrchestratorOptions {
    const skillOptions = this.resolveSkillOptions();
    const configuredToolExecution = this.config.orchestrator?.toolExecution;
    let toolExecution = configuredToolExecution;
    if (!toolExecution && this.services.audit) {
      toolExecution = { audit: this.services.audit };
    } else if (toolExecution && !toolExecution.audit && this.services.audit) {
      toolExecution = { ...toolExecution, audit: this.services.audit };
    }

    if (!this.config.orchestrator) {
      return {
        telemetry: this.services.telemetry,
        skills: skillOptions,
        a2a: this.a2aContext,
        toolExecution,
        components: {
          toolExecutor: this.executor,
          eventBus: this.eventBus,
          sessionState: this.sessionState,
          checkpointManager: this.checkpointManager,
          fileContextTracker: this.services.fileContextTracker,
          skillRegistry: this.skillRegistry,
          skillSession: this.skillSession,
          skillPromptAdapter: this.skillPromptAdapter,
          taskGraph: this.taskGraph,
          artifactPipeline: this.artifactPipeline,
          persistenceStore: this.services.persistenceStore,
        },
      };
    }
    return {
      ...this.config.orchestrator,
      telemetry: this.services.telemetry ?? this.config.orchestrator.telemetry,
      skills: this.config.orchestrator.skills ?? skillOptions,
      a2a: this.config.orchestrator.a2a ?? this.a2aContext,
      toolExecution,
      components: {
        ...this.config.orchestrator.components,
        toolExecutor: this.executor,
        eventBus: this.eventBus,
        sessionState: this.sessionState,
        checkpointManager:
          this.config.orchestrator.components?.checkpointManager ?? this.checkpointManager,
        fileContextTracker:
          this.config.orchestrator.components?.fileContextTracker ??
          this.services.fileContextTracker,
        skillRegistry: this.config.orchestrator.components?.skillRegistry ?? this.skillRegistry,
        skillSession: this.config.orchestrator.components?.skillSession ?? this.skillSession,
        skillPromptAdapter:
          this.config.orchestrator.components?.skillPromptAdapter ?? this.skillPromptAdapter,
        taskGraph: this.taskGraph,
        artifactPipeline: this.artifactPipeline,
        persistenceStore:
          this.config.orchestrator.components?.persistenceStore ?? this.services.persistenceStore,
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

  private resolveTaskGraph(): TaskGraphStore {
    return this.config.orchestrator?.components?.taskGraph ?? createTaskGraphStore();
  }

  private resolveArtifactPipeline(taskGraph: TaskGraphStore): ArtifactPipeline {
    return (
      this.config.orchestrator?.components?.artifactPipeline ??
      createArtifactPipeline({
        registry: createArtifactRegistry(),
        taskGraph,
        eventBus: this.eventBus,
        eventSource: this.config.orchestrator?.name ?? "agent",
      })
    );
  }

  private resolveSkillComponents(
    skillOptions: CreateOrchestratorOptions["skills"] | undefined,
    audit?: AuditLogger
  ): {
    skillRegistry?: SkillRegistry;
    skillSession?: SkillSession;
    skillPromptAdapter?: SkillPromptAdapter;
  } {
    const skillRegistry = skillOptions?.registry;
    const skillSession =
      skillOptions?.session ??
      (skillRegistry ? createSkillSession(skillRegistry, audit) : undefined);
    const skillPromptAdapter =
      skillOptions?.promptAdapter ?? (skillRegistry ? createSkillPromptAdapter() : undefined);
    return { skillRegistry, skillSession, skillPromptAdapter };
  }

  private resolveSecurityPolicy(policy: IPermissionChecker): SecurityPolicy {
    return typeof policy.getPolicy === "function"
      ? policy.getPolicy()
      : createSecurityPolicy("balanced");
  }

  private resolveToolPolicyEngine(
    policy: IPermissionChecker,
    securityPolicy: SecurityPolicy
  ): ToolPolicyEngine {
    const basePolicyEngine = createToolPolicyEngine(policy);
    const skillPolicyEngine = this.skillRegistry
      ? createSkillPolicyGuard(basePolicyEngine, this.skillRegistry)
      : basePolicyEngine;
    const toolExecutionContext = resolveToolExecutionContext(
      this.config.orchestrator?.toolExecutionContext,
      securityPolicy
    );
    return createToolGovernancePolicyEngine(skillPolicyEngine, toolExecutionContext);
  }

  private createDefaultExecutor(policyEngine: ToolPolicyEngine): ToolExecutor {
    const toolExecution = this.config.orchestrator?.toolExecution;
    const imageArtifactStore =
      toolExecution?.imageArtifactStore ??
      createImageArtifactStore({ pipeline: this.artifactPipeline });
    return createToolExecutor({
      registry: this.services.registry,
      policy: this.services.policy,
      policyEngine,
      promptInjectionGuard: toolExecution?.promptInjectionGuard,
      promptInjectionPolicy: toolExecution?.promptInjectionPolicy,
      sandboxAdapter: toolExecution?.sandboxAdapter,
      telemetryHandler: toolExecution?.telemetryHandler,
      executionObserver: toolExecution?.executionObserver,
      audit: toolExecution?.audit ?? this.services.audit,
      telemetry: toolExecution?.telemetry ?? this.services.telemetry,
      rateLimiter: toolExecution?.rateLimiter,
      cache: toolExecution?.cache,
      retryOptions: toolExecution?.retryOptions,
      cachePredicate: toolExecution?.cachePredicate,
      contextOverrides: toolExecution?.contextOverrides,
      outputSpooler: toolExecution?.outputSpooler,
      outputSpoolPolicy: toolExecution?.outputSpoolPolicy,
      outputSpoolingEnabled: toolExecution?.outputSpoolingEnabled,
      imageArtifactStore,
    });
  }

  private resolveA2AContext(): A2AContext | undefined {
    if (this.config.orchestrator?.a2a) {
      return this.config.orchestrator.a2a;
    }
    const agentId = this.config.orchestrator?.name ?? "agent";
    return {
      adapter: new A2AMessageBusAdapter(this.messageBus),
      agentId,
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
