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

import type { IntentRegistry } from "@ku0/core";
import { createIntentRegistry } from "@ku0/core";
import type { RuntimeEventBus } from "../events/eventBus";
import {
  type ToolConfirmationDetailsProvider,
  type ToolConfirmationResolver,
  type ToolExecutionOptions,
  type ToolExecutor,
  createToolExecutor,
} from "../executor";
import type { KnowledgeRegistry } from "../knowledge";
import { AGENTS_GUIDE_PROMPT } from "../prompts/agentGuidelines";
import { createAuditLogger, createPermissionChecker, createToolPolicyEngine } from "../security";
import type { SessionState } from "../session";
import { createSkillPolicyGuard } from "../skills/skillPolicyGuard";
import type { SkillPromptAdapter } from "../skills/skillPromptAdapter";
import { createSkillPromptAdapter } from "../skills/skillPromptAdapter";
import type { SkillRegistry } from "../skills/skillRegistry";
import type { SkillSession } from "../skills/skillSession";
import { createSkillSession } from "../skills/skillSession";
import type { TaskGraphStore, TaskNodeStatus } from "../tasks/taskGraph";
import type { IMetricsCollector, ITracer, SpanContext, TelemetryContext } from "../telemetry";
import { AGENT_METRICS } from "../telemetry";
import {
  type ToolDiscoveryEngine,
  createToolDiscoveryEngine,
} from "../tools/discovery/toolDiscovery";
import type { IToolRegistry } from "../tools/mcp/registry";
import type {
  AgentConfig,
  AgentMessage,
  AgentState,
  ConfirmationHandler,
  ConfirmationRequest,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ParallelExecutionConfig,
  SecurityPolicy,
  ToolContext,
} from "../types";
import { type DependencyAnalyzer, createDependencyAnalyzer } from "./dependencyAnalyzer";
import { type ErrorRecoveryEngine, createErrorRecoveryEngine } from "./errorRecovery";
import { type MessageCompressor, createMessageCompressor } from "./messageCompression";
import {
  type ExecutionPlan,
  type PlanApprovalHandler,
  type PlanningEngine,
  createPlanningEngine,
} from "./planning";
import { type RequestCache, createRequestCache } from "./requestCache";
import { type ITurnExecutor, createTurnExecutor } from "./turnExecutor";

// ============================================================================
// LLM Interface (for dependency injection)
// ============================================================================

/**
 * Interface for LLM completion.
 * Implement this to connect to your LLM provider.
 */
export interface IAgentLLM {
  /** Generate a completion with tool use support */
  complete(request: AgentLLMRequest): Promise<AgentLLMResponse>;

  /** Stream a completion (optional) */
  stream?(request: AgentLLMRequest): AsyncIterable<AgentLLMChunk>;
}

export interface AgentLLMRequest {
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentLLMResponse {
  content: string;
  toolCalls?: MCPToolCall[];
  finishReason: "stop" | "tool_use" | "max_tokens" | "error";
}

export interface AgentLLMChunk {
  type: "content" | "tool_call" | "done";
  content?: string;
  toolCall?: MCPToolCall;
}

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
  | "error"
  | "complete";

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  turn: number;
  data: unknown;
}

export type OrchestratorEventHandler = (event: OrchestratorEvent) => void;

