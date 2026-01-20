/**
 * Agent Orchestrator
 *
 * Coordinates LLM reasoning with tool execution in an agentic loop.
 * Handles planning, execution, confirmation, and state management.
 *
 * Design:
 * - Decoupled from specific LLM providers via interface
 * - Event-driven for observability
 * - Integrated telemetry for metrics and tracing
 * - Supports confirmation flow for dangerous operations
 * - Streaming support for real-time feedback
 */

import { getGlobalEventBus, type RuntimeEventBus } from "@ku0/agent-runtime-control";
import type {
  IMetricsCollector,
  ITracer,
  SpanContext,
  TelemetryContext,
} from "@ku0/agent-runtime-telemetry/telemetry";
import { AGENT_METRICS } from "@ku0/agent-runtime-telemetry/telemetry";
import {
  COMPLETION_TOOL_NAME,
  createSkillPolicyGuard,
  createSkillPromptAdapter,
  createSkillSession,
  createToolDiscoveryEngine,
  type IToolRegistry,
  type SkillPromptAdapter,
  type SkillRegistry,
  type SkillSession,
  type ToolDiscoveryEngine,
  validateCompletionInput,
} from "@ku0/agent-runtime-tools";
import { MODEL_CATALOG, type ModelCapability } from "@ku0/ai-core";
import type { IntentRegistry } from "@ku0/core";
import { createIntentRegistry } from "@ku0/core";
import type {
  ArtifactEmissionContext,
  ArtifactEmissionResult,
  ArtifactPipeline,
} from "../artifacts";
import {
  createArtifactPipeline,
  createArtifactRegistry,
  createImageArtifactStore,
} from "../artifacts";
import type { ContextFrameBuilder, ContextItem, FileContextTracker } from "../context";
import {
  createToolExecutor,
  type ToolConfirmationDetailsProvider,
  type ToolConfirmationResolver,
  type ToolExecutionObserver,
  type ToolExecutionOptions,
  type ToolExecutor,
} from "../executor";
import type { KnowledgeRegistry } from "../knowledge";
import { AGENTS_GUIDE_PROMPT } from "../prompts/agentGuidelines";
import type { ModelRouter, ModelRoutingDecision } from "../routing/modelRouter";
import { resolveRuntimeCacheConfig } from "../runtimeConfig";
import {
  ApprovalManager,
  createAuditLogger,
  createPermissionChecker,
  createToolGovernancePolicyEngine,
  createToolPolicyEngine,
} from "../security";
import type { SessionState } from "../session";
import type { ISOPExecutor } from "../sop/types";
import { attachRuntimeEventStreamBridge, type StreamWriter } from "../streaming";
import { createTaskGraphStore, type TaskGraphStore, type TaskNodeStatus } from "../tasks/taskGraph";
import type {
  A2AContext,
  AgentConfig,
  AgentMessage,
  AgentState,
  ArtifactEnvelope,
  AuditLogger,
  CheckpointEvent,
  CheckpointStatus,
  ConfirmationHandler,
  ConfirmationRequest,
  ICheckpointManager,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ParallelExecutionConfig,
  PermissionEscalation,
  RuntimeCacheConfig,
  RuntimeConfig,
  SecurityPolicy,
  TokenUsageStats,
  ToolContext,
  ToolError,
  ToolExecutionContext,
} from "../types";
import { ToolResultCache, type ToolResultCacheOptions } from "../utils/cache";
import { countTokens } from "../utils/tokenCounter";
import {
  type AgentLoopStateMachine,
  createAgentLoopStateMachine,
  type Observation,
  type PerceptionContext,
  type ThinkingResult,
  type ToolDecision,
} from "./agentLoop";
import { createDependencyAnalyzer, type DependencyAnalyzer } from "./dependencyAnalyzer";
import { createErrorRecoveryEngine, type ErrorRecoveryEngine } from "./errorRecovery";
import { BackpressureEventStream } from "./eventStream";
import type { AgentToolDefinition, IAgentLLM } from "./llmTypes";
import { type MessageCompressor, SmartMessageCompressor } from "./messageCompression";
import { MessageRewindManager, type MessageRewindOptions } from "./messageRewind";
import { NodeResultCache } from "./nodeResultCache";
import {
  createPlanningEngine,
  type ExecutionPlan,
  type PlanApprovalHandler,
  type PlanningEngine,
} from "./planning";
import { createRequestCache, type RequestCache } from "./requestCache";
import { createSingleStepEnforcer, type SingleStepEnforcer } from "./singleStepEnforcer";
import { SmartToolScheduler } from "./smartToolScheduler";
import { OrchestratorStatusController } from "./statusController";
import { createTurnExecutor, type ITurnExecutor, type TurnOutcome } from "./turnExecutor";

export type {
  AgentLLMChunk,
  AgentLLMRequest,
  AgentLLMResponse,
  AgentToolDefinition,
  IAgentLLM,
} from "./llmTypes";

// ============================================================================
// Orchestrator Events
// ============================================================================

export type OrchestratorEventType =
  | "turn:start"
  | "turn:end"
  | "thinking"
  | "tool:calling"
  | "tool:result"
  | "confirmation:required"
  | "confirmation:received"
  | "plan:created"
  | "plan:refined"
  | "plan:approved"
  | "plan:rejected"
  | "plan:executing"
  | "control:signal"
  | "control:paused"
  | "control:resumed"
  | "control:step"
  | "control:injected"
  | "history:rewind"
  | "recovery"
  | "completion"
  | "error"
  | "complete"
  | "usage:update";

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  turn: number;
  data: unknown;
}

export type OrchestratorEventHandler = (event: OrchestratorEvent) => void;

export type AgentControlSignal =
  | { type: "PAUSE"; reason?: string }
  | { type: "RESUME"; reason?: string }
  | { type: "STEP"; reason?: string }
  | { type: "INJECT_THOUGHT"; thought: string; reason?: string };

export interface ControlStateSnapshot {
  paused: boolean;
  stepMode: boolean;
}

export interface OrchestratorComponents {
  messageCompressor?: MessageCompressor;
  requestCache?: RequestCache;
  dependencyAnalyzer?: DependencyAnalyzer;
  toolScheduler?: SmartToolScheduler;
  planningEngine?: PlanningEngine;
  toolExecutor?: ToolExecutor;
  eventBus?: RuntimeEventBus;
  sessionState?: SessionState;
  checkpointManager?: ICheckpointManager;
  fileContextTracker?: FileContextTracker;
  auditLogger?: AuditLogger;
  errorRecoveryEngine?: ErrorRecoveryEngine;
  toolDiscovery?: ToolDiscoveryEngine;
  /** Intent registry for tracking AI edit intents */
  intentRegistry?: IntentRegistry;
  /** Knowledge registry for scoped knowledge injection */
  knowledgeRegistry?: KnowledgeRegistry;
  /** Optional context frame builder */
  contextFrameBuilder?: ContextFrameBuilder;
  /** Optional provider for context items */
  contextItemsProvider?: () => ContextItem[];
  /** Skill registry for Agent Skills */
  skillRegistry?: SkillRegistry;
  /** Skill session tracking active skills */
  skillSession?: SkillSession;
  /** Skill prompt adapter for available skills injection */
  skillPromptAdapter?: SkillPromptAdapter;
  /** Optional task graph for event-sourced task tracking */
  taskGraph?: TaskGraphStore;
  /** Optional runtime cache configuration */
  runtimeCacheConfig?: RuntimeCacheConfig;
  /** Optional tool result cache */
  toolResultCache?: ToolResultCache;
  /** Optional node-level result cache */
  nodeResultCache?: NodeResultCache;
  /** Optional approval manager */
  approvalManager?: ApprovalManager;
  /** Optional runtime event stream bridge */
  streamBridge?: OrchestratorStreamBridge;
  /** Optional artifact pipeline */
  artifactPipeline?: ArtifactPipeline;
  /** SOP executor for phase-gated tool filtering (Track E) */
  sopExecutor?: ISOPExecutor;
  /** Model router for per-turn model selection (Track F) */
  modelRouter?: ModelRouter;
}

export interface OrchestratorStreamBridge {
  stream: StreamWriter;
  includeDecisions?: boolean;
}

type ToolMessage = Extract<AgentMessage, { role: "tool" }>;

const DEFAULT_MAX_TURNS = 50;
const DEFAULT_RECOVERY_GRACE_TURNS = 2;
const DEFAULT_RECOVERY_TIMEOUT_MS = 60_000;
const DEFAULT_RECOVERY_WARNING_TEMPLATE =
  "Final warning: turn limit reached. Call complete_task now with a summary, artifacts, and next steps. Do not call any other tools.";

type CompletionPayload = {
  summary: string;
  artifacts?: string[];
  nextSteps?: string;
};

type RecoveryState = {
  active: boolean;
  warned: boolean;
  deadlineMs?: number;
};

// ============================================================================
// Agent Orchestrator
// ============================================================================

export class AgentOrchestrator {
  private readonly config: AgentConfig;
  private readonly llm: IAgentLLM;
  private readonly registry: IToolRegistry;
  private readonly eventHandlers = new Set<OrchestratorEventHandler>();
  private readonly metrics?: IMetricsCollector;
  private readonly tracer?: ITracer;

  // Performance optimizations
  private readonly messageCompressor: MessageCompressor;
  private readonly requestCache: RequestCache;
  private readonly toolResultCache: ToolResultCache;
  private readonly nodeResultCache?: NodeResultCache;
  private readonly dependencyAnalyzer: DependencyAnalyzer;
  private readonly toolScheduler: SmartToolScheduler;
  private readonly planningEngine: PlanningEngine;
  private readonly turnExecutor: ITurnExecutor;
  private readonly toolExecutor?: ToolExecutor;
  private readonly approvalManager?: ApprovalManager;
  private readonly eventBus?: RuntimeEventBus;
  private readonly sessionState?: SessionState;
  private readonly checkpointManager?: ICheckpointManager;
  private readonly fileContextTracker?: FileContextTracker;
  private readonly auditLogger?: AuditLogger;
  private readonly errorRecoveryEngine?: ErrorRecoveryEngine;
  private readonly toolDiscovery?: ToolDiscoveryEngine;
  private readonly intentRegistry?: IntentRegistry;
  private readonly knowledgeRegistry?: KnowledgeRegistry;
  private readonly skillRegistry?: SkillRegistry;
  private readonly skillSession?: SkillSession;
  private readonly skillPromptAdapter?: SkillPromptAdapter;
  private readonly taskGraph?: TaskGraphStore;
  private readonly streamBridge?: OrchestratorStreamBridge;
  private readonly artifactPipeline?: ArtifactPipeline;
  private readonly sopExecutor?: ISOPExecutor;
  private readonly modelRouter?: ModelRouter;
  private readonly loopStateMachine: AgentLoopStateMachine;
  private readonly singleStepEnforcer: SingleStepEnforcer;
  private readonly statusController: OrchestratorStatusController;
  private readonly messageRewindManager: MessageRewindManager;
  private lastObservation?: Observation;
  private currentRunId?: string;
  private currentCheckpointId?: string;
  private currentCheckpointStatus?: CheckpointStatus;
  private currentCheckpointAgentId?: string;
  private currentTask?: string;
  private currentPlanNodeId?: string;
  private planArtifactEmitted = false;
  private readonly taskGraphToolCalls = new WeakMap<MCPToolCall, string>();
  private totalUsage: TokenUsageStats = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private readonly controlState: ControlStateSnapshot = { paused: false, stepMode: false };
  private controlGate?: { promise: Promise<void>; resolve: () => void };
  private recoveryState: RecoveryState = { active: false, warned: false };
  private forceCompletionToolsOnly = false;

  private state: AgentState;

  /**
   * Smart Model Routing
   * Selects the best model ID based on the requested strategy.
   * Leverages centralized MODEL_CATALOG data.
   */
  public static selectModel(
    strategy: "fast" | "quality" | "balanced" | "thinking" = "balanced"
  ): string {
    const candidates = MODEL_CATALOG.filter((m) => !m.legacy);
    let match: ModelCapability | undefined;

    switch (strategy) {
      case "fast":
        match = candidates.find((m) => m.tags.includes("fast"));
        break;
      case "quality":
        match = candidates.find((m) => m.tags.includes("quality"));
        break;
      case "thinking":
        match = candidates.find((m) => m.supports.thinking);
        break;
      default:
        // Default to balanced
        match = candidates.find((m) => m.tags.includes("balanced"));
        break;
    }
    return match?.id ?? candidates[0]?.id ?? "gemini-3-flash";
  }

  private confirmationHandler?: ConfirmationHandler;
  private abortController?: AbortController;

  constructor(
    config: AgentConfig,
    llm: IAgentLLM,
    registry: IToolRegistry,
    telemetry?: TelemetryContext,
    components: OrchestratorComponents = {}
  ) {
    this.config = config;
    this.llm = llm;
    this.registry = registry;
    this.metrics = telemetry?.metrics;
    this.tracer = telemetry?.tracer;
    this.sessionState = components.sessionState;
    this.checkpointManager = components.checkpointManager;
    this.state = this.resolveInitialState();
    this.statusController = new OrchestratorStatusController(this.state.status);
    this.singleStepEnforcer = createSingleStepEnforcer({
      enabled: config.toolExecutionContext?.policy === "interactive",
      allowZeroToolCalls: true,
    });
    this.toolExecutor = components.toolExecutor;
    this.approvalManager = this.resolveApprovalManager(components);
    this.eventBus = components.eventBus;
    this.errorRecoveryEngine = this.resolveErrorRecoveryEngine(config, components);
    this.toolDiscovery = this.resolveToolDiscovery(config, components);
    this.fileContextTracker = components.fileContextTracker;
    this.auditLogger = components.auditLogger;

    // Initialize performance optimizations
    this.messageCompressor = this.resolveMessageCompressor(components);
    this.toolResultCache = this.resolveToolResultCache(components);
    this.nodeResultCache = this.resolveNodeResultCache(config, components);
    this.requestCache = this.resolveRequestCache(components);
    this.dependencyAnalyzer = this.resolveDependencyAnalyzer(components);
    this.toolScheduler = this.resolveToolScheduler(components, this.dependencyAnalyzer);
    this.planningEngine = this.resolvePlanningEngine(config, components);
    this.messageRewindManager = new MessageRewindManager(this.messageCompressor);

    // Initialize knowledge registry for scoped knowledge injection
    this.intentRegistry = this.resolveIntentRegistry(components);
    this.knowledgeRegistry = components.knowledgeRegistry;
    this.skillRegistry = components.skillRegistry;
    this.skillSession = components.skillSession;
    this.skillPromptAdapter = components.skillPromptAdapter;
    this.taskGraph = components.taskGraph;
    this.streamBridge = components.streamBridge;
    this.artifactPipeline = components.artifactPipeline;
    this.sopExecutor = components.sopExecutor;
    this.modelRouter = components.modelRouter;

    this.turnExecutor = createTurnExecutor({
      llm: this.llm,
      messageCompressor: this.messageCompressor,
      requestCache: this.requestCache,
      knowledgeRegistry: this.knowledgeRegistry,
      contextFrameBuilder: components.contextFrameBuilder,
      getContextItems: components.contextItemsProvider,
      skillRegistry: this.skillRegistry,
      skillPromptAdapter: this.skillPromptAdapter,
      metrics: this.metrics,
      getToolDefinitions: () => this.getToolDefinitions(),
    });

    this.loopStateMachine = createAgentLoopStateMachine({ enableCycleLogging: false });
  }

  private resolveApprovalManager(components: OrchestratorComponents): ApprovalManager {
    if (components.approvalManager) {
      return components.approvalManager;
    }
    return new ApprovalManager();
  }

  private resolveErrorRecoveryEngine(
    config: AgentConfig,
    components: OrchestratorComponents
  ): ErrorRecoveryEngine | undefined {
    if (components.errorRecoveryEngine) {
      return components.errorRecoveryEngine;
    }
    if (!config.recovery?.enabled) {
      return undefined;
    }
    return createErrorRecoveryEngine();
  }

  private resolveToolDiscovery(
    config: AgentConfig,
    components: OrchestratorComponents
  ): ToolDiscoveryEngine | undefined {
    if (components.toolDiscovery) {
      components.toolDiscovery.registerServer(new RegistryToolServerAdapter(this.registry));
      return components.toolDiscovery;
    }
    if (!config.toolDiscovery?.enabled) {
      return undefined;
    }
    const discovery = createToolDiscoveryEngine();
    discovery.registerServer(new RegistryToolServerAdapter(this.registry));
    return discovery;
  }

  private resolveMessageCompressor(components: OrchestratorComponents): MessageCompressor {
    if (components.messageCompressor) {
      return components.messageCompressor;
    }
    return new SmartMessageCompressor({
      maxTokens: 8000,
      strategy: "hybrid",
      preserveCount: 3,
      estimateTokens: (text: string) => countTokens(text),
      maxToolResultTokens: 500,
    });
  }

  private resolveToolResultCache(components: OrchestratorComponents): ToolResultCache {
    if (components.toolResultCache) {
      return components.toolResultCache;
    }
    const runtimeCache = components.runtimeCacheConfig?.toolResult;
    const options: ToolResultCacheOptions = {};
    if (runtimeCache?.ttlMs !== undefined) {
      options.defaultTtlMs = runtimeCache.ttlMs;
    }
    if (runtimeCache?.maxEntries !== undefined) {
      options.maxEntries = runtimeCache.maxEntries;
    }
    if (runtimeCache?.maxSizeBytes !== undefined) {
      options.maxSizeBytes = runtimeCache.maxSizeBytes;
    }
    return this.sessionState?.toolCache ?? new ToolResultCache(options);
  }

  private resolveNodeResultCache(
    config: AgentConfig,
    components: OrchestratorComponents
  ): NodeResultCache | undefined {
    if (components.nodeResultCache) {
      return components.nodeResultCache;
    }
    const nodeCache = config.toolExecutionContext?.nodeCache;
    if (!nodeCache?.enabled) {
      return undefined;
    }
    return new NodeResultCache({
      ttlMs: nodeCache.ttlMs,
      includePolicyContext: nodeCache.includePolicyContext,
    });
  }

  private resolveRequestCache(components: OrchestratorComponents): RequestCache {
    if (components.requestCache) {
      return components.requestCache;
    }
    const runtimeCache = components.runtimeCacheConfig?.request;
    return createRequestCache({
      enabled: runtimeCache?.enabled ?? true,
      ttlMs: runtimeCache?.ttlMs ?? 300000, // 5 minutes
      maxSize: runtimeCache?.maxEntries ?? 1000,
    });
  }

  private resolveDependencyAnalyzer(components: OrchestratorComponents): DependencyAnalyzer {
    if (components.dependencyAnalyzer) {
      return components.dependencyAnalyzer;
    }
    return createDependencyAnalyzer();
  }

  private resolveToolScheduler(
    components: OrchestratorComponents,
    dependencyAnalyzer: DependencyAnalyzer
  ): SmartToolScheduler {
    if (components.toolScheduler) {
      return components.toolScheduler;
    }
    return new SmartToolScheduler({ dependencyAnalyzer });
  }

  private resolvePlanningEngine(
    config: AgentConfig,
    components: OrchestratorComponents
  ): PlanningEngine {
    if (components.planningEngine) {
      return components.planningEngine;
    }
    return createPlanningEngine({
      enabled: config.planning?.enabled ?? false,
      requireApproval: config.planning?.requireApproval ?? false,
      maxRefinements: config.planning?.maxRefinements,
      planningTimeoutMs: config.planning?.planningTimeoutMs,
      autoExecuteLowRisk: config.planning?.autoExecuteLowRisk,
      persistToFile: config.planning?.persistToFile,
      workingDirectory: config.planning?.workingDirectory,
    });
  }

  private resolveIntentRegistry(components: OrchestratorComponents): IntentRegistry {
    if (components.intentRegistry) {
      return components.intentRegistry;
    }
    return createIntentRegistry();
  }

  /**
   * Run the agent with a user message.
   */
  async run(userMessage: string): Promise<AgentState> {
    return this.runWithId(userMessage, this.generateRunId());
  }

  /**
   * Run the agent with a provided run ID (task correlation).
   */
  async runWithRunId(userMessage: string, runId: string): Promise<AgentState> {
    return this.runWithId(userMessage, runId);
  }

  emitArtifact(
    artifact: Parameters<ArtifactPipeline["emit"]>[0],
    context: ArtifactEmissionContext = {}
  ): ArtifactEmissionResult {
    if (!this.artifactPipeline) {
      return { stored: false, valid: false, errors: ["Artifact pipeline not configured"] };
    }

    const result = this.artifactPipeline.emit(artifact, {
      correlationId: context.correlationId ?? this.currentRunId,
      source: context.source ?? this.config.name,
      idempotencyKey: context.idempotencyKey ?? artifact.id,
    });

    if (result.stored) {
      void this.advanceSopForArtifact(artifact).catch(() => {
        // Avoid breaking artifact emission on SOP updates.
      });
    }

    return result;
  }

  private async runWithId(userMessage: string, runId: string): Promise<AgentState> {
    this.abortController = new AbortController();
    this.currentRunId = runId;
    this.currentTask = userMessage;
    this.currentCheckpointId = undefined;
    this.currentCheckpointStatus = undefined;
    this.currentCheckpointAgentId = undefined;
    this.state.checkpointId = undefined;
    this.recoveryState = { active: false, warned: false };
    this.forceCompletionToolsOnly = false;
    this.planArtifactEmitted = false;
    this.taskGraph?.setEventContext({ correlationId: runId, source: this.config.name });
    this.currentPlanNodeId = this.createPlanNode(userMessage);
    const detachStreamBridge = this.attachStreamBridge(runId);

    await this.initializeCheckpoint(userMessage);

    // Add user message
    const userMsg: AgentMessage = { role: "user", content: userMessage };
    this.state.messages.push(userMsg);
    this.recordMessage(userMsg);
    this.metrics?.gauge(AGENT_METRICS.activeAgents.name, 1, {});
    this.loopStateMachine.stop();

    try {
      if (!this.hasCompletionTool()) {
        this.statusController.setStatus(this.state, "error");
        this.state.error = "Completion tool not registered.";
        this.emit("error", { error: this.state.error });
        this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "error" });
        await this.finalizeCheckpointStatus();
        return this.state;
      }