export interface OrchestratorComponents {
  messageCompressor?: MessageCompressor;
  requestCache?: RequestCache;
  dependencyAnalyzer?: DependencyAnalyzer;
  planningEngine?: PlanningEngine;
  toolExecutor?: ToolExecutor;
  eventBus?: RuntimeEventBus;
  sessionState?: SessionState;
  errorRecoveryEngine?: ErrorRecoveryEngine;
  toolDiscovery?: ToolDiscoveryEngine;
  /** Intent registry for tracking AI edit intents */
  intentRegistry?: IntentRegistry;
  /** Knowledge registry for scoped knowledge injection */
  knowledgeRegistry?: KnowledgeRegistry;
  /** Skill registry for Agent Skills */
  skillRegistry?: SkillRegistry;
  /** Skill session tracking active skills */
  skillSession?: SkillSession;
  /** Skill prompt adapter for available skills injection */
  skillPromptAdapter?: SkillPromptAdapter;
  /** Optional task graph for event-sourced task tracking */
  taskGraph?: TaskGraphStore;
}

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
  private readonly dependencyAnalyzer: DependencyAnalyzer;
  private readonly planningEngine: PlanningEngine;
  private readonly turnExecutor: ITurnExecutor;
  private readonly toolExecutor?: ToolExecutor;
  private readonly eventBus?: RuntimeEventBus;
  private readonly sessionState?: SessionState;
  private readonly errorRecoveryEngine?: ErrorRecoveryEngine;
  private readonly toolDiscovery?: ToolDiscoveryEngine;
  private readonly intentRegistry?: IntentRegistry;
  private readonly knowledgeRegistry?: KnowledgeRegistry;
  private readonly skillRegistry?: SkillRegistry;
  private readonly skillSession?: SkillSession;
  private readonly skillPromptAdapter?: SkillPromptAdapter;
  private readonly taskGraph?: TaskGraphStore;
  private currentRunId?: string;
  private readonly taskGraphToolCalls = new WeakMap<MCPToolCall, string>();

  private state: AgentState;
  private confirmationHandler?: ConfirmationHandler;
  private planApprovalHandler?: PlanApprovalHandler;
  private abortController?: AbortController;
  private currentPlan?: ExecutionPlan;

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
    this.state = this.resolveInitialState();
    this.toolExecutor = components.toolExecutor;
    this.eventBus = components.eventBus;
    this.errorRecoveryEngine =
      components.errorRecoveryEngine ??
      (config.recovery?.enabled ? createErrorRecoveryEngine() : undefined);
    this.toolDiscovery =
      components.toolDiscovery ??
      (config.toolDiscovery?.enabled ? createToolDiscoveryEngine() : undefined);
    if (this.toolDiscovery) {
      this.toolDiscovery.registerServer(new RegistryToolServerAdapter(this.registry));
    }

    // Initialize performance optimizations
    this.messageCompressor =
      components.messageCompressor ??
      createMessageCompressor({
        maxTokens: 8000,
        strategy: "hybrid",
        preserveCount: 3,
        estimateTokens: (text) => Math.ceil(text.length / 4),
      });

    this.requestCache =
      components.requestCache ??
      createRequestCache({
        enabled: true,
        ttlMs: 300000, // 5 minutes
        maxSize: 1000,
      });

    this.dependencyAnalyzer = components.dependencyAnalyzer ?? createDependencyAnalyzer();

    this.planningEngine =
      components.planningEngine ??
      createPlanningEngine({
        enabled: config.planning?.enabled ?? false,
        requireApproval: config.planning?.requireApproval ?? false,
        maxRefinements: config.planning?.maxRefinements,
        planningTimeoutMs: config.planning?.planningTimeoutMs,
        autoExecuteLowRisk: config.planning?.autoExecuteLowRisk,
      });

    // Initialize knowledge registry for scoped knowledge injection
    this.intentRegistry = components.intentRegistry ?? createIntentRegistry();
    this.knowledgeRegistry = components.knowledgeRegistry;
    this.skillRegistry = components.skillRegistry;
    this.skillSession = components.skillSession;
    this.skillPromptAdapter = components.skillPromptAdapter;
    this.taskGraph = components.taskGraph;

    this.turnExecutor = createTurnExecutor({
      llm: this.llm,
      messageCompressor: this.messageCompressor,
      requestCache: this.requestCache,
      knowledgeRegistry: this.knowledgeRegistry,
      skillRegistry: this.skillRegistry,
      skillPromptAdapter: this.skillPromptAdapter,
      metrics: this.metrics,
      getToolDefinitions: () => this.getToolDefinitions(),
    });
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

  private async runWithId(userMessage: string, runId: string): Promise<AgentState> {
    this.abortController = new AbortController();
    this.currentRunId = runId;

    // Add user message
    const userMsg: AgentMessage = { role: "user", content: userMessage };
    this.state.messages.push(userMsg);
    this.recordMessage(userMsg);
    this.metrics?.gauge(AGENT_METRICS.activeAgents.name, 1, {});

    try {
      // Run the agentic loop
      while (this.shouldContinue()) {
        await this.executeTurn();
      }
    } finally {
      this.metrics?.gauge(AGENT_METRICS.activeAgents.name, 0, {});
    }

    return this.state;
  }

  /**
   * Run the agent with streaming events.
   * Yields events as they occur during execution.
   */
  async *runStream(userMessage: string): AsyncGenerator<OrchestratorEvent, AgentState, void> {
    const events: OrchestratorEvent[] = [];
    let resolveNext: ((event: OrchestratorEvent) => void) | null = null;

    // Capture events
    const unsubscribe = this.on((event) => {
      if (resolveNext) {
        resolveNext(event);
        resolveNext = null;
      } else {
        events.push(event);
      }
    });

    // Start execution in background
    const runPromise = this.run(userMessage);

    try {
      // Yield events as they come
      while (this.state.status !== "complete" && this.state.status !== "error") {
        if (events.length > 0) {
          const event = events.shift();
          if (event) {
            yield event;
          }
        } else {
          // Wait for next event or completion
          const nextEvent = await Promise.race([
            new Promise<OrchestratorEvent>((resolve) => {
              resolveNext = resolve;
            }),
            runPromise.then(() => null as OrchestratorEvent | null),
          ]);
          if (nextEvent) {
            yield nextEvent;
          }
        }
      }

      // Yield remaining events
      for (const event of events) {
        yield event;
      }

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

    this.state.status = "executing";
    while (this.shouldContinue()) {
      await this.executeTurn();
    }

    return this.state;
  }

  /**
   * Stop the agent execution.
   */
  stop(): void {
    this.abortController?.abort();
    this.state.status = "complete";
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
    this.planApprovalHandler = handler;
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

  private recordMessage(message: AgentMessage): void {
    this.sessionState?.recordMessage(message);
    this.sessionState?.setState(this.state);
  }

  private shouldContinue(): boolean {
    const maxTurns = this.config.maxTurns ?? 50;

    return (
      this.state.status !== "complete" &&
      this.state.status !== "error" &&
      this.state.status !== "waiting_confirmation" &&
      this.state.turn < maxTurns &&
      !this.abortController?.signal.aborted
    );
  }

  private async executeTurn(): Promise<void> {
    this.state.turn++;
    this.state.status = "thinking";
    this.emit("turn:start", { turn: this.state.turn });

    const turnStart = Date.now();
    let turnSpan: SpanContext | undefined;

    if (this.tracer) {
      turnSpan = this.tracer.startSpan(`agent.turn.${this.state.turn}`, {
        attributes: { turn: this.state.turn },
      });
    }

    try {
      const outcome = await this.turnExecutor.execute(this.state, turnSpan);

      // Emit thinking event (TurnExecutor doesn't emit events)
      if (outcome.response?.content) {
        this.emit("thinking", { content: outcome.response.content });
      }

      // Update state with used messages and new assistant message
      if (outcome.compressedMessages && outcome.assistantMessage) {
        // Create new history from compressed messages + new assistant message
        this.state.messages = [...outcome.compressedMessages, outcome.assistantMessage];
        this.recordMessage(outcome.assistantMessage);
      }

      // Handle outcome
      if (outcome.type === "complete") {
        this.state.status = "complete";
        this.emit("complete", { content: outcome.response?.content });
        this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "complete" });
        turnSpan?.setStatus("ok");
        return;
      }

      if (outcome.type === "tool_use" && outcome.toolCalls) {
        this.state.status = "executing";
        const shouldExecute = await this.maybeCreatePlan(outcome.toolCalls);
        if (!shouldExecute) {
          this.emit("turn:end", { turn: this.state.turn });
          this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "success" });
          turnSpan?.setStatus("ok");
          return;
        }
        await this.executeToolCalls(outcome.toolCalls, turnSpan);
      } else if (outcome.type === "error") {
        throw new Error(outcome.error ?? "Unknown execution error");
      }

      this.emit("turn:end", { turn: this.state.turn });
      this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "success" });
      turnSpan?.setStatus("ok");
    } catch (err) {
      this.state.status = "error";
      this.state.error = err instanceof Error ? err.message : String(err);
      this.emit("error", { error: this.state.error });
      this.metrics?.increment(AGENT_METRICS.turnsTotal.name, { status: "error" });
      turnSpan?.setStatus("error", this.state.error);
    } finally {
      this.metrics?.observe(AGENT_METRICS.turnDuration.name, Date.now() - turnStart, {});
      turnSpan?.end();
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
    const parallelConfig = this.config.parallelExecution ?? {
      enabled: true,
      maxConcurrent: this.config.security?.limits?.maxConcurrentCalls ?? 5,
    };

    if (!parallelConfig.enabled || toolCalls.length <= 1) {
      // Sequential execution
      for (const call of toolCalls) {
        await this.executeSingleToolCall(call, parentSpan);
      }
      return;
    }

    // Analyze dependencies and group independent calls
    const groups = this.analyzeToolDependencies(toolCalls, parentSpan);

    // Execute groups sequentially, but calls within each group in parallel
    for (const group of groups) {
      if (group.length === 1) {
        await this.executeSingleToolCall(group[0], parentSpan);
      } else {
        // Execute group in parallel with concurrency limit
        await this.executeParallelToolCalls(group, parallelConfig.maxConcurrent, parentSpan);
      }
    }
  }

  private async maybeCreatePlan(toolCalls: MCPToolCall[]): Promise<boolean> {
    if (!this.config.planning?.enabled) {
      return true;
    }

    const plan = this.buildPlan(toolCalls);
    this.currentPlan = plan;
    this.emit("plan:created", plan);

    if (plan.requiresApproval) {
      const approval = await this.planningEngine.requestApproval(plan.id);
      if (!approval.approved) {
        this.emit("plan:rejected", approval);
        this.state.status = "complete";
        return false;
      }
      this.emit("plan:approved", approval);
    }

    this.emit("plan:executing", plan);
    return true;
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
      // Check if confirmation is required
      if (this.config.requireConfirmation && this.requiresConfirmation(call)) {
        const confirmed = await this.requestConfirmation(call);
        if (!confirmed) {
          this.handleDeniedToolCall(call, toolSpan);
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

  private handleDeniedToolCall(call: MCPToolCall, toolSpan?: SpanContext): void {
    const taskNodeId = this.taskGraphToolCalls.get(call);
    this.updateTaskGraphStatus(taskNodeId, "failed");
    this.addToolResult(call.name, {
      success: false,
      content: [{ type: "text", text: "User denied the operation" }],
      error: { code: "PERMISSION_DENIED", message: "User denied the operation" },
    });
    this.metrics?.increment(AGENT_METRICS.permissionDenied.name, {
      tool_name: call.name,
      permission: "user_confirmation",
    });
    toolSpan?.setStatus("error", "User denied");
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
    let result = this.toolExecutor
      ? await this.toolExecutor.execute(call, context)
      : await this.registry.callTool(call, context);

    if (!result.success && result.error && this.errorRecoveryEngine) {
      const recovery = await this.errorRecoveryEngine.recover(
        call,
        result.error,
        async (retryCall) =>
          this.toolExecutor
            ? this.toolExecutor.execute(retryCall, context)
            : this.registry.callTool(retryCall, context)
      );

      if (recovery.recovered && recovery.result) {
        result = recovery.result;
      }
    }

    this.emit("tool:result", { toolName: call.name, result });
    this.addToolResult(call.name, result);
    this.updateTaskGraphStatus(taskNodeId, result.success ? "completed" : "failed");

    // Record metrics when no executor is provided
    if (!this.toolExecutor) {
      const status = result.success ? "success" : "error";
      this.metrics?.increment(AGENT_METRICS.toolCallsTotal.name, { tool_name: call.name, status });
      this.metrics?.observe(AGENT_METRICS.toolCallDuration.name, Date.now() - toolStart, {
        tool_name: call.name,
      });
    }

    toolSpan?.setAttribute("result.success", result.success);
    toolSpan?.setStatus(result.success ? "ok" : "error", result.error?.message);
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

  private getConfirmationDetails(call: MCPToolCall): { reason?: string; riskTags?: string[] } {
    if (this.toolExecutor && isToolConfirmationDetailsProvider(this.toolExecutor)) {
      const details = this.toolExecutor.getConfirmationDetails(call, this.createToolContext(call));
      return {
        reason: details.reason,
        riskTags: details.riskTags,
      };
    }

    return {};
  }

  private async requestConfirmation(call: MCPToolCall): Promise<boolean> {
    if (!this.confirmationHandler) {
      // No handler, default to deny
      return false;
    }

    const taskNodeId = this.ensureTaskGraphToolNode(call, "blocked");
    const confirmationDetails = this.getConfirmationDetails(call);
    const request: ConfirmationRequest = {
      toolName: call.name,
      description: `Execute ${call.name}`,
      arguments: call.arguments,
      risk: this.assessRisk(call),
      reason: confirmationDetails.reason,
      riskTags: confirmationDetails.riskTags,
      taskNodeId,
    };

    this.state.status = "waiting_confirmation";
    this.emit("confirmation:required", request);

    const confirmed = await this.confirmationHandler(request);

    this.emit("confirmation:received", { confirmed });
    this.state.status = "executing";

    return confirmed;
  }

  private assessRisk(call: MCPToolCall): "low" | "medium" | "high" {
    const highRiskTools = ["bash:execute", "file:delete", "file:write"];
    const mediumRiskTools = ["code:run", "lfcc:delete_block"];

    if (highRiskTools.some((t) => call.name.includes(t))) {
      return "high";
    }
    if (mediumRiskTools.some((t) => call.name.includes(t))) {
      return "medium";
    }
    return "low";
  }

  private addToolResult(toolName: string, result: MCPToolResult): void {
    const toolMessage: AgentMessage = {
      role: "tool",
      toolName,
      result,
    };
    this.state.messages.push(toolMessage);
    this.recordMessage(toolMessage);
  }

  private createToolContext(call?: MCPToolCall): ToolContext {
    return {
      userId: undefined, // Set from session
      sessionId: this.sessionState?.id,
      docId: undefined, // Set from context
      correlationId: this.currentRunId,
      taskNodeId: call ? this.taskGraphToolCalls.get(call) : undefined,
      security: this.config.security,
      signal: this.abortController?.signal,
      skills: this.skillSession
        ? {
            activeSkills: this.skillSession.getActiveSkills(),
          }
        : undefined,
    };
  }

  private getToolDefinitions(): AgentToolDefinition[] {
    const tools = this.selectToolsForPrompt(this.registry.listTools());
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
  /** Enable parallel execution of independent tool calls (default: true) */
  parallelExecution?: boolean | Partial<ParallelExecutionConfig>;
  planning?: {
    enabled?: boolean;
    requireApproval?: boolean;
    maxRefinements?: number;
    planningTimeoutMs?: number;
    autoExecuteLowRisk?: boolean;
  };
  components?: OrchestratorComponents;
  toolExecution?: ToolExecutionOptions;
  eventBus?: RuntimeEventBus;
  planApprovalHandler?: PlanApprovalHandler;
  recovery?: { enabled?: boolean };
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
  const policyEngine = resolvePolicyEngine(options, permissionChecker, skillRegistry);
  const toolExecutor = resolveToolExecutor(
    options,
    registry,
    permissionChecker,
    policyEngine,
    auditLogger
  );

  const components: OrchestratorComponents = {
    ...options.components,
    toolExecutor,
    eventBus: options.eventBus ?? options.components?.eventBus,
    skillRegistry,
    skillSession,
    skillPromptAdapter,
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
  return {
    name: options.name ?? "agent",
    systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    security: options.security ?? DEFAULT_SECURITY,
    toolServers: [],
    maxTurns: options.maxTurns ?? 50,
    requireConfirmation: options.requireConfirmation ?? true,
    parallelExecution,
    planning: buildPlanningConfig(options.planning),
    recovery: { enabled: options.recovery?.enabled ?? false },
    toolDiscovery: buildToolDiscoveryConfig(options.toolDiscovery),
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
  skillRegistry: SkillRegistry | undefined
) {
  const basePolicyEngine =
    options.toolExecution?.policyEngine ?? createToolPolicyEngine(permissionChecker);
  return skillRegistry ? createSkillPolicyGuard(basePolicyEngine, skillRegistry) : basePolicyEngine;
}

function resolveToolExecutor(
  options: CreateOrchestratorOptions,
  registry: IToolRegistry,
  permissionChecker: ReturnType<typeof createPermissionChecker>,
  policyEngine: ReturnType<typeof resolvePolicyEngine>,
  auditLogger: ReturnType<typeof createAuditLogger>
): ToolExecutor {
  if (options.components?.toolExecutor) {
    return options.components.toolExecutor;
  }
  return createToolExecutor({
    registry,
    policy: permissionChecker,
    policyEngine,
    sandboxAdapter: options.toolExecution?.sandboxAdapter,
    telemetryHandler: options.toolExecution?.telemetryHandler,
    audit: auditLogger,
    telemetry: options.toolExecution?.telemetry ?? options.telemetry,
    rateLimiter: options.toolExecution?.rateLimiter,
    cache: options.toolExecution?.cache,
    retryOptions: options.toolExecution?.retryOptions,
    cachePredicate: options.toolExecution?.cachePredicate,
    contextOverrides: options.toolExecution?.contextOverrides,
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