      // Run the agentic loop
      while (this.shouldContinue()) {
        await this.awaitControlGate();
        if (!this.shouldContinue()) {
          break;
        }
        await this.executeTurn();
        this.applyStepPause();
      }
    } finally {
      detachStreamBridge?.();
      this.finalizePlanNode();
      this.metrics?.gauge(AGENT_METRICS.activeAgents.name, 0, {});
    }

    if (
      this.state.status !== "complete" &&
      this.state.status !== "waiting_confirmation" &&
      this.state.status !== "error"
    ) {
      this.statusController.setStatus(this.state, "error");
      this.state.error = this.state.error ?? "Task terminated without calling complete_task.";
      this.emit("error", { error: this.state.error });
    }

    await this.finalizeCheckpointStatus();
    return this.state;
  }

  private attachStreamBridge(runId: string): (() => void) | undefined {
    if (!this.streamBridge || !this.eventBus) {
      return undefined;
    }

    return attachRuntimeEventStreamBridge({
      eventBus: this.eventBus,
      stream: this.streamBridge.stream,
      correlationId: runId,
      includeDecisions: this.streamBridge.includeDecisions,
    });
  }

  /**
   * Run the agent with streaming events.
   * Yields events as they occur during execution.
   */
  async *runStream(userMessage: string): AsyncGenerator<OrchestratorEvent, AgentState, void> {
    const stream = new BackpressureEventStream<OrchestratorEvent>({
      highWaterMark: 100,
    });

    // Capture events
    const unsubscribe = this.on((event) => {
      stream.push(event);
    });

    // Start execution in background
    const runPromise = this.run(userMessage);
    runPromise.finally(() => stream.close());

    try {
      // Yield events as they come
      yield* stream.consume();

      return await runPromise;
    } finally {
      unsubscribe();
    }
  }

  /**
   * Continue from a paused state (e.g., after confirmation).
   */
  async resume(): Promise<AgentState> {
    if (this.state.status !== "waiting_confirmation") {
      throw new Error("Cannot resume: agent is not waiting for confirmation");
    }

    this.statusController.setStatus(this.state, "executing");
    this.loopStateMachine.resume();
    while (this.shouldContinue()) {
      await this.awaitControlGate();
      if (!this.shouldContinue()) {
        break;
      }
      await this.executeTurn();
      this.applyStepPause();
    }

    return this.state;
  }

  /**
   * Stop the agent execution.
   */
  stop(): void {
    this.abortController?.abort();
    if (this.state.status !== "error") {
      this.statusController.setStatus(this.state, "error");
      this.state.error = this.state.error ?? "Execution aborted before completion.";
      this.emit("error", { error: this.state.error });
    }
    this.cleanupHistory("cancel");
    this.loopStateMachine.stop();
    this.releaseControlGate();
  }

  /**
   * Rewind message history to a specific index (exclusive).
   */
  rewindHistory(
    toIndex: number,
    options: MessageRewindOptions & { reason?: string } = {}
  ): ReturnType<MessageRewindManager["rewindToIndex"]> {
    const result = this.messageRewindManager.rewindToIndex(this.state.messages, toIndex, options);
    this.state.messages = result.messages;
    this.sessionState?.setState(this.state);
    this.clearCachesOnRewind();
    this.emit("history:rewind", {
      reason: options.reason ?? "manual",
      removedSummaries: result.removedSummaries,
      removedTruncationMarkers: result.removedTruncationMarkers,
      messageCount: result.messages.length,
    });
    this.auditTimeTravel("history_rewind", {
      reason: options.reason ?? "manual",
      toIndex,
      removedSummaries: result.removedSummaries,
      removedTruncationMarkers: result.removedTruncationMarkers,
      messageCount: result.messages.length,
    });
    return result;
  }

  /**
   * Restore agent state from a checkpoint and clean message history.
   */
  async restoreCheckpoint(checkpointId: string): Promise<AgentState> {
    if (!this.checkpointManager) {
      throw new Error("Checkpoint manager not configured.");
    }

    const recovery = await this.checkpointManager.prepareRecovery(checkpointId);
    if (!recovery.success) {
      throw new Error(recovery.error ?? `Checkpoint ${checkpointId} not recoverable`);
    }

    const checkpoint = recovery.checkpoint;
    const restoredMessages: AgentMessage[] = checkpoint.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const cleaned = this.messageRewindManager.cleanupMessages(restoredMessages);

    this.state.messages = cleaned.messages;
    this.state.pendingToolCalls = checkpoint.pendingToolCalls.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));
    this.state.turn = checkpoint.currentStep;
    this.state.status = "idle";
    this.state.error = undefined;
    this.state.checkpointId = checkpoint.id;
    this.sessionState?.setState(this.state);

    this.currentCheckpointId = checkpoint.id;
    this.currentCheckpointStatus = checkpoint.status;
    this.currentCheckpointAgentId = checkpoint.agentId;

    this.clearCachesOnRewind();
    this.emit("history:rewind", {
      reason: "checkpoint_restore",
      checkpointId,
      removedSummaries: cleaned.removedSummaries,
      removedTruncationMarkers: cleaned.removedTruncationMarkers,
      messageCount: cleaned.messages.length,
    });
    this.auditTimeTravel("checkpoint_restore", {
      checkpointId,
      removedSummaries: cleaned.removedSummaries,
      removedTruncationMarkers: cleaned.removedTruncationMarkers,
      messageCount: cleaned.messages.length,
    });

    return this.state;
  }

  /**
   * Send a control signal to the running agent.
   */
  sendControlSignal(signal: AgentControlSignal): void {
    this.emit("control:signal", signal);
    this.loopStateMachine.applyControlSignal(signal.type);

    switch (signal.type) {
      case "PAUSE":
        this.pauseExecution(signal.reason);
        break;
      case "RESUME":
        this.resumeExecution(signal.reason);
        break;
      case "STEP":
        this.stepExecution(signal.reason);
        break;
      case "INJECT_THOUGHT":
        this.injectThought(signal.thought, signal.reason);
        break;
    }
  }

  /**
   * Get the current control plane state.
   */
  getControlState(): ControlStateSnapshot {
    return { ...this.controlState };
  }

  /**
   * Get current state.
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Set confirmation handler for dangerous operations.
   */
  setConfirmationHandler(handler: ConfirmationHandler): void {
    this.confirmationHandler = handler;
  }

  /**
   * Set plan approval handler for plan-then-execute flows.
   */
  setPlanApprovalHandler(handler: PlanApprovalHandler): void {
    this.planningEngine.setApprovalHandler(handler);
  }

  /**
   * Subscribe to orchestrator events.
   */
  on(handler: OrchestratorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createInitialState(): AgentState {
    return {
      turn: 0,
      messages: [{ role: "system", content: this.config.systemPrompt }],
      pendingToolCalls: [],
      status: "idle",
    };
  }

  private resolveInitialState(): AgentState {
    if (!this.sessionState) {
      return this.createInitialState();
    }

    const existing = this.sessionState.getState();
    if (existing.messages.length === 0) {
      const initial = this.createInitialState();
      this.sessionState.setState(initial);
      return initial;
    }

    return existing;
  }

  private async ensureCheckpointReady(): Promise<void> {
    if (!this.checkpointManager || this.currentCheckpointId) {
      return;
    }

    await this.initializeCheckpoint(this.resolveCheckpointTask());
  }

  private async initializeCheckpoint(task: string): Promise<void> {
    if (!this.checkpointManager || this.currentCheckpointId) {
      return;
    }

    try {
      const agentId = this.currentRunId ?? this.sessionState?.id ?? this.config.name;
      const checkpoint = await this.checkpointManager.create({
        task,
        agentType: this.config.name,
        agentId,
        maxSteps: this.config.maxTurns ?? DEFAULT_MAX_TURNS,
        metadata: {
          runId: this.currentRunId,
          sessionId: this.sessionState?.id,
        },
      });

      this.currentCheckpointId = checkpoint.id;
      this.currentCheckpointStatus = checkpoint.status;
      this.currentCheckpointAgentId = agentId;
      this.state.checkpointId = checkpoint.id;
      this.sessionState?.setState(this.state);

      await this.seedCheckpointMessages(checkpoint.id);
      this.emitCheckpointEvent("created");
    } catch {
      // Avoid breaking orchestration on checkpoint initialization failures.
    }
  }

  private async seedCheckpointMessages(checkpointId: string): Promise<void> {
    if (!this.checkpointManager) {
      return;
    }

    for (const message of this.state.messages) {
      if (message.role === "tool") {
        continue;
      }
      await this.checkpointManager.addMessage(checkpointId, {
        role: message.role,
        content: message.content,
      });
    }
  }

  private recordCheckpointMessage(message: AgentMessage): void {
    if (message.role === "tool") {
      return;
    }

    const checkpointId = this.currentCheckpointId;
    if (!this.checkpointManager || !checkpointId) {
      return;
    }

    void this.checkpointManager
      .addMessage(checkpointId, { role: message.role, content: message.content })
      .then(() => {
        this.emitCheckpointEvent("message", { messageRole: message.role });
      })
      .catch(() => {
        // Avoid breaking orchestration on checkpoint write errors.
      });
  }

  private async recordCheckpointToolCall(call: MCPToolCall): Promise<string | undefined> {
    const checkpointId = this.currentCheckpointId;
    if (!this.checkpointManager || !checkpointId) {
      return call.id;
    }

    const toolCallId = this.ensureToolCallId(call);

    try {
      await this.checkpointManager.addPendingToolCall(checkpointId, {
        id: toolCallId,
        name: call.name,
        arguments: call.arguments,
      });
      this.emitCheckpointEvent("tool_call", { toolCallId, toolName: call.name });
    } catch {
      // Avoid breaking orchestration on checkpoint write errors.
    }

    return toolCallId;
  }

  private async recordCheckpointToolResult(
    call: MCPToolCall,
    result: MCPToolResult,
    durationMs: number
  ): Promise<void> {
    const checkpointId = this.currentCheckpointId;
    if (!this.checkpointManager || !checkpointId) {
      return;
    }

    const toolCallId = this.ensureToolCallId(call);

    try {
      await this.checkpointManager.completeToolCall(checkpointId, {
        callId: toolCallId,
        name: call.name,
        arguments: call.arguments,
        result,
        success: result.success,
        durationMs,
      });
      this.emitCheckpointEvent("tool_result", {
        toolCallId,
        toolName: call.name,
        success: result.success,
        error: result.success ? undefined : result.error?.message,
      });
    } catch {
      // Avoid breaking orchestration on checkpoint write errors.
    }
  }

  private async recordCheckpointTurnEnd(): Promise<void> {
    const checkpointId = this.currentCheckpointId;
    if (!this.checkpointManager || !checkpointId) {
      return;
    }

    try {
      const step = await this.checkpointManager.advanceStep(checkpointId);
      this.emitCheckpointEvent("turn_end", { step });
    } catch {
      // Avoid breaking orchestration on checkpoint write errors.
    }
  }

  private async finalizeCheckpointStatus(): Promise<void> {
    const checkpointId = this.currentCheckpointId;
    if (!this.checkpointManager || !checkpointId) {
      return;
    }

    const status = this.state.status;
    if (status === "complete" && this.currentCheckpointStatus !== "completed") {
      this.currentCheckpointStatus = "completed";
      try {
        await this.checkpointManager.updateStatus(checkpointId, "completed");
        this.emitCheckpointEvent("status");
      } catch {
        // Avoid breaking orchestration on checkpoint write errors.
      }
      return;
    }

    if (status === "error" && this.currentCheckpointStatus !== "failed") {
      const message = this.state.error ?? "Execution failed.";
      this.currentCheckpointStatus = "failed";
      try {
        await this.checkpointManager.updateStatus(checkpointId, "failed", {
          message,
          recoverable: Boolean(this.errorRecoveryEngine),
        });
        this.emitCheckpointEvent("status", { error: message });
      } catch {
        // Avoid breaking orchestration on checkpoint write errors.
      }
    }
  }

  private emitCheckpointEvent(
    update: CheckpointEvent["update"],
    data: Partial<CheckpointEvent> = {}
  ): void {
    if (!this.eventBus || !this.currentCheckpointId) {
      return;
    }

    const payload: CheckpointEvent = {
      checkpointId: this.currentCheckpointId,
      runId: this.currentRunId,
      agentId: this.currentCheckpointAgentId ?? this.currentRunId ?? this.config.name,
      agentType: this.config.name,
      status: this.currentCheckpointStatus ?? "pending",
      step: this.state.turn,
      update,
      ...data,
    };

    const eventType = update === "created" ? "checkpoint:created" : "checkpoint:updated";
    this.eventBus.emit(eventType, payload, {
      source: this.config.name,
      correlationId: this.currentRunId,
      priority: "normal",
    });
  }

  private ensureToolCallId(call: MCPToolCall): string {
    if (call.id) {
      return call.id;
    }
    const generated = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    call.id = generated;
    return generated;
  }

  private resolveCheckpointTask(): string {
    return this.currentTask ?? this.findLatestUserMessage() ?? "task";
  }

  private findLatestUserMessage(): string | undefined {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const message = this.state.messages[i];
      if (message.role === "user") {
        return message.content;
      }
    }
    return undefined;
  }

  private recordMessage(message: AgentMessage): void {
    this.sessionState?.recordMessage(message);
    this.sessionState?.setState(this.state);
    this.recordCheckpointMessage(message);
  }

  private async awaitControlGate(): Promise<void> {
    if (!this.controlState.paused) {
      return;
    }

    if (!this.controlGate) {
      this.controlGate = this.createControlGate();
    }

    await this.controlGate.promise;
  }

  private releaseControlGate(): void {
    if (this.controlGate) {
      this.controlGate.resolve();
      this.controlGate = undefined;
    }
  }

  private pauseExecution(reason?: string): void {
    if (this.controlState.paused) {
      return;
    }

    this.controlState.paused = true;
    this.loopStateMachine.pause();
    this.emit("control:paused", { reason });
  }

  private resumeExecution(reason?: string): void {
    if (!this.controlState.paused && !this.controlState.stepMode) {
      return;
    }

    this.controlState.paused = false;
    this.controlState.stepMode = false;
    this.loopStateMachine.resume();
    this.releaseControlGate();
    this.emit("control:resumed", { reason });
  }

  private stepExecution(reason?: string): void {
    this.controlState.stepMode = true;
    if (this.controlState.paused) {
      this.controlState.paused = false;
      this.loopStateMachine.resume();
      this.releaseControlGate();
    }
    this.emit("control:step", { reason });
  }

  private injectThought(thought: string, reason?: string): void {
    const message: AgentMessage = {
      role: "system",
      content: `[Control] ${thought}`,
    };
    this.state.messages.push(message);
    this.recordMessage(message);
    this.emit("control:injected", { thought, reason });
  }

  private applyStepPause(): void {
    if (!this.controlState.stepMode) {
      return;
    }

    if (!this.shouldContinue()) {
      this.controlState.stepMode = false;
      return;
    }

    this.controlState.stepMode = false;
    this.controlState.paused = true;
    this.loopStateMachine.pause();
    this.emit("control:paused", { reason: "step" });
  }

  private createControlGate(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  private shouldContinue(): boolean {
    const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;
    const hardLimit = this.config.recovery?.hardLimit ?? true;
    const withinLimit = hardLimit ? this.state.turn < maxTurns : true;

    return (
      this.state.status !== "complete" &&
      this.state.status !== "error" &&
      this.state.status !== "waiting_confirmation" &&
      withinLimit &&
      !this.abortController?.signal.aborted
    );
  }

  private startLoopCycle(): void {
    const perception: PerceptionContext = {
      messages: [...this.state.messages],
      previousObservation: this.lastObservation,
      userInput: this.getLatestUserMessage(),
    };

    this.loopStateMachine.startCycle(perception);
    this.loopStateMachine.transitionToThinking();
  }

  private buildThinkingResult(outcome: TurnOutcome): ThinkingResult {
    if (outcome.type === "tool_use") {
      return {
        nextStep: "execute_tool_calls",
        reasoning: "Model requested tool execution.",
        shouldUpdatePlan: false,
        shouldAdvancePhase: true,
      };
    }

    if (outcome.type === "complete") {
      return {
        nextStep: "handle_error",
        reasoning: "Completion tool required for termination.",
        shouldUpdatePlan: false,
        shouldAdvancePhase: false,
      };
    }

    return {
      nextStep: "handle_error",
      reasoning: outcome.error ?? "Execution error.",
      shouldUpdatePlan: false,
      shouldAdvancePhase: false,
    };
  }

  private buildDecisionForToolCalls(toolCalls: MCPToolCall[]): ToolDecision {
    if (toolCalls.length === 1) {
      const [call] = toolCalls;
      return {
        toolName: call.name,
        parameters: call.arguments,
        rationale: "Model requested a tool execution.",
        expectedOutcome: `Result from ${call.name}`,
      };
    }

    return {
      toolName: "tool_batch",
      parameters: {
        toolCalls: toolCalls.map((call) => ({ name: call.name, arguments: call.arguments })),
      },
      rationale: "Model requested multiple tool calls.",
      expectedOutcome: `Results from ${toolCalls.length} tool calls`,
    };
  }

  private buildPlanRejectionObservation(toolCalls: MCPToolCall[], turnStart: number): Observation {
    const duration = Date.now() - turnStart;
    const toolCall: MCPToolCall = {
      name: "plan_approval",
      arguments: {
        approved: false,
        requestedTools: toolCalls.map((call) => call.name),
      },
    };
    const result: MCPToolResult = {
      success: false,
      content: [{ type: "text", text: "Plan approval denied." }],
      error: { code: "PERMISSION_DENIED", message: "Plan approval denied." },
      meta: {
        durationMs: duration,
        toolName: toolCall.name,
        sandboxed: false,
      },
    };

    return {
      toolCall,
      result,
      success: false,
      error: result.error ? { code: result.error.code, message: result.error.message } : undefined,
      timestamp: Date.now(),
      metadata: {
        duration,
        attemptNumber: 1,
      },
    };
  }

  private buildToolObservation(toolCalls: MCPToolCall[], turnStart: number): Observation {
    const lastToolMessage = this.getLastToolMessage();
    const toolName = lastToolMessage?.toolName ?? toolCalls[toolCalls.length - 1]?.name ?? "tool";
    const toolCall = toolCalls.find((call) => call.name === toolName) ?? {
      name: toolName,
      arguments: {},
    };
    const duration = Date.now() - turnStart;
    const result: MCPToolResult = lastToolMessage?.result ?? {
      success: false,
      content: [],
      error: { code: "EXECUTION_FAILED", message: "No tool result recorded." },
    };

    return {
      toolCall,
      result,
      success: result.success,
      error: result.error ? { code: result.error.code, message: result.error.message } : undefined,
      timestamp: Date.now(),
      metadata: {
        duration,
        attemptNumber: 1,
      },
    };
  }

  private getLastToolMessage(): ToolMessage | undefined {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const message = this.state.messages[i];
      if (message.role === "tool") {
        return message as ToolMessage;
      }
    }
    return undefined;
  }

  private getLatestToolResult(toolName: string): MCPToolResult | undefined {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const message = this.state.messages[i];
      if (message.role === "tool" && message.toolName === toolName) {
        return message.result;
      }
    }
    return undefined;
  }

  private parseCompletionPayload(args: unknown): { payload?: CompletionPayload; error?: string } {
    const validation = validateCompletionInput(args);
    if (!validation.ok) {
      return { error: validation.error.message };
    }

    return { payload: validation.value };
  }

  private validateCompletionToolCalls(toolCalls: MCPToolCall[]): {
    status: "none" | "valid" | "invalid";
    call?: MCPToolCall;
    reason?: string;
  } {
    const completionCalls = toolCalls.filter((call) => this.isCompletionToolName(call.name));
    if (completionCalls.length === 0) {
      return { status: "none" };
    }
    if (completionCalls.length > 1) {
      return {
        status: "invalid",
        reason: "Completion tool must only be called once per turn.",
      };
    }
    if (toolCalls.length > 1) {
      return {
        status: "invalid",
        reason: "Completion tool must be called alone in its turn.",
      };
    }
    return { status: "valid", call: completionCalls[0] };
  }

  private shouldEnterRecoveryTurn(): boolean {
    if (!this.config.recovery?.enabled) {
      return false;
    }
    if (this.recoveryState.warned) {
      return false;
    }
    const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;
    const graceTurns = Math.max(0, this.config.recovery.graceTurns ?? DEFAULT_RECOVERY_GRACE_TURNS);
    const threshold = Math.max(1, maxTurns - graceTurns);
    return this.state.turn >= threshold;
  }

  private beginRecoveryTurn(): void {
    const warning = this.config.recovery?.warningTemplate ?? DEFAULT_RECOVERY_WARNING_TEMPLATE;
    const graceTimeoutMs = this.config.recovery?.graceTimeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS;
    const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;
    const graceTurns = this.config.recovery?.graceTurns ?? DEFAULT_RECOVERY_GRACE_TURNS;
    const deadlineMs = Date.now() + graceTimeoutMs;

    const message: AgentMessage = {
      role: "system",
      content: warning,
    };
    this.state.messages.push(message);
    this.recordMessage(message);

    this.recoveryState = { active: true, warned: true, deadlineMs };
    this.forceCompletionToolsOnly = true;
    this.emit("recovery", {
      phase: "final_warning",
      maxTurns,
      graceTurns,
      deadlineMs,
    });
  }

  private resetRecoveryState(): void {
    this.recoveryState.active = false;
    this.recoveryState.deadlineMs = undefined;
    this.forceCompletionToolsOnly = false;
  }

  private hasCompletionTool(): boolean {
    return Boolean(this.findCompletionTool(this.registry.listTools()));
  }

  private async executeWithTimeout<T>(
    task: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([task, timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async executeTurn(): Promise<void> {
    this.state.turn++;
    this.statusController.setStatus(this.state, "thinking");
    this.emit("turn:start", { turn: this.state.turn });
    await this.ensureCheckpointReady();

    const turnStart = Date.now();
    const isRecoveryTurn = this.shouldEnterRecoveryTurn();
    const turnSpan = this.startTurnSpan();

    try {
      const outcome = await this.runTurnCycle(isRecoveryTurn, turnSpan);
      this.updateStateFromOutcome(outcome);

      if (isRecoveryTurn) {
        await this.finalizeRecoveryTurn(outcome, turnStart, turnSpan);
        return;
      }

      await this.finalizeStandardTurn(outcome, turnStart, turnSpan);
    } catch (err) {
      this.handleTurnError(err, turnSpan);
    } finally {
      this.resetRecoveryState();
      await this.recordCheckpointTurnEnd();
      this.metrics?.observe(AGENT_METRICS.turnDuration.name, Date.now() - turnStart, {});
      turnSpan?.end();
    }
  }

  private startTurnSpan(): SpanContext | undefined {
    if (!this.tracer) {
      return undefined;
    }

    return this.tracer.startSpan(`agent.turn.${this.state.turn}`, {
      attributes: { turn: this.state.turn },
    });
  }

  private async runTurnCycle(
    isRecoveryTurn: boolean,
    turnSpan?: SpanContext
  ): Promise<TurnOutcome> {
    if (isRecoveryTurn) {
      this.ensureRecoveryReady();
      this.beginRecoveryTurn();
    }

    this.startLoopCycle();

    // Model routing (Track F): Resolve model before LLM call
    const routingDecision = this.resolveModelForTurn();
    if (routingDecision) {
      this.emitRoutingDecision(routingDecision);
      turnSpan?.setAttribute("model.resolved", routingDecision.resolved);
    }

    const outcomePromise = this.turnExecutor.execute(this.state, turnSpan);
    if (!isRecoveryTurn) {
      return await outcomePromise;
    }

    return await this.executeWithTimeout(
      outcomePromise,
      this.getRecoveryTimeoutMs(),
      "Recovery timed out before completion."
    );
  }

  private resolveModelForTurn(): ModelRoutingDecision | undefined {
    if (!this.modelRouter) {
      return undefined;
    }

    const phaseContext = this.sopExecutor?.getCurrentPhase();
    return this.modelRouter.resolveForTurn({
      taskType: "agent-turn",
      risk: "medium",
      budget: { maxTokens: 4096 },
      phaseContext,
      turn: this.state.turn,
    });
  }

  private emitRoutingDecision(decision: ModelRoutingDecision): void {
    this.emit("routing:decision" as OrchestratorEventType, {
      requested: decision.requested,
      resolved: decision.resolved,
      reason: decision.reason,
      policy: decision.policy,
      turn: this.state.turn,
    });

    this.eventBus?.emit("routing:decision", decision, {
      source: "orchestrator",
      correlationId: this.currentRunId,
      priority: "normal",
    });
  }

  private ensureRecoveryReady(): void {
    if (!this.hasCompletionTool()) {
      throw new Error("Completion tool not registered for recovery.");
    }
  }

  private getRecoveryTimeoutMs(): number {
    if (this.recoveryState.deadlineMs) {
      return Math.max(0, this.recoveryState.deadlineMs - Date.now());
    }

    return DEFAULT_RECOVERY_TIMEOUT_MS;
  }

  private updateStateFromOutcome(outcome: TurnOutcome): void {
    if (outcome.compressedMessages && outcome.assistantMessage) {
      this.state.messages = [...outcome.compressedMessages, outcome.assistantMessage];
      this.recordMessage(outcome.assistantMessage);
    }

    if (outcome.usage) {
      this.accumulateUsage(outcome.usage);
    }

    const thinkingResult = this.buildThinkingResult(outcome);
    this.loopStateMachine.transitionToDecision(thinkingResult);
  }

  private async finalizeRecoveryTurn(
    outcome: TurnOutcome,
    turnStart: number,
    turnSpan?: SpanContext
  ): Promise<void> {
    await this.handleRecoveryOutcome(outcome, turnStart, turnSpan);
    this.emit("turn:end", { turn: this.state.turn });
  }

  private async finalizeStandardTurn(
    outcome: TurnOutcome,
    turnStart: number,
    turnSpan?: SpanContext
  ): Promise<void> {
    if (outcome.type === "complete") {
      throw new Error("Completion tool required for termination.");
    }

    if (outcome.type === "error") {
      throw new Error(outcome.error ?? "Unknown execution error");
    }

    if (outcome.type === "tool_use" && outcome.toolCalls) {
      const handled = await this.tryHandleCompletionToolCalls(
        outcome.toolCalls,
        turnStart,
        turnSpan
      );
      if (handled) {
        return;
      }

      await this.handleToolUseOutcome(outcome.toolCalls, turnStart, turnSpan);
    }

    this.emitTurnSuccess(turnSpan);
  }

  private async tryHandleCompletionToolCalls(
    toolCalls: MCPToolCall[],
    turnStart: number,
    turnSpan?: SpanContext
  ): Promise<boolean> {
    const completionValidation = this.validateCompletionToolCalls(toolCalls);
    if (completionValidation.status === "invalid") {
      throw new Error(completionValidation.reason ?? "Invalid completion tool call.");
    }

    if (completionValidation.status !== "valid" || !completionValidation.call) {
      return false;
    }

    await this.handleCompletionToolTurn(
      completionValidation.call,
      toolCalls,
      turnStart,
      turnSpan,
      false
    );
    this.emit("turn:end", { turn: this.state.turn });
    return true;
  }

  private async handleToolUseOutcome(
    toolCalls: MCPToolCall[],
    turnStart: number,
    turnSpan?: SpanContext
  ): Promise<void> {
    this.enforceSingleStepPolicy(toolCalls);
    const decision = this.buildDecisionForToolCalls(toolCalls);
    const shouldExecute = await this.maybeCreatePlan(toolCalls);
    if (!shouldExecute) {
      this.recordPlanRejection(decision, toolCalls, turnStart);
      throw new Error("Plan approval denied.");
    }
    this.enforceSOPToolFiltering(toolCalls);

    this.statusController.setStatus(this.state, "executing");
    this.loopStateMachine.transitionToAction(decision);
    await this.executeToolCalls(toolCalls, turnSpan);
    const observation = this.buildToolObservation(toolCalls, turnStart);
    this.loopStateMachine.transitionToObservation(observation);
    this.lastObservation = observation;
    this.loopStateMachine.completeCycle();
  }

  private recordPlanRejection(
    decision: ToolDecision,
    toolCalls: MCPToolCall[],
    turnStart: number
  ): void {
    const observation = this.buildPlanRejectionObservation(toolCalls, turnStart);
    this.loopStateMachine.transitionToAction(decision);
    this.loopStateMachine.transitionToObservation(observation);
    this.lastObservation = observation;
    this.loopStateMachine.completeCycle();
  }

  private emitTurnSuccess(turnSpan?: SpanContext): void {
    this.emit("turn:end", { turn: this.state.turn });
    this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "success" });
    turnSpan?.setStatus("ok");
  }

  private handleTurnError(err: unknown, turnSpan?: SpanContext): void {
    this.statusController.setStatus(this.state, "error");
    this.state.error = err instanceof Error ? err.message : String(err);
    this.emit("error", { error: this.state.error });
    this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "error" });
    turnSpan?.setStatus("error", this.state.error);
    this.loopStateMachine.stop();
  }

  private async handleRecoveryOutcome(
    outcome: TurnOutcome,
    turnStart: number,
    turnSpan?: SpanContext
  ): Promise<void> {
    if (outcome.type !== "tool_use" || !outcome.toolCalls) {
      throw new Error("Recovery failed: completion tool must be called.");
    }

    const validation = this.validateCompletionToolCalls(outcome.toolCalls);
    if (validation.status !== "valid" || !validation.call) {
      throw new Error(`Recovery failed: ${validation.reason ?? "completion tool must be called."}`);
    }

    await this.handleCompletionToolTurn(
      validation.call,
      outcome.toolCalls,
      turnStart,
      turnSpan,
      true
    );
  }

  private async handleCompletionToolTurn(
    completionCall: MCPToolCall,
    toolCalls: MCPToolCall[],
    turnStart: number,
    turnSpan: SpanContext | undefined,
    isRecovery: boolean
  ): Promise<boolean> {
    const decision = this.buildDecisionForToolCalls(toolCalls);
    this.statusController.setStatus(this.state, "executing");
    this.loopStateMachine.transitionToAction(decision);
    await this.executeToolCalls(toolCalls, turnSpan);
    const observation = this.buildToolObservation(toolCalls, turnStart);
    this.loopStateMachine.transitionToObservation(observation);
    this.lastObservation = observation;
    this.loopStateMachine.completeCycle();

    const result = this.getLatestToolResult(completionCall.name);
    if (!result?.success) {
      const reason = isRecovery
        ? "Recovery failed: completion tool execution failed."
        : "Completion tool execution failed.";
      throw new Error(reason);
    }

    const parsedPayload = this.parseCompletionPayload(completionCall.arguments);
    if (!parsedPayload.payload) {
      throw new Error(parsedPayload.error ?? "Completion payload missing required fields.");
    }

    this.statusController.setStatus(this.state, "complete");
    this.emitCompletion(parsedPayload.payload);
    this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "complete" });
    turnSpan?.setStatus("ok");
    return true;
  }

  private emitCompletion(payload: CompletionPayload): void {
    this.emit("completion", { ...payload });
    this.emit("complete", {
      content: payload.summary,
      summary: payload.summary,
      artifacts: payload.artifacts,
      nextSteps: payload.nextSteps,
    });
  }

  private enforceSingleStepPolicy(toolCalls: MCPToolCall[]): void {
    if (this.config.toolExecutionContext?.policy !== "interactive") {
      return;
    }

    const result = this.singleStepEnforcer.validate(toolCalls);
    if (!result.valid) {
      throw new Error(result.error ?? "Interactive policy allows a single tool call per turn.");
    }
  }

  private enforceSOPToolFiltering(toolCalls: MCPToolCall[]): void {
    if (!this.sopExecutor) {
      return;
    }

    for (const call of toolCalls) {
      // Always allow completion tools regardless of phase
      if (this.isCompletionToolName(call.name)) {
        continue;
      }

      if (!this.sopExecutor.isToolAllowed(call.name)) {
        const currentPhase = this.sopExecutor.getCurrentPhase();
        const allowedTools = this.sopExecutor.getAllowedTools();
        throw new Error(
          `SOP violation: Tool "${call.name}" is not allowed in phase "${currentPhase}". ` +
            `Allowed tools: [${allowedTools.join(", ")}]`
        );
      }
    }
  }

  /**
   * Execute tool calls with intelligent parallelization.
   *
   * Analyzes tool calls for dependencies and executes independent calls in parallel
   * while respecting the maxConcurrentCalls limit.
   */
  private async executeToolCalls(
    toolCalls: MCPToolCall[],
    parentSpan?: SpanContext
  ): Promise<void> {
    if (this.config.toolExecutionContext?.policy === "interactive") {
      await this.executeInteractiveToolCalls(toolCalls, parentSpan);
      return;
    }

    const parallelConfig = this.resolveParallelExecutionSettings();

    if (!parallelConfig.enabled || toolCalls.length <= 1) {
      await this.executeSequentialToolCalls(toolCalls, parentSpan);
      return;
    }

    const maxParallel = this.resolveMaxParallel(parallelConfig.maxConcurrent);
    await this.executeScheduledToolGroups(
      toolCalls,
      parallelConfig.maxConcurrent,
      maxParallel,
      parentSpan
    );
  }

  private async executeInteractiveToolCalls(
    toolCalls: MCPToolCall[],
    parentSpan?: SpanContext
  ): Promise<void> {
    if (toolCalls.length > 1) {
      throw new Error("Interactive policy allows a single tool call per turn.");
    }
    await this.executeSequentialToolCalls(toolCalls, parentSpan);
  }

  private async executeSequentialToolCalls(
    toolCalls: MCPToolCall[],
    parentSpan?: SpanContext
  ): Promise<void> {
    for (const call of toolCalls) {
      await this.executeSingleToolCall(call, parentSpan);
    }
  }

  private resolveParallelExecutionSettings(): ParallelExecutionConfig {
    return (
      this.config.parallelExecution ?? {
        enabled: true,
        maxConcurrent: this.config.security?.limits?.maxConcurrentCalls ?? 5,
      }
    );
  }

  private resolveMaxParallel(maxConcurrent: number): number {
    return this.config.toolExecutionContext?.maxParallel ?? maxConcurrent;
  }

  private async executeScheduledToolGroups(
    toolCalls: MCPToolCall[],
    maxConcurrent: number,
    maxParallel: number,
    parentSpan?: SpanContext
  ): Promise<void> {
    const groups = this.analyzeToolDependencies(toolCalls, parentSpan);
    const scheduledGroups = this.toolScheduler.scheduleGroups(groups);

    for (const group of scheduledGroups) {
      if (group.length === 1) {
        await this.executeSingleToolCall(group[0], parentSpan);
        continue;
      }

      const recommendedConcurrency = this.toolScheduler.recommendConcurrency(group, maxConcurrent);
      const groupConcurrency = Math.min(recommendedConcurrency, maxParallel, group.length);
      await this.executeParallelToolCalls(group, groupConcurrency, parentSpan);
    }
  }

  private async maybeCreatePlan(toolCalls: MCPToolCall[]): Promise<boolean> {
    if (!this.config.planning?.enabled) {
      return true;
    }

    await this.advanceSopToPhase("plan");

    const plan = this.buildPlan(toolCalls);
    this.emit("plan:created", plan);
    this.maybeEmitPlanArtifact(plan, toolCalls);

    if (plan.requiresApproval) {
      this.loopStateMachine.pause();
      const approval = await this.planningEngine.requestApproval(plan.id);
      this.loopStateMachine.resume();
      if (!approval.approved) {
        this.emit("plan:rejected", approval);
        return false;
      }
      this.emit("plan:approved", approval);
    }

    this.emit("plan:executing", plan);
    await this.advanceSopToPhase("implement");
    return true;
  }

  private maybeEmitPlanArtifact(plan: ExecutionPlan, toolCalls: MCPToolCall[]): void {
    if (this.planArtifactEmitted || !this.artifactPipeline) {
      return;
    }

    const artifact = this.buildPlanArtifact(plan, toolCalls);
    const result = this.emitArtifact(artifact);
    if (result.stored) {
      this.planArtifactEmitted = true;
    }
  }

  private buildPlanArtifact(plan: ExecutionPlan, toolCalls: MCPToolCall[]): ArtifactEnvelope {
    const steps = plan.steps.map((step) => {
      const status = this.mapPlanStepStatus(step.status);
      return status ? { title: step.description, status } : { title: step.description };
    });

    return {
      id: plan.id,
      type: "PlanCard",
      schemaVersion: "1.0.0",
      title: "Plan",
      payload: {
        goal: plan.goal,
        summary: plan.goal,
        steps,
        files: this.extractPlanFiles(toolCalls),
      },
      taskNodeId: this.currentPlanNodeId ?? this.currentRunId ?? "plan",
      createdAt: new Date().toISOString(),
    };
  }

  private extractPlanFiles(toolCalls: MCPToolCall[]): string[] {
    const files = new Set<string>();

    for (const call of toolCalls) {
      const args = call.arguments;
      if (!args || typeof args !== "object") {
        continue;
      }
      const path = (args as { path?: unknown }).path;
      if (typeof path === "string" && path.length > 0) {
        files.add(path);
      }
    }

    return Array.from(files);
  }

  private mapPlanStepStatus(
    status: ExecutionPlan["steps"][number]["status"]
  ): "pending" | "running" | "blocked" | "completed" | "failed" | undefined {
    switch (status) {
      case "pending":
        return "pending";
      case "executing":
        return "running";
      case "complete":
        return "completed";
      case "failed":
        return "failed";
      case "skipped":
        return "blocked";
      default:
        return undefined;
    }
  }

  private async advanceSopToPhase(targetPhase: string): Promise<void> {
    if (!this.sopExecutor) {
      return;
    }

    const phases = this.sopExecutor.getRole().phases;
    const targetIndex = phases.findIndex((phase) => phase.name === targetPhase);
    if (targetIndex < 0) {
      return;
    }

    while (this.sopExecutor.getPhaseIndex() < targetIndex) {
      const canAdvance = await this.sopExecutor.canAdvance();
      if (!canAdvance.passed) {
        return;
      }
      try {
        await this.sopExecutor.advancePhase();
      } catch {
        return;
      }
    }
  }

  private async advanceSopForArtifact(artifact: ArtifactEnvelope): Promise<void> {
    if (!this.sopExecutor) {
      return;
    }

    const currentPhase = this.sopExecutor.getCurrentPhase();

    if (artifact.type === "TestReport") {
      if (currentPhase === "implement") {
        await this.advanceSopToPhase("verify");
        return;
      }
      if (currentPhase === "verify") {
        const status = artifact.payload.status;
        if (typeof status === "string" && status === "passed") {
          await this.advanceSopToPhase("review");
        }
      }
      return;
    }

    if (artifact.type === "ReviewReport" && currentPhase === "review") {
      await this.advanceSopToPhase("complete");
    }
  }

  private buildPlan(toolCalls: MCPToolCall[]): ExecutionPlan {
    const steps = toolCalls.map((call, index) => ({
      id: `step_${index + 1}_${Date.now().toString(36)}`,
      order: index + 1,
      description: `Call ${call.name}`,
      tools: [call.name],
      expectedOutcome: `Result from ${call.name}`,
      dependencies: [],
      parallelizable: false,
    }));

    const toolsNeeded = Array.from(new Set(toolCalls.map((call) => call.name)));
    const goal = this.getLatestUserMessage() ?? "Execute tool calls";

    return this.planningEngine.createPlan({
      goal,
      steps,
      estimatedDuration: toolCalls.length * 1000,
      riskAssessment: this.assessPlanRisk(toolCalls),
      toolsNeeded,
      contextRequired: [],
      successCriteria: ["All tool calls completed"],
      requiresApproval: false,
    });
  }

  private assessPlanRisk(toolCalls: MCPToolCall[]): "low" | "medium" | "high" {
    let risk: "low" | "medium" | "high" = "low";
    for (const call of toolCalls) {
      const callRisk = this.assessRisk(call);
      if (callRisk === "high") {
        return "high";
      }
      if (callRisk === "medium") {
        risk = "medium";
      }
    }
    return risk;
  }

  private getLatestUserMessage(): string | undefined {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const message = this.state.messages[i];
      if (message.role === "user") {
        return message.content;
      }
    }
    return undefined;
  }

  /**
   * Analyze tool call dependencies to determine parallelization groups.
   *
   * Uses optimized dependency analyzer for O(n) complexity.
   */
  private analyzeToolDependencies(toolCalls: MCPToolCall[], span?: SpanContext): MCPToolCall[][] {
    const analysisStart = performance.now();
    const analysis = this.dependencyAnalyzer.analyze(toolCalls);

    this.metrics?.observe(
      AGENT_METRICS.dependencyAnalysisTime.name,
      performance.now() - analysisStart
    );
    this.metrics?.observe(AGENT_METRICS.dependencyAnalysisGroups.name, analysis.groups.length);

    if (analysis.cycles.length > 0) {
      this.metrics?.increment(AGENT_METRICS.dependencyAnalysisCycles.name);
      span?.setAttribute("dependency.cycles", analysis.cycles.length);
    }

    return analysis.groups;
  }

  /**
   * Execute multiple tool calls in parallel with concurrency limiting.
   */
  private async executeParallelToolCalls(
    calls: MCPToolCall[],
    maxConcurrent: number,
    parentSpan?: SpanContext
  ): Promise<void> {
    const parallelSpan = this.tracer?.startSpan("tools.parallel", {
      parentSpan,
      attributes: { count: calls.length, maxConcurrent },
    });

    try {
      // Use semaphore pattern for concurrency limiting
      const semaphore = new Semaphore(maxConcurrent);
      const results = await Promise.allSettled(
        calls.map(async (call) => {
          const release = await semaphore.acquire();
          try {
            await this.executeSingleToolCall(call, parallelSpan);
          } finally {
            release();
          }
        })
      );

      // Check for errors
      const errors = results.filter((r) => r.status === "rejected");
      if (errors.length > 0) {
        parallelSpan?.setStatus("error", `${errors.length} tool(s) failed`);
      } else {
        parallelSpan?.setStatus("ok");
      }
    } finally {
      parallelSpan?.end();
    }
  }

  private async executeSingleToolCall(call: MCPToolCall, parentSpan?: SpanContext): Promise<void> {
    const toolStart = Date.now();
    const toolSpan = this.tracer?.startSpan(`tool.${call.name}`, {
      parentSpan,
      attributes: { tool: call.name },
    });

    try {
      this.ensureToolCallId(call);
      await this.recordCheckpointToolCall(call);

      // Check if confirmation is required
      if (this.config.requireConfirmation && this.requiresConfirmation(call)) {
        const confirmed = await this.requestConfirmation(call);
        if (!confirmed) {
          const deniedResult = this.handleDeniedToolCall(call, toolSpan);
          await this.recordCheckpointToolResult(call, deniedResult, Date.now() - toolStart);
          return;
        }
      }

      await this.invokeToolAndRecordResult(call, toolStart, toolSpan);
    } catch (err) {
      this.recordToolException(call, err, toolSpan);
      throw err;
    } finally {
      toolSpan?.end();
    }
  }

  private accumulateUsage(usage: TokenUsageStats): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
    this.totalUsage.totalTokens += usage.totalTokens;

    this.emit("usage:update", {
      usage: { ...usage },
      totalUsage: { ...this.totalUsage },
    });
  }

  private handleDeniedToolCall(call: MCPToolCall, toolSpan?: SpanContext): MCPToolResult {
    const taskNodeId = this.taskGraphToolCalls.get(call);
    this.updateTaskGraphStatus(taskNodeId, "failed");
    const result: MCPToolResult = {
      success: false,
      content: [{ type: "text", text: "User denied the operation" }],
      error: { code: "PERMISSION_DENIED", message: "User denied the operation" },
    };
    this.addToolResult(call.name, result);
    this.metrics?.increment(AGENT_METRICS.permissionDenied.name, {
      tool_name: call.name,
      permission: "user_confirmation",
    });
    toolSpan?.setStatus("error", "User denied");
    return result;
  }

  private async invokeToolAndRecordResult(
    call: MCPToolCall,
    toolStart: number,
    toolSpan?: SpanContext
  ): Promise<void> {
    const taskNodeId = this.ensureTaskGraphToolNode(call, "running");
    this.emit("tool:calling", { toolName: call.name, arguments: call.arguments });

    if (!this.toolExecutor) {
      this.metrics?.increment(AGENT_METRICS.toolCallsTotal.name, {
        tool_name: call.name,
        status: "started",
      });
    }

    const context = this.createToolContext(call);
    const result = await this.getToolResultWithCache(call, context);

    this.emit("tool:result", { toolName: call.name, result });
    this.addToolResult(call.name, result);
    await this.recordCheckpointToolResult(call, result, Date.now() - toolStart);
    this.updateTaskGraphStatus(taskNodeId, result.success ? "completed" : "failed");

    this.recordToolMetrics(call, result, toolStart);
    this.toolScheduler.recordExecution(call.name, Date.now() - toolStart);

    toolSpan?.setAttribute("result.success", result.success);
    toolSpan?.setStatus(result.success ? "ok" : "error", result.error?.message);
  }

  private async getToolResultWithCache(
    call: MCPToolCall,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const nodeCached = this.nodeResultCache?.get(call, context);
    if (nodeCached) {
      this.emit("tool:result", { toolName: call.name, result: nodeCached, cached: true });
      return nodeCached;
    }

    // Try cache first
    let result = this.toolResultCache.get(call.name, call.arguments) as MCPToolResult | undefined;
    if (result) {
      this.emit("tool:result", { toolName: call.name, result, cached: true });
      return result;
    }

    result = await this.executeToolCall(call, context);

    if (
      !result.success &&
      result.error?.code === "PERMISSION_ESCALATION_REQUIRED" &&
      result.error
    ) {
      result = await this.attemptEscalation(call, result.error, context);
    }

    if (!result.success && result.error && this.errorRecoveryEngine) {
      result = await this.attemptRecovery(call, result.error, context);
    }

    // Cache the result
    this.toolResultCache.set(call.name, call.arguments, result);
    this.nodeResultCache?.set(call, context, result);
    return result;
  }

  private async executeToolCall(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    return this.toolExecutor
      ? await this.toolExecutor.execute(call, context)
      : await this.registry.callTool(call, context);
  }

  private async attemptRecovery(
    call: MCPToolCall,
    error: ToolError,
    context: ToolContext
  ): Promise<MCPToolResult> {
    if (!this.errorRecoveryEngine) {
      return { success: false, content: [], error };
    }

    const recovery = await this.errorRecoveryEngine.recover(call, error, async (retryCall) =>
      this.executeToolCall(retryCall, context)
    );

    return recovery.recovered && recovery.result
      ? recovery.result
      : { success: false, content: [], error };
  }

  private recordToolMetrics(call: MCPToolCall, result: MCPToolResult, toolStart: number): void {
    if (!this.toolExecutor) {
      const status = result.success ? "success" : "error";
      this.metrics?.increment(AGENT_METRICS.toolCallsTotal.name, { tool_name: call.name, status });
      this.metrics?.observe(AGENT_METRICS.toolCallDuration.name, Date.now() - toolStart, {
        tool_name: call.name,
      });
    }
  }

  private recordToolException(call: MCPToolCall, err: unknown, toolSpan?: SpanContext): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const taskNodeId = this.taskGraphToolCalls.get(call);
    this.updateTaskGraphStatus(taskNodeId, "failed");
    if (!this.toolExecutor) {
      this.metrics?.increment(AGENT_METRICS.toolCallsTotal.name, {
        tool_name: call.name,
        status: "exception",
      });
    }
    toolSpan?.setStatus("error", errorMessage);
  }

  private requiresConfirmation(call: MCPToolCall): boolean {
    if (this.toolExecutor && isToolConfirmationResolver(this.toolExecutor)) {
      return this.toolExecutor.requiresConfirmation(call, this.createToolContext(call));
    }

    const tools = this.registry.listTools();
    const tool = tools.find((t) => t.name === call.name || `${call.name}`.endsWith(`:${t.name}`));
    return tool?.annotations?.requiresConfirmation ?? false;
  }

  private getConfirmationDetails(call: MCPToolCall): {
    reason?: string;
    reasonCode?: string;
    riskTags?: string[];
  } {
    if (this.toolExecutor && isToolConfirmationDetailsProvider(this.toolExecutor)) {
      const details = this.toolExecutor.getConfirmationDetails(call, this.createToolContext(call));
      return {
        reason: details.reason,
        reasonCode: details.reasonCode,
        riskTags: details.riskTags,
      };
    }

    return {};
  }

  private async requestConfirmation(call: MCPToolCall): Promise<boolean> {
    const taskNodeId = this.ensureTaskGraphToolNode(call, "blocked");
    const confirmationDetails = this.getConfirmationDetails(call);
    const request: ConfirmationRequest = {
      toolName: call.name,
      description: `Execute ${call.name}`,
      arguments: call.arguments,
      risk: this.assessRisk(call),
      reason: confirmationDetails.reason,
      reasonCode: confirmationDetails.reasonCode,
      riskTags: confirmationDetails.riskTags,
      taskNodeId,
    };

    return this.requestUserConfirmation(request);
  }

  private async requestUserConfirmation(request: ConfirmationRequest): Promise<boolean> {
    if (!this.confirmationHandler && !this.approvalManager) {
      // No handler, default to deny
      return false;
    }

    this.statusController.setStatus(this.state, "waiting_confirmation");
    this.emit("confirmation:required", request);
    this.loopStateMachine.pause();

    const timeoutMs = this.config.toolExecutionContext?.approvalTimeoutMs;
    const decision = this.approvalManager
      ? await this.approvalManager.request(
          "tool",
          request,
          this.confirmationHandler,
          timeoutMs ? { timeoutMs } : undefined
        )
      : (() => {
          const approved = this.confirmationHandler
            ? this.confirmationHandler(request)
            : Promise.resolve(false);
          return approved.then((value) => ({
            approved: value,
            status: value ? "approved" : "rejected",
          }));
        })();

    const resolvedDecision = await Promise.resolve(decision);

    this.emit("confirmation:received", {
      confirmed: resolvedDecision.approved,
      status: resolvedDecision.status,
    });
    this.statusController.setStatus(this.state, "executing");
    this.loopStateMachine.resume();

    return resolvedDecision.approved;
  }

  private async attemptEscalation(
    call: MCPToolCall,
    error: ToolError,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const escalation = this.extractEscalation(error);
    if (!escalation) {
      return { success: false, content: [], error };
    }

    const approved = await this.requestEscalation(call, escalation);
    if (!approved) {
      this.metrics?.increment(AGENT_METRICS.permissionDenied.name, {
        tool_name: call.name,
        permission: "escalation",
      });
      return { success: false, content: [], error };
    }

    this.applyPermissionEscalation(escalation);
    return this.executeToolCall(call, { ...context, security: this.config.security });
  }

  private async requestEscalation(
    call: MCPToolCall,
    escalation: PermissionEscalation
  ): Promise<boolean> {
    const taskNodeId = this.ensureTaskGraphToolNode(call, "blocked");
    const request: ConfirmationRequest = {
      toolName: call.name,
      description: `Escalate ${escalation.permission} permission to "${escalation.level}" for ${call.name}`,
      arguments: call.arguments,
      risk: "medium",
      reason: escalation.reason ?? "Permission escalation requested",
      riskTags: ["permission:escalation"],
      taskNodeId,
      escalation,
    };

    return this.requestUserConfirmation(request);
  }

  private extractEscalation(error: ToolError): PermissionEscalation | undefined {
    const details = error.details;
    if (!details || typeof details !== "object") {
      return undefined;
    }
    const record = details as { escalation?: unknown };
    if (!record.escalation || typeof record.escalation !== "object") {
      return undefined;
    }
    const escalation = record.escalation as PermissionEscalation;
    return this.isPermissionEscalation(escalation) ? escalation : undefined;
  }

  private isPermissionEscalation(value: PermissionEscalation): boolean {
    return Boolean(value.permission && value.level);
  }

  private applyPermissionEscalation(escalation: PermissionEscalation): void {
    this.config.security = {
      ...this.config.security,
      permissions: {
        ...this.config.security.permissions,
        [escalation.permission]: escalation.level,
      },
    };
  }

  private assessRisk(call: MCPToolCall): "low" | "medium" | "high" {
    const highRiskTools = [
      "bash:execute",
      "file:delete",
      "file:write",
      "computer:click",
      "computer:keypress",
      "computer:type",
    ];
    const mediumRiskTools = ["code:run", "lfcc:delete_block", "computer:pointer_move"];

    if (highRiskTools.some((t) => call.name.includes(t))) {
      return "high";
    }
    if (mediumRiskTools.some((t) => call.name.includes(t))) {
      return "medium";
    }
    return "low";
  }

  private addToolResult(toolName: string, result: MCPToolResult): void {
    // Compress tool result if using SmartMessageCompressor
    const processedResult =
      this.messageCompressor instanceof SmartMessageCompressor
        ? this.messageCompressor.compressToolResult(result)
        : result;

    const toolMessage: AgentMessage = {
      role: "tool",
      toolName,
      result: processedResult,
    };
    this.state.messages.push(toolMessage);
    this.recordMessage(toolMessage);
  }

  private createToolContext(call?: MCPToolCall): ToolContext {
    const contextId = this.sessionState?.getContextId();
    return {
      userId: undefined, // Set from session
      sessionId: this.sessionState?.id,
      contextId,
      fileContext: this.fileContextTracker?.getHandle(contextId),
      docId: undefined, // Set from context
      correlationId: this.currentRunId,
      taskNodeId: call ? this.taskGraphToolCalls.get(call) : undefined,
      security: this.config.security,
      toolExecution: this.config.toolExecutionContext,
      signal: this.abortController?.signal,
      skills: this.skillSession
        ? {
            activeSkills: this.skillSession.getActiveSkills(),
          }
        : undefined,
      a2a: this.config.a2a,
    };
  }

  private cleanupHistory(reason: string): void {
    const cleaned = this.messageRewindManager.cleanupMessages(this.state.messages);
    if (
      cleaned.removedSummaries > 0 ||
      cleaned.removedTruncationMarkers > 0 ||
      cleaned.messages.length !== this.state.messages.length
    ) {
      this.state.messages = cleaned.messages;
      this.sessionState?.setState(this.state);
    }
    this.clearCachesOnRewind();
    this.emit("history:rewind", {
      reason,
      removedSummaries: cleaned.removedSummaries,
      removedTruncationMarkers: cleaned.removedTruncationMarkers,
      messageCount: cleaned.messages.length,
    });
    this.auditTimeTravel("history_cleanup", {
      reason,
      removedSummaries: cleaned.removedSummaries,
      removedTruncationMarkers: cleaned.removedTruncationMarkers,
      messageCount: cleaned.messages.length,
    });
  }

  private clearCachesOnRewind(): void {
    this.toolResultCache.clear();
    this.nodeResultCache?.clear();
    this.requestCache.clear();
    this.messageCompressor.clearCache();
  }

  private auditTimeTravel(action: string, payload: Record<string, unknown>, error?: string): void {
    if (!this.auditLogger) {
      return;
    }

    this.auditLogger.log({
      timestamp: Date.now(),
      toolName: `time_travel:${action}`,
      action: error ? "error" : "result",
      correlationId: this.currentRunId,
      input: payload,
      output: error ? undefined : payload,
      error,
      sandboxed: false,
    });
  }

  private getToolDefinitions(): AgentToolDefinition[] {
    const allTools = this.registry.listTools();
    let tools = this.selectToolsForPrompt(allTools);
    const completionTool = this.findCompletionTool(allTools);
    if (completionTool && !tools.some((tool) => tool.name === completionTool.name)) {
      tools = [...tools, completionTool];
    }
    if (this.forceCompletionToolsOnly) {
      tools = completionTool ? [completionTool] : [];
    }
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
    }));
  }

  private selectToolsForPrompt(tools: MCPTool[]): MCPTool[] {
    if (!this.toolDiscovery || !this.config.toolDiscovery?.enabled) {
      return tools;
    }

    const query = this.getLatestUserMessage();
    if (!query) {
      return tools;
    }

    const results = this.toolDiscovery.search({
      query,
      limit: this.config.toolDiscovery.maxResults ?? 10,
    });
    const minScore = this.config.toolDiscovery.minScore ?? 0.3;
    const selected = new Set(
      results.filter((result) => result.score >= minScore).map((result) => result.tool.name)
    );

    const filtered = tools.filter((tool) => selected.has(tool.name));
    return filtered.length > 0 ? filtered : tools;
  }

  private findCompletionTool(tools: MCPTool[]): MCPTool | undefined {
    return tools.find((tool) => this.isCompletionToolName(tool.name));
  }

  private isCompletionToolName(name: string): boolean {
    return name === COMPLETION_TOOL_NAME || name.endsWith(`:${COMPLETION_TOOL_NAME}`);
  }

  private ensureTaskGraphToolNode(call: MCPToolCall, status: TaskNodeStatus): string | undefined {
    if (!this.taskGraph) {
      return undefined;
    }

    const existing = this.taskGraphToolCalls.get(call);
    if (existing) {
      this.updateTaskGraphStatus(existing, status);
      return existing;
    }

    const node = this.taskGraph.createNode({
      type: "tool_call",
      title: `Tool: ${call.name}`,
      status,
    });
    this.taskGraphToolCalls.set(call, node.id);
    return node.id;
  }

  private updateTaskGraphStatus(nodeId: string | undefined, status: TaskNodeStatus): void {
    if (!this.taskGraph || !nodeId) {
      return;
    }

    try {
      this.taskGraph.updateNodeStatus(nodeId, status);
    } catch {
      // Avoid breaking orchestration on task graph transition errors.
    }
  }

  private emit(type: OrchestratorEventType, data: unknown): void {
    const event: OrchestratorEvent = {
      type,
      timestamp: Date.now(),
      turn: this.state.turn,
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Don't let handler errors break the orchestrator
      }
    }

    this.eventBus?.emitRaw(`orchestrator:${type}`, event, {
      source: this.config.name,
      correlationId: this.currentRunId,
      priority: "normal",
    });
  }

  private generateRunId(): string {
    return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private createPlanNode(userMessage: string): string | undefined {
    if (!this.taskGraph) {
      return undefined;
    }

    const node = this.taskGraph.createNode({
      type: "plan",
      title: userMessage,
      status: "running",
    });

    return node.id;
  }

  private finalizePlanNode(): void {
    if (!this.currentPlanNodeId) {
      return;
    }

    const status = this.state.status;
    if (status === "error") {
      this.updateTaskGraphStatus(this.currentPlanNodeId, "failed");
      return;
    }

    if (status === "waiting_confirmation") {
      this.updateTaskGraphStatus(this.currentPlanNodeId, "blocked");
      return;
    }

    if (status === "complete") {
      this.updateTaskGraphStatus(this.currentPlanNodeId, "completed");
    }
  }
}

function isToolConfirmationResolver(
  executor: ToolExecutor
): executor is ToolExecutor & ToolConfirmationResolver {
  return (
    typeof (executor as { requiresConfirmation?: unknown }).requiresConfirmation === "function"
  );
}

function isToolConfirmationDetailsProvider(
  executor: ToolExecutor
): executor is ToolExecutor & ToolConfirmationDetailsProvider {
  return (
    typeof (executor as { getConfirmationDetails?: unknown }).getConfirmationDetails === "function"
  );
}

// ============================================================================
// Tool Discovery Adapter
// ============================================================================

class RegistryToolServerAdapter implements MCPToolServer {
  readonly name = "registry";
  readonly description = "Registry-backed tool server for discovery";
  private readonly registry: IToolRegistry;

  constructor(registry: IToolRegistry) {
    this.registry = registry;
  }

  listTools(): MCPTool[] {
    return this.registry.listTools();
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    return this.registry.callTool(call, context);
  }
}

// ============================================================================
// Semaphore for Concurrency Control
// ============================================================================

/**
 * Simple semaphore for limiting concurrent operations.
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.permits--;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export interface CreateOrchestratorOptions {
  name?: string;
  systemPrompt?: string;
  security?: SecurityPolicy;
  maxTurns?: number;
  requireConfirmation?: boolean;
  telemetry?: TelemetryContext;
  /** Optional A2A routing context */
  a2a?: A2AContext;
  /** Optional runtime configuration (cache defaults, etc) */
  runtime?: RuntimeConfig;
  toolExecutionContext?: Partial<ToolExecutionContext>;
  /** Enable parallel execution of independent tool calls (default: true) */
  parallelExecution?: boolean | Partial<ParallelExecutionConfig>;
  planning?: {
    enabled?: boolean;
    requireApproval?: boolean;
    maxRefinements?: number;
    planningTimeoutMs?: number;
    autoExecuteLowRisk?: boolean;
    persistToFile?: boolean;
    workingDirectory?: string;
  };
  components?: OrchestratorComponents;
  toolExecution?: ToolExecutionOptions;
  eventBus?: RuntimeEventBus;
  planApprovalHandler?: PlanApprovalHandler;
  recovery?: {
    enabled?: boolean;
    graceTurns?: number;
    graceTimeoutMs?: number;
    warningTemplate?: string;
    hardLimit?: boolean;
  };
  toolDiscovery?: { enabled?: boolean; maxResults?: number; minScore?: number };
  skills?: {
    registry?: SkillRegistry;
    session?: SkillSession;
    promptAdapter?: SkillPromptAdapter;
  };
}

/**
 * Create an agent orchestrator with the provided dependencies.
 */
export function createOrchestrator(
  llm: IAgentLLM,
  registry: IToolRegistry,
  options: CreateOrchestratorOptions = {}
): AgentOrchestrator {
  // Resolve parallel execution config
  const parallelExecution = resolveParallelConfig(options.parallelExecution);

  const config = buildAgentConfig(options, parallelExecution);

  const permissionChecker =
    options.toolExecution?.policy ?? createPermissionChecker(config.security);
  const auditLogger = options.toolExecution?.audit ?? createAuditLogger();
  const { skillRegistry, skillSession, skillPromptAdapter } = resolveSkillComponents(
    options,
    auditLogger
  );
  const streamBridge = options.components?.streamBridge;
  const eventBus =
    options.eventBus ??
    options.components?.eventBus ??
    (streamBridge ? getGlobalEventBus() : undefined);
  const taskGraph = options.components?.taskGraph ?? createTaskGraphStore();
  const artifactPipeline =
    options.components?.artifactPipeline ??
    createArtifactPipeline({
      registry: createArtifactRegistry(),
      taskGraph,
      eventBus,
      eventSource: config.name,
    });
  const imageArtifactStore =
    options.toolExecution?.imageArtifactStore ??
    createImageArtifactStore({ pipeline: artifactPipeline });
  const executionObserver = mergeExecutionObservers(
    options.toolExecution?.executionObserver,
    taskGraph ? createTaskGraphExecutionObserver(taskGraph) : undefined,
    eventBus ? createEventBusExecutionObserver(eventBus, config.name) : undefined
  );
  const toolExecution = {
    ...(options.toolExecution ?? {}),
    executionObserver,
    imageArtifactStore,
  };
  const policyEngine = resolvePolicyEngine(
    options,
    permissionChecker,
    skillRegistry,
    config.toolExecutionContext
  );
  const toolExecutor = resolveToolExecutor(
    options,
    registry,
    permissionChecker,
    policyEngine,
    auditLogger,
    toolExecution
  );
  const runtimeCacheConfig =
    options.components?.runtimeCacheConfig ?? resolveRuntimeCacheConfig(options.runtime);
  const components: OrchestratorComponents = {
    ...options.components,
    toolExecutor,
    eventBus,
    auditLogger,
    skillRegistry,
    skillSession,
    skillPromptAdapter,
    taskGraph,
    streamBridge,
    artifactPipeline,
    runtimeCacheConfig,
  };

  const orchestrator = new AgentOrchestrator(config, llm, registry, options.telemetry, components);
  if (options.planApprovalHandler) {
    orchestrator.setPlanApprovalHandler(options.planApprovalHandler);
  }
  return orchestrator;
}

function buildAgentConfig(
  options: CreateOrchestratorOptions,
  parallelExecution: ParallelExecutionConfig
): AgentConfig {
  const security = options.security ?? DEFAULT_SECURITY;

  return {
    name: options.name ?? "agent",
    systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    security,
    toolServers: [],
    maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
    requireConfirmation: options.requireConfirmation ?? true,
    parallelExecution,
    a2a: options.a2a,
    planning: buildPlanningConfig(options.planning),
    recovery: buildRecoveryConfig(options.recovery),
    toolDiscovery: buildToolDiscoveryConfig(options.toolDiscovery),
    toolExecutionContext: options.toolExecutionContext
      ? {
          policy: options.toolExecutionContext.policy ?? "batch",
          allowedTools: options.toolExecutionContext.allowedTools ?? [],
          requiresApproval: options.toolExecutionContext.requiresApproval ?? [],
          maxParallel: options.toolExecutionContext.maxParallel ?? 1,
        }
      : undefined,
  };
}

function buildPlanningConfig(
  planning: CreateOrchestratorOptions["planning"]
): AgentConfig["planning"] {
  return {
    enabled: planning?.enabled ?? false,
    requireApproval: planning?.requireApproval ?? false,
    maxRefinements: planning?.maxRefinements,
    planningTimeoutMs: planning?.planningTimeoutMs,
    autoExecuteLowRisk: planning?.autoExecuteLowRisk,
    persistToFile: planning?.persistToFile,
    workingDirectory: planning?.workingDirectory,
  };
}

function buildToolDiscoveryConfig(
  toolDiscovery: CreateOrchestratorOptions["toolDiscovery"]
): AgentConfig["toolDiscovery"] {
  return {
    enabled: toolDiscovery?.enabled ?? false,
    maxResults: toolDiscovery?.maxResults,
    minScore: toolDiscovery?.minScore,
  };
}

function buildRecoveryConfig(
  recovery: CreateOrchestratorOptions["recovery"]
): AgentConfig["recovery"] {
  return {
    enabled: recovery?.enabled ?? false,
    graceTurns: recovery?.graceTurns ?? DEFAULT_RECOVERY_GRACE_TURNS,
    graceTimeoutMs: recovery?.graceTimeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS,
    warningTemplate: recovery?.warningTemplate ?? DEFAULT_RECOVERY_WARNING_TEMPLATE,
    hardLimit: recovery?.hardLimit ?? true,
  };
}

function resolveSkillComponents(
  options: CreateOrchestratorOptions,
  auditLogger: ReturnType<typeof createAuditLogger>
): {
  skillRegistry?: SkillRegistry;
  skillSession?: SkillSession;
  skillPromptAdapter?: SkillPromptAdapter;
} {
  const skillRegistry = options.skills?.registry ?? options.components?.skillRegistry;
  const skillSession =
    options.skills?.session ??
    options.components?.skillSession ??
    (skillRegistry ? createSkillSession(skillRegistry, auditLogger) : undefined);
  const skillPromptAdapter =
    options.skills?.promptAdapter ??
    options.components?.skillPromptAdapter ??
    (skillRegistry ? createSkillPromptAdapter() : undefined);
  return { skillRegistry, skillSession, skillPromptAdapter };
}

function resolvePolicyEngine(
  options: CreateOrchestratorOptions,
  permissionChecker: ReturnType<typeof createPermissionChecker>,
  skillRegistry: SkillRegistry | undefined,
  toolExecutionContext: ToolExecutionContext | undefined
) {
  const basePolicyEngine =
    options.toolExecution?.policyEngine ?? createToolPolicyEngine(permissionChecker);
  const skillPolicyEngine = skillRegistry
    ? createSkillPolicyGuard(basePolicyEngine, skillRegistry)
    : basePolicyEngine;
  if (!toolExecutionContext) {
    return skillPolicyEngine;
  }
  return createToolGovernancePolicyEngine(skillPolicyEngine, toolExecutionContext);
}

function resolveToolExecutor(
  options: CreateOrchestratorOptions,
  registry: IToolRegistry,
  permissionChecker: ReturnType<typeof createPermissionChecker>,
  policyEngine: ReturnType<typeof resolvePolicyEngine>,
  auditLogger: ReturnType<typeof createAuditLogger>,
  toolExecution: ToolExecutionOptions | undefined
): ToolExecutor {
  if (options.components?.toolExecutor) {
    return options.components.toolExecutor;
  }
  return createToolExecutor({
    registry,
    policy: permissionChecker,
    policyEngine,
    promptInjectionGuard: toolExecution?.promptInjectionGuard,
    promptInjectionPolicy: toolExecution?.promptInjectionPolicy,
    sandboxAdapter: toolExecution?.sandboxAdapter,
    telemetryHandler: toolExecution?.telemetryHandler,
    executionObserver: toolExecution?.executionObserver,
    audit: auditLogger,
    telemetry: toolExecution?.telemetry ?? options.telemetry,
    rateLimiter: toolExecution?.rateLimiter,
    cache: toolExecution?.cache,
    retryOptions: toolExecution?.retryOptions,
    cachePredicate: toolExecution?.cachePredicate,
    contextOverrides: toolExecution?.contextOverrides,
    outputSpooler: toolExecution?.outputSpooler,
    outputSpoolPolicy: toolExecution?.outputSpoolPolicy,
    outputSpoolingEnabled: toolExecution?.outputSpoolingEnabled,
    imageArtifactStore: toolExecution?.imageArtifactStore,
  });
}

function resolveParallelConfig(
  input?: boolean | Partial<ParallelExecutionConfig>
): ParallelExecutionConfig {
  if (input === false) {
    return { enabled: false, maxConcurrent: 1 };
  }
  if (input === true || input === undefined) {
    return { enabled: true, maxConcurrent: 5 };
  }
  return {
    enabled: input.enabled ?? true,
    maxConcurrent: input.maxConcurrent ?? 5,
  };
}

function mergeExecutionObservers(
  ...observers: Array<ToolExecutionObserver | undefined>
): ToolExecutionObserver | undefined {
  const active = observers.filter(Boolean) as ToolExecutionObserver[];
  if (active.length === 0) {
    return undefined;
  }
  return {
    onDecision: (decision, context) => {
      for (const observer of active) {
        observer.onDecision?.(decision, context);
      }
    },
    onRecord: (record, context) => {
      for (const observer of active) {
        observer.onRecord?.(record, context);
      }
    },
  };
}

function createTaskGraphExecutionObserver(taskGraph: TaskGraphStore): ToolExecutionObserver {
  return {
    onDecision: (decision) => {
      if (!decision.taskNodeId) {
        return;
      }
      taskGraph.recordNodeEvent(
        decision.taskNodeId,
        "policy_decision",
        { decision },
        {
          idempotencyKey: decision.toolCallId,
        }
      );
    },
    onRecord: (record) => {
      if (!record.taskNodeId) {
        return;
      }
      const eventType = record.status === "started" ? "tool_call_started" : "tool_call_finished";
      taskGraph.recordNodeEvent(
        record.taskNodeId,
        eventType,
        { record },
        {
          idempotencyKey: record.toolCallId,
        }
      );
    },
  };
}

function createEventBusExecutionObserver(
  eventBus: RuntimeEventBus,
  source: string
): ToolExecutionObserver {
  return {
    onDecision: (decision, context) => {
      eventBus.emit("execution:decision", decision, {
        source,
        correlationId: context.correlationId,
        priority: "normal",
      });
    },
    onRecord: (record, context) => {
      eventBus.emit("execution:record", record, {
        source,
        correlationId: context.correlationId,
        priority: "normal",
      });
    },
  };
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to various tools.
Use the tools to help the user accomplish their tasks.
Think step by step and use tools when needed.
Always explain what you're doing and why.

${AGENTS_GUIDE_PROMPT}`;

const DEFAULT_SECURITY: SecurityPolicy = {
  sandbox: {
    type: "process",
    networkAccess: "allowlist",
    fsIsolation: "workspace",
  },
  permissions: {
    bash: "sandbox",
    file: "workspace",
    code: "sandbox",
    computer: "control",
    network: "allowlist",
    lfcc: "write",
  },
  limits: {
    maxExecutionTimeMs: 120_000,
    maxMemoryBytes: 512 * 1024 * 1024,
    maxOutputBytes: 10 * 1024 * 1024,
    maxConcurrentCalls: 5,
  },
};
