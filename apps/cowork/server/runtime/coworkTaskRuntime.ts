import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
  AgentModeManager,
  type ConfirmationRequest,
  type CoworkRiskTag,
  type CoworkSession,
  type CoworkTask,
  type CoworkTaskStatus,
  type CoworkTaskSummary,
  createAICoreAdapter,
  createBashToolServer,
  createCodeToolServer,
  createCoworkRuntime,
  createFileToolServer,
  createToolRegistry,
  createWebSearchToolServer,
  formatToolActivityLabel,
  isPathWithinRoots,
  resolveToolActivity,
  type TaskType,
  type TokenUsageStats,
} from "@ku0/agent-runtime";
import {
  AnthropicProvider,
  type CompletionRequest,
  type CompletionResponse,
  GeminiProvider,
  getModelCapability,
  type LLMProvider,
  normalizeModelId,
  OpenAIProvider,
  ProviderRouter,
  resolveProviderFromEnv,
  type StreamChunk,
  TokenTracker,
  type Tool,
} from "@ku0/ai-core";
import { analyzeProject, createProjectContext, generateAgentsMd } from "@ku0/project-context";
import {
  DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET,
  isRecord,
  MAX_ARTIFACT_BYTES,
  PREVIEWABLE_EXTENSIONS,
} from "@ku0/shared";
import { ApprovalService } from "../services/approvalService";
import type { StorageLayer } from "../storage/contracts";
import type {
  CoworkApproval,
  CoworkArtifactPayload,
  CoworkAuditEntry,
  CoworkSettings,
} from "../storage/types";
import { COWORK_EVENTS, type SessionEventHub } from "../streaming/eventHub";
import { SmartProviderRouter } from "./smartProviderRouter";
import { createWebSearchProvider } from "./webSearchProvider";

type Logger = Pick<Console, "info" | "warn" | "error">;

type ProviderLike = Pick<LLMProvider, "complete" | "stream">;

type SessionRuntime = {
  sessionId: string;
  runtime: ReturnType<typeof createCoworkRuntime>;
  activeTaskId: string | null;
  modelId: string | null;
  providerId: string | null;
  fallbackNotice: string | null;
  unsubscribeQueue: () => void;
  unsubscribeOrchestrator: () => void;
};

type RuntimeFactory = (
  session: CoworkSession,
  settings: CoworkSettings
) => Promise<ReturnType<typeof createCoworkRuntime>>;

const noop = () => undefined;
const tokenTracker = new TokenTracker();

export class CoworkTaskRuntime {
  private readonly storage: StorageLayer;
  private readonly events: SessionEventHub;
  private readonly logger: Logger;
  private readonly approvalService: ApprovalService;
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly runtimeFactory?: RuntimeFactory;
  private taskWriteQueue: Promise<void> = Promise.resolve();

  constructor(deps: {
    storage: StorageLayer;
    events: SessionEventHub;
    logger?: Logger;
    runtimeFactory?: RuntimeFactory;
    approvalService?: ApprovalService;
  }) {
    this.storage = deps.storage;
    this.events = deps.events;
    this.logger = deps.logger ?? console;
    this.runtimeFactory = deps.runtimeFactory;
    this.approvalService = deps.approvalService ?? new ApprovalService();
  }

  async enqueueTask(
    session: CoworkSession,
    payload: { prompt: string; title?: string; modelId?: string }
  ) {
    const runtime = await this.getOrCreateRuntime(session, { prompt: payload.prompt });
    const taskId = await runtime.runtime.enqueueTask(payload.prompt, payload.title);
    const now = Date.now();
    const task: CoworkTask = {
      taskId,
      sessionId: session.sessionId,
      title: payload.title ?? "Cowork Task",
      prompt: payload.prompt,
      status: "queued",
      modelId: payload.modelId ?? runtime.modelId ?? undefined,
      providerId: runtime.providerId ?? undefined,
      fallbackNotice: runtime.fallbackNotice ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    await this.enqueueTaskWrite(async () => {
      await this.storage.taskStore.create(task);
      await this.touchSession(session.sessionId);
    });
    this.events.publish(session.sessionId, COWORK_EVENTS.TASK_CREATED, {
      taskId,
      status: task.status,
      title: task.title,
      prompt: task.prompt,
      modelId: task.modelId,
      providerId: task.providerId,
      fallbackNotice: task.fallbackNotice,
    });
    return task;
  }

  async resolveApproval(
    approvalId: string,
    status: "approved" | "rejected"
  ): Promise<CoworkApproval | null> {
    const updated = await this.storage.approvalStore.update(approvalId, (approval) => ({
      ...approval,
      status,
      resolvedAt: Date.now(),
    }));

    if (!updated) {
      return null;
    }

    this.events.publish(updated.sessionId, COWORK_EVENTS.APPROVAL_RESOLVED, {
      approvalId: updated.approvalId,
      status: updated.status,
      taskId: updated.taskId,
    });
    this.approvalService.resolveApproval(approvalId, status);

    return updated;
  }

  private async getOrCreateRuntime(
    session: CoworkSession,
    selectionHint?: { prompt?: string }
  ): Promise<SessionRuntime> {
    const existing = this.runtimes.get(session.sessionId);
    const settings = await this.storage.configStore.get();
    const requestedModel = normalizeModelId(settings.defaultModel ?? undefined) ?? null;

    if (existing) {
      if (!existing.activeTaskId && requestedModel && requestedModel !== existing.modelId) {
        this.detachRuntime(existing);
        this.runtimes.delete(session.sessionId);
      } else {
        return existing;
      }
    }

    const runtimeCore = this.runtimeFactory
      ? { runtime: await this.runtimeFactory(session, settings), providerInfo: null }
      : await this.createRuntimeCore(session, settings, selectionHint);
    const created = this.attachRuntime(session, runtimeCore.runtime);
    created.modelId = runtimeCore.providerInfo?.modelId ?? requestedModel;
    created.providerId = runtimeCore.providerInfo?.providerId ?? null;
    created.fallbackNotice = runtimeCore.providerInfo?.fallbackNotice ?? null;
    this.runtimes.set(session.sessionId, created);
    return created;
  }

  private async createRuntimeCore(
    session: CoworkSession,
    settings: CoworkSettings,
    selectionHint?: { prompt?: string }
  ): Promise<{
    runtime: ReturnType<typeof createCoworkRuntime>;
    providerInfo: {
      modelId: string | null;
      providerId: string;
      fallbackNotice?: string;
    };
  }> {
    const { provider, model, providerId, fallbackNotice } = createCoworkProvider(
      settings,
      this.logger,
      selectionHint
    );
    const llm = createAICoreAdapter(provider, { model });

    const registry = createToolRegistry();
    await registry.register(createBashToolServer());
    await registry.register(createFileToolServer());
    await registry.register(createCodeToolServer());
    await registry.register(createWebSearchToolServer(createWebSearchProvider(this.logger)));

    // Load project context for system prompt injection
    const projectContext = await this.loadProjectContext(session);

    // Get mode-specific system prompt addition
    const modeManager = new AgentModeManager(session.agentMode ?? "build");
    const modePrompt = modeManager.getSystemPromptAddition();

    // Combine project context and mode prompt
    const systemPromptAddition = combinePromptAdditions(projectContext, modePrompt);

    const outputRoots = collectOutputRoots(session);
    return {
      runtime: createCoworkRuntime({
        llm,
        registry,
        cowork: { session },
        taskQueueConfig: { maxConcurrent: 1 },
        outputRoots,
        systemPromptAddition,
      }),
      providerInfo: {
        modelId: model ?? null,
        providerId,
        fallbackNotice,
      },
    };
  }

  /**
   * Load project context from AGENTS.md or generate from project analysis
   */
  private async loadProjectContext(session: CoworkSession): Promise<string | undefined> {
    const rootPath = session.grants[0]?.rootPath;
    if (!rootPath) {
      return undefined;
    }

    try {
      // Try to read existing AGENTS.md from .cowork directory
      const agentsMdPath = `${rootPath}/.cowork/AGENTS.md`;
      try {
        const content = await readFile(agentsMdPath, "utf-8");
        return truncateToTokenBudget(content, DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET);
      } catch {
        // AGENTS.md doesn't exist, generate from analysis
      }

      // Analyze project and generate context
      const analysis = await analyzeProject(rootPath, { maxDepth: 2 });
      const context = createProjectContext(analysis);
      const content = generateAgentsMd(context, { includePatterns: false });
      return truncateToTokenBudget(content, DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET);
    } catch (error) {
      this.logger.warn("Failed to load project context", error);
      return undefined;
    }
  }

  private attachRuntime(session: CoworkSession, runtime: ReturnType<typeof createCoworkRuntime>) {
    const runtimeState: SessionRuntime = {
      sessionId: session.sessionId,
      runtime,
      activeTaskId: null,
      modelId: null,
      providerId: null,
      fallbackNotice: null,
      unsubscribeQueue: noop,
      unsubscribeOrchestrator: noop,
    };

    runtime.orchestrator.setConfirmationHandler((request) =>
      this.handleConfirmation(runtimeState, request)
    );

    runtimeState.unsubscribeQueue = runtime.onCoworkEvents((event) => {
      void this.handleTaskEvent(runtimeState, event).catch((error) => {
        this.logger.error("Failed to handle task event", error);
      });
    });

    runtimeState.unsubscribeOrchestrator = runtime.orchestrator.on((event) => {
      void this.handleOrchestratorEvent(runtimeState, event).catch((error) => {
        this.logger.error("Failed to handle orchestrator event", error);
      });
    });

    return runtimeState;
  }

  private detachRuntime(runtimeState: SessionRuntime) {
    runtimeState.unsubscribeQueue();
    runtimeState.unsubscribeOrchestrator();
  }

  private async handleConfirmation(runtime: SessionRuntime, request: ConfirmationRequest) {
    const approvalId = crypto.randomUUID();
    const approval = {
      approvalId,
      sessionId: runtime.sessionId,
      taskId: runtime.activeTaskId ?? undefined,
      action: request.description,
      riskTags: normalizeRiskTags(request.riskTags),
      reason: request.reason,
      status: "pending" as const,
      createdAt: Date.now(),
    };
    await this.storage.approvalStore.create(approval);
    this.events.publish(runtime.sessionId, COWORK_EVENTS.APPROVAL_REQUIRED, {
      approvalId,
      action: approval.action,
      riskTags: approval.riskTags,
      reason: approval.reason,
      taskId: runtime.activeTaskId ?? undefined,
    });

    void this.logAuditEntry({
      entryId: crypto.randomUUID(),
      sessionId: runtime.sessionId,
      taskId: runtime.activeTaskId ?? undefined,
      timestamp: Date.now(),
      action: "approval_requested",
      toolName: request.toolName,
      riskTags: normalizeRiskTags(request.riskTags),
      reason: request.reason,
    });

    if (runtime.activeTaskId) {
      void this.updateTaskStatus(runtime.activeTaskId, "awaiting_confirmation");
    }

    const decision = await this.waitForApprovalDecision(runtime.sessionId, approvalId);

    void this.logAuditEntry({
      entryId: crypto.randomUUID(),
      sessionId: runtime.sessionId,
      taskId: runtime.activeTaskId ?? undefined,
      timestamp: Date.now(),
      action: "approval_resolved",
      toolName: request.toolName,
      decision: decision === "approved" ? "allow" : "deny",
      outcome: decision === "approved" ? "success" : "denied",
    });

    if (runtime.activeTaskId) {
      void this.updateTaskStatus(runtime.activeTaskId, "running");
    }
    return decision === "approved";
  }

  private async handleTaskEvent(
    runtime: SessionRuntime,
    event: { type: string; taskId: string; data?: Record<string, unknown> }
  ) {
    await this.ensureTaskRecord(runtime, event.taskId, event.data);
    switch (event.type) {
      case "task.queued":
        await this.updateTaskStatus(event.taskId, "queued");
        break;
      case "task.running":
        runtime.activeTaskId = event.taskId;
        await this.updateTaskStatus(event.taskId, "running");
        break;
      case "task.completed":
        await this.handleTaskCompleted(runtime, event.taskId, event.data);
        break;
      case "task.failed":
        await this.updateTaskStatus(event.taskId, "failed");
        runtime.activeTaskId = runtime.activeTaskId === event.taskId ? null : runtime.activeTaskId;
        break;
      case "task.cancelled":
        await this.updateTaskStatus(event.taskId, "cancelled");
        runtime.activeTaskId = runtime.activeTaskId === event.taskId ? null : runtime.activeTaskId;
        break;
      default:
        break;
    }
  }

  private async handleTaskCompleted(
    runtime: SessionRuntime,
    taskId: string,
    data?: Record<string, unknown>
  ) {
    await this.updateTaskStatus(taskId, "completed");
    runtime.activeTaskId = runtime.activeTaskId === taskId ? null : runtime.activeTaskId;
    const summary = extractTaskSummary(data);
    const reportContent = summary && !isSummaryEmpty(summary) ? formatSummary(summary) : null;
    const fallbackContent = extractResultContent(data);
    const session = await this.storage.sessionStore.getById(runtime.sessionId);
    const artifactRoots = session ? collectArtifactRoots(session) : [];
    const outputArtifacts = summary
      ? await buildOutputArtifacts(summary, artifactRoots, taskId)
      : [];
    const content = normalizeArtifactContent(
      outputArtifacts.length > 0 ? null : (fallbackContent ?? reportContent)
    );
    if (content) {
      const { updatedAt } = await this.persistArtifact(runtime.sessionId, {
        artifactId: `summary-${taskId}`,
        artifact: { type: "markdown", content },
        taskId,
        title: "Summary",
      });
      this.events.publish(runtime.sessionId, COWORK_EVENTS.AGENT_ARTIFACT, {
        id: `summary-${taskId}`,
        artifact: { type: "markdown", content },
        taskId: taskId,
        updatedAt,
      });
    }
    for (const artifact of outputArtifacts) {
      const { updatedAt } = await this.persistArtifact(runtime.sessionId, {
        artifactId: artifact.id,
        artifact: artifact.artifact,
        taskId,
        title: artifact.title,
        sourcePath: artifact.path,
      });
      this.events.publish(runtime.sessionId, COWORK_EVENTS.AGENT_ARTIFACT, {
        ...artifact,
        taskId: taskId,
        updatedAt,
      });
    }
  }

  private async handleOrchestratorEvent(
    runtime: SessionRuntime,
    event: { type: string; data: unknown }
  ) {
    const taskId = runtime.activeTaskId;
    switch (event.type) {
      case "thinking":
        this.handleThinkingEvent(runtime, event.data);
        return;
      case "tool:calling":
        this.handleToolCallingEvent(runtime, event.data);
        return;
      case "tool:result":
        this.handleToolResultEvent(runtime, event.data);
        return;
      case "usage:update":
        void this.handleUsageUpdate(runtime, event.data as { totalUsage: TokenUsageStats }).catch(
          (error: unknown) => {
            this.logger.error("Failed to handle usage update", error);
          }
        );
        return;
      case "plan:created":
        await this.handlePlanCreatedEvent(runtime, event.data, taskId);
        return;
      case "confirmation:received":
        await this.handleConfirmationReceivedEvent(taskId);
        return;
      case "error":
        await this.handleErrorEvent(taskId);
        return;
      default:
        return;
    }
  }
  private async handleUsageUpdate(runtime: SessionRuntime, data: { totalUsage: TokenUsageStats }) {
    await this.storage.sessionStore.update(runtime.sessionId, (s) => ({
      ...s,
      usage: data.totalUsage,
    }));

    this.events.publish(runtime.sessionId, COWORK_EVENTS.SESSION_USAGE_UPDATED, {
      inputTokens: data.totalUsage.inputTokens,
      outputTokens: data.totalUsage.outputTokens,
      totalTokens: data.totalUsage.totalTokens,
    });
  }

  private handleThinkingEvent(runtime: SessionRuntime, data: unknown): void {
    if (!isRecord(data) || typeof data.content !== "string") {
      return;
    }
    this.events.publish(runtime.sessionId, COWORK_EVENTS.AGENT_THINK, {
      content: data.content,
      taskId: runtime.activeTaskId ?? undefined,
    });
  }

  private handleToolCallingEvent(runtime: SessionRuntime, data: unknown): void {
    if (!isRecord(data) || typeof data.toolName !== "string") {
      return;
    }
    const activity = resolveToolActivity(data.toolName);
    const activityLabel = formatToolActivityLabel(activity);
    this.events.publish(runtime.sessionId, COWORK_EVENTS.AGENT_TOOL_CALL, {
      tool: data.toolName,
      args: isRecord(data.arguments) ? data.arguments : {},
      activity,
      activityLabel,
      taskId: runtime.activeTaskId ?? undefined,
    });

    void this.logAuditEntry({
      entryId: crypto.randomUUID(),
      sessionId: runtime.sessionId,
      taskId: runtime.activeTaskId ?? undefined,
      timestamp: Date.now(),
      action: "tool_call",
      toolName: data.toolName,
      input: isRecord(data.arguments) ? (data.arguments as Record<string, unknown>) : undefined,
    });
  }

  private handleToolResultEvent(runtime: SessionRuntime, data: unknown): void {
    if (!isRecord(data) || typeof data.toolName !== "string") {
      return;
    }
    const result = data.result;
    const isError = isToolError(result);
    const errorCode = extractErrorCode(result);
    const telemetry = extractTelemetry(data);
    const activity = resolveToolActivity(data.toolName);
    const activityLabel = formatToolActivityLabel(activity);

    this.events.publish(runtime.sessionId, COWORK_EVENTS.AGENT_TOOL_RESULT, {
      callId: `${data.toolName}-${Date.now().toString(36)}`,
      toolName: data.toolName,
      result,
      isError,
      errorCode,
      durationMs: telemetry?.durationMs,
      attempts: telemetry?.attempts,
      activity,
      activityLabel,
      taskId: runtime.activeTaskId ?? undefined,
    });

    void this.logAuditEntry({
      entryId: crypto.randomUUID(),
      sessionId: runtime.sessionId,
      taskId: runtime.activeTaskId ?? undefined,
      timestamp: Date.now(),
      action: isError ? "tool_error" : "tool_result",
      toolName: data.toolName,
      output: isRecord(result) ? result : undefined,
      durationMs: telemetry?.durationMs,
      outcome: isError ? "error" : "success",
    });
  }

  private async handlePlanCreatedEvent(
    runtime: SessionRuntime,
    data: unknown,
    taskId: string | null
  ): Promise<void> {
    if (!isRecord(data)) {
      return;
    }
    const steps = buildPlanSteps(data.steps);
    this.events.publish(runtime.sessionId, COWORK_EVENTS.AGENT_PLAN, {
      artifactId: taskId ? `plan-${taskId}` : "plan",
      plan: steps,
      taskId: taskId ?? undefined,
    });
    if (taskId) {
      await this.updateTaskStatus(taskId, "planning", ["queued", "planning", "ready"]);
    }
  }

  private async handleConfirmationReceivedEvent(taskId: string | null): Promise<void> {
    if (!taskId) {
      return;
    }
    await this.updateTaskStatus(taskId, "running");
  }

  private async handleErrorEvent(taskId: string | null): Promise<void> {
    if (!taskId) {
      return;
    }
    await this.updateTaskStatus(taskId, "failed");
  }

  private async updateTaskStatus(
    taskId: string,
    status: CoworkTaskStatus,
    allowedStatuses?: CoworkTaskStatus[]
  ) {
    const now = Date.now();
    let didChange = false;
    const updated = await this.enqueueTaskWrite(() =>
      this.storage.taskStore.update(taskId, (task) => {
        if (allowedStatuses && !allowedStatuses.includes(task.status)) {
          return task;
        }
        if (task.status === status) {
          return task;
        }
        didChange = true;
        return { ...task, status, updatedAt: now };
      })
    );

    if (!updated || !didChange) {
      return;
    }

    this.events.publish(updated.sessionId, COWORK_EVENTS.TASK_UPDATED, {
      taskId: updated.taskId,
      status: updated.status,
      title: updated.title,
      prompt: updated.prompt,
      modelId: updated.modelId,
      providerId: updated.providerId,
      fallbackNotice: updated.fallbackNotice,
    });
  }

  private async ensureTaskRecord(
    runtime: SessionRuntime,
    taskId: string,
    data: Record<string, unknown> | undefined
  ) {
    const existing = await this.storage.taskStore.getById(taskId);
    if (existing) {
      return existing;
    }

    const prompt = extractPrompt(data);
    const title = extractTitle(data);
    const now = Date.now();
    const task: CoworkTask = {
      taskId,
      sessionId: runtime.sessionId,
      title: title ?? "Cowork Task",
      prompt: prompt ?? "",
      status: "queued",
      modelId: runtime.modelId ?? undefined,
      providerId: runtime.providerId ?? undefined,
      fallbackNotice: runtime.fallbackNotice ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    await this.enqueueTaskWrite(() => this.storage.taskStore.create(task));
    return task;
  }

  private enqueueTaskWrite<T>(work: () => Promise<T>): Promise<T> {
    const next = this.taskWriteQueue.then(work, work);
    this.taskWriteQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async persistArtifact(
    sessionId: string,
    data: {
      artifactId: string;
      artifact: CoworkArtifactPayload;
      taskId?: string;
      title?: string;
      sourcePath?: string;
    }
  ): Promise<{ updatedAt: number }> {
    return await this.enqueueTaskWrite(async () => {
      const existing = await this.storage.artifactStore.getById(data.artifactId);
      const now = Date.now();
      const isContentChanged = existing
        ? JSON.stringify(existing.artifact) !== JSON.stringify(data.artifact)
        : true;
      const nextVersion = existing
        ? isContentChanged
          ? existing.version + 1
          : existing.version
        : 1;
      const nextStatus = isContentChanged ? "pending" : (existing?.status ?? "pending");
      const nextAppliedAt = isContentChanged ? undefined : existing?.appliedAt;
      const record = {
        artifactId: data.artifactId,
        sessionId,
        taskId: data.taskId,
        title: data.title ?? deriveArtifactTitle(data.artifactId, data.artifact),
        type: data.artifact.type,
        artifact: data.artifact,
        sourcePath: data.sourcePath,
        version: nextVersion,
        status: nextStatus,
        appliedAt: nextAppliedAt,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await this.storage.artifactStore.upsert(record);
      await this.touchSession(sessionId);
      return { updatedAt: now };
    });
  }

  private async touchSession(sessionId: string): Promise<void> {
    await this.storage.sessionStore.update(sessionId, (s) => s);
  }

  private async logAuditEntry(entry: CoworkAuditEntry): Promise<void> {
    try {
      await this.storage.auditLogStore.log(entry);
    } catch (error) {
      if (isErrno(error, "ENOENT")) {
        return;
      }
      this.logger.error("Failed to log audit entry", error);
    }
  }

  private async waitForApprovalDecision(
    sessionId: string,
    approvalId: string
  ): Promise<"approved" | "rejected"> {
    const decision = await this.approvalService.waitForDecision(approvalId);
    const approval = await this.storage.approvalStore.getById(approvalId);
    if (!approval) {
      this.logger.warn("Approval missing, defaulting to rejected", { approvalId, sessionId });
      return "rejected";
    }
    if (approval.status === "pending") {
      await this.resolveApproval(approvalId, decision);
    }
    return decision;
  }
}

function resolveProviders(settings: CoworkSettings): LLMProvider[] {
  const openaiEnv = resolveProviderFromEnv("openai");
  const claudeEnv = resolveProviderFromEnv("claude");
  const geminiEnv = resolveProviderFromEnv("gemini");
  const openAiKey = settings.openAiKey?.trim() || openaiEnv?.apiKeys[0];
  const anthropicKey = settings.anthropicKey?.trim() || claudeEnv?.apiKeys[0];
  const geminiKey = settings.geminiKey?.trim() || geminiEnv?.apiKeys[0];
  const geminiBaseUrl =
    geminiEnv?.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";

  const providers: LLMProvider[] = [];
  if (openAiKey) {
    providers.push(new OpenAIProvider({ apiKey: openAiKey, baseUrl: openaiEnv?.baseUrl }));
  }
  if (anthropicKey) {
    providers.push(new AnthropicProvider({ apiKey: anthropicKey, baseUrl: claudeEnv?.baseUrl }));
  }
  if (geminiKey) {
    providers.push(new GeminiProvider({ apiKey: geminiKey, baseUrl: geminiBaseUrl }));
  }
  return providers;
}

type CoworkProviderId = "openai" | "anthropic" | "gemini";

function createCoworkProvider(
  settings: CoworkSettings,
  logger: Logger,
  selectionHint?: { prompt?: string }
) {
  const providers = resolveProviders(settings);

  ensureProviders(providers);

  const requestedModel = normalizeModelId(settings.defaultModel ?? undefined) ?? null;
  const preferred = resolvePreferredProvider(requestedModel ?? undefined);
  const availableProviders = providers.map((provider) => ({
    providerId: provider.name as CoworkProviderId,
    defaultModel: provider.defaultModel,
  }));

  const { selectedModel, selectedProvider } = selectModelAndProvider({
    requestedModel,
    preferred,
    selectionHint,
    availableProviders,
  });
  const { primary, fallbackOrder, fallbackNotice, selectedProviderAvailable } =
    resolveProviderFallback({
      providers,
      preferred,
      requestedModel,
      selectedProvider,
      logger,
    });

  const router = new ProviderRouter({
    primaryProvider: primary,
    fallbackOrder,
    enableFallback: true,
  });

  for (const provider of providers) {
    router.registerProvider(provider);
  }

  router.startHealthChecks();

  const resolvedModel =
    selectedProviderAvailable && selectedModel
      ? selectedModel
      : (providers.find((provider) => provider.name === primary)?.defaultModel ?? "");

  return {
    provider: createProviderAdapter(router, "cowork"),
    model: resolvedModel,
    providerId: primary,
    fallbackNotice,
  };
}

function ensureProviders(providers: LLMProvider[]): void {
  if (providers.length === 0) {
    throw new Error("No AI provider configured. Add an API key in settings or env.");
  }
}

function selectModelAndProvider(options: {
  requestedModel: string | null;
  preferred: CoworkProviderId | undefined;
  selectionHint?: { prompt?: string };
  availableProviders: Array<{ providerId: CoworkProviderId; defaultModel: string }>;
}): { selectedModel: string | null; selectedProvider: CoworkProviderId | null } {
  let selectedModel = options.requestedModel;
  let selectedProvider = options.preferred ?? null;

  if (!selectedModel && options.selectionHint?.prompt) {
    const taskType = inferTaskType(options.selectionHint.prompt);
    const estimatedInputTokens = estimateTokens(options.selectionHint.prompt);
    const estimatedOutputTokens = Math.max(128, Math.round(estimatedInputTokens * 0.6));
    const smartRouter = new SmartProviderRouter(options.availableProviders);
    const selection = smartRouter.selectProvider({
      taskType,
      estimatedInputTokens,
      estimatedOutputTokens,
    });
    selectedModel = normalizeModelId(selection.modelId) ?? selection.modelId;
    selectedProvider = selection.providerId;
  }

  return { selectedModel, selectedProvider };
}

function resolveProviderFallback(options: {
  providers: LLMProvider[];
  preferred: CoworkProviderId | undefined;
  requestedModel: string | null;
  selectedProvider: CoworkProviderId | null;
  logger: Logger;
}): {
  primary: CoworkProviderId;
  fallbackOrder: CoworkProviderId[];
  fallbackNotice?: string;
  selectedProviderAvailable: boolean;
} {
  const providerNames = options.providers.map((provider) => provider.name as CoworkProviderId);
  const selectedProviderAvailable = Boolean(
    options.selectedProvider && providerNames.includes(options.selectedProvider)
  );
  const primary: CoworkProviderId =
    selectedProviderAvailable && options.selectedProvider
      ? options.selectedProvider
      : (providerNames[0] ?? "openai");
  const fallbackOrder = providerNames.filter((name) => name !== primary);
  const requestedProviderAvailable = Boolean(
    options.preferred && providerNames.includes(options.preferred)
  );
  const fallbackNotice =
    options.requestedModel && options.preferred && !requestedProviderAvailable
      ? `Requested provider ${options.preferred} unavailable. Using ${primary} instead.`
      : undefined;

  if (options.requestedModel && options.preferred && !requestedProviderAvailable) {
    options.logger.warn("Requested model provider not available, falling back.", {
      requestedModel: options.requestedModel,
      preferred: options.preferred,
      primary,
    });
  }

  return {
    primary,
    fallbackOrder,
    fallbackNotice,
    selectedProviderAvailable,
  };
}

function createProviderAdapter(provider: ProviderLike, name: string) {
  return {
    name,
    async complete(request: {
      model?: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      maxTokens?: number;
      tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    }) {
      const response = await provider.complete(convertRequest(request));
      return convertResponse(response);
    },
    async *stream(request: {
      model?: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      maxTokens?: number;
      tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    }) {
      const stream = provider.stream(convertRequest(request));
      for await (const chunk of stream) {
        const mapped = convertChunk(chunk);
        if (mapped) {
          yield mapped;
        }
      }
    },
  };
}

function convertRequest(request: {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}): CompletionRequest {
  return {
    model: request.model ?? "",
    messages: request.messages as CompletionRequest["messages"],
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    tools: request.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })) as Tool[] | undefined,
  };
}

function convertResponse(response: CompletionResponse) {
  return {
    content: response.content ?? "",
    toolCalls: response.toolCalls?.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: parseArguments(call.arguments),
    })),
    usage: response.usage
      ? { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens }
      : undefined,
    finishReason: response.finishReason,
  };
}

function convertChunk(chunk: StreamChunk) {
  switch (chunk.type) {
    case "content":
      return { type: "content" as const, content: chunk.content };
    case "tool_call":
      return chunk.toolCall?.name
        ? {
            type: "tool_call" as const,
            toolCall: {
              id: chunk.toolCall.id ?? crypto.randomUUID(),
              name: chunk.toolCall.name,
              arguments: parseArguments(chunk.toolCall.arguments),
            },
          }
        : null;
    case "error":
      return { type: "error" as const, error: chunk.error ?? "Unknown error" };
    case "done":
      return { type: "done" as const };
    default:
      return null;
  }
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function resolvePreferredProvider(
  model: string | undefined
): "openai" | "anthropic" | "gemini" | undefined {
  if (!model) {
    return undefined;
  }
  const capability = getModelCapability(model);
  if (capability?.provider === "openai") {
    return "openai";
  }
  if (capability?.provider === "gemini") {
    return "gemini";
  }
  if (capability?.provider === "claude") {
    return "anthropic";
  }
  const lower = model.toLowerCase();
  if (lower.includes("claude")) {
    return "anthropic";
  }
  if (lower.includes("gemini")) {
    return "gemini";
  }
  if (
    lower.includes("gpt") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("o4")
  ) {
    return "openai";
  }
  return undefined;
}

function inferTaskType(prompt: string): TaskType {
  const task = prompt.toLowerCase();
  if (/(implement|add|create|build)/.test(task)) {
    return "code_implementation";
  }
  if (/(refactor|clean|improve|optimi[sz]e|reorganize)/.test(task)) {
    return "refactoring";
  }
  if (/(fix|bug|error|issue|debug)/.test(task)) {
    return "debugging";
  }
  if (/(test|spec|coverage)/.test(task)) {
    return "testing";
  }
  if (/(research|investigate|analy[sz]e|explore|report)/.test(task)) {
    return "research";
  }
  if (/(document|comment|readme|guide|manual)/.test(task)) {
    return "documentation";
  }
  return "general";
}

function estimateTokens(text: string): number {
  return tokenTracker.countTokens(text, "gpt-4o");
}

function collectOutputRoots(session: CoworkSession): string[] {
  const roots: string[] = [];
  for (const grant of session.grants) {
    if (Array.isArray(grant.outputRoots)) {
      roots.push(...grant.outputRoots);
    }
  }
  return roots;
}

function collectArtifactRoots(session: CoworkSession): string[] {
  const roots = new Set<string>();
  for (const grant of session.grants) {
    if (typeof grant.rootPath === "string") {
      roots.add(grant.rootPath);
    }
    if (Array.isArray(grant.outputRoots)) {
      for (const root of grant.outputRoots) {
        roots.add(root);
      }
    }
  }
  return Array.from(roots);
}

function normalizeArtifactContent(content: string | null): string | null {
  if (!content) {
    return null;
  }
  const trimmed = content.trim();
  return trimmed.length > 0 ? content : null;
}

function collectCandidateArtifactPaths(summary: CoworkTaskSummary): string[] {
  const paths = new Set<string>();
  for (const output of summary.outputs) {
    paths.add(output.path);
  }
  for (const change of summary.fileChanges) {
    if (change.change === "delete") {
      continue;
    }
    paths.add(change.path);
  }
  return Array.from(paths);
}

function isPreviewablePath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return PREVIEWABLE_EXTENSIONS.has(ext);
}

function buildArtifactId(taskId: string, filePath: string): string {
  const raw = basename(filePath);
  const safe = raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `output-${taskId}-${safe || "file"}`;
}

async function readArtifactContent(filePath: string): Promise<string | null> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile() || stats.size > MAX_ARTIFACT_BYTES) {
      return null;
    }
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function buildOutputArtifacts(
  summary: CoworkTaskSummary,
  roots: string[],
  taskId: string
): Promise<
  Array<{
    id: string;
    artifact: { type: "markdown"; content: string };
    path: string;
    title: string;
  }>
> {
  const artifacts: Array<{
    id: string;
    artifact: { type: "markdown"; content: string };
    path: string;
    title: string;
  }> = [];
  const candidates = collectCandidateArtifactPaths(summary);

  for (const filePath of candidates) {
    if (!isPreviewablePath(filePath)) {
      continue;
    }
    if (roots.length > 0 && !isPathWithinRoots(filePath, roots, false)) {
      continue;
    }
    const content = await readArtifactContent(filePath);
    if (!content) {
      continue;
    }
    artifacts.push({
      id: buildArtifactId(taskId, filePath),
      artifact: { type: "markdown", content },
      path: filePath,
      title: basename(filePath),
    });
  }

  return artifacts;
}

function deriveArtifactTitle(artifactId: string, artifact: CoworkArtifactPayload): string {
  if (artifact.type === "diff") {
    return artifact.file || "Diff";
  }
  if (artifact.type === "plan") {
    return "Plan";
  }
  if (artifactId.startsWith("summary-")) {
    return "Summary";
  }
  return "Report";
}

function normalizeRiskTags(tags?: string[]): CoworkRiskTag[] {
  if (!tags) {
    return [];
  }
  // Filter to only valid risk tags
  const validTags = new Set<CoworkRiskTag>([
    "delete",
    "overwrite",
    "network",
    "connector",
    "batch",
  ]);
  return tags.filter((tag): tag is CoworkRiskTag => validTags.has(tag as CoworkRiskTag));
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

function extractPrompt(data: Record<string, unknown> | undefined): string | undefined {
  if (!isRecord(data) || !isRecord(data.task)) {
    return undefined;
  }
  const payload = data.task.payload;
  return isRecord(payload) && typeof payload.prompt === "string" ? payload.prompt : undefined;
}

function extractTitle(data: Record<string, unknown> | undefined): string | undefined {
  if (!isRecord(data) || !isRecord(data.task)) {
    return undefined;
  }
  return typeof data.task.name === "string" ? data.task.name : undefined;
}

type PlanStep = {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed";
};

function buildPlanSteps(rawSteps: unknown): PlanStep[] {
  if (!Array.isArray(rawSteps)) {
    return [];
  }
  const steps: PlanStep[] = [];
  for (const step of rawSteps) {
    if (!isRecord(step) || typeof step.id !== "string" || typeof step.description !== "string") {
      continue;
    }
    steps.push({
      id: step.id,
      label: step.description,
      status: mapPlanStatus(step.status),
    });
  }
  return steps;
}

function mapPlanStatus(status: unknown): "pending" | "in_progress" | "completed" | "failed" {
  switch (status) {
    case "executing":
      return "in_progress";
    case "complete":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function extractTaskSummary(data: Record<string, unknown> | undefined): CoworkTaskSummary | null {
  if (!isRecord(data) || !isRecord(data.result)) {
    return null;
  }
  const summary = data.result.summary;
  return isRecord(summary) ? (summary as unknown as CoworkTaskSummary) : null;
}

function formatSummary(summary: CoworkTaskSummary): string {
  const lines: string[] = ["## Summary"];

  if (summary.outputs.length > 0) {
    lines.push("", "### Outputs");
    for (const output of summary.outputs) {
      lines.push(`- ${output.path} (${output.kind})`);
    }
  }

  if (summary.fileChanges.length > 0) {
    lines.push("", "### File Changes");
    for (const change of summary.fileChanges) {
      lines.push(`- ${change.change}: ${change.path}`);
    }
  }

  if (summary.actionLog.length > 0) {
    lines.push("", "### Actions");
    for (const entry of summary.actionLog) {
      lines.push(`- ${new Date(entry.timestamp).toLocaleString()}: ${entry.action}`);
    }
  }

  if (summary.followups.length > 0) {
    lines.push("", "### Follow-ups");
    for (const followup of summary.followups) {
      lines.push(`- ${followup}`);
    }
  }

  return lines.join("\n");
}

function isSummaryEmpty(summary: CoworkTaskSummary): boolean {
  return (
    summary.outputs.length === 0 &&
    summary.fileChanges.length === 0 &&
    summary.actionLog.length === 0 &&
    summary.followups.length === 0
  );
}

function extractResultContent(data: Record<string, unknown> | undefined): string | null {
  if (!isRecord(data) || !isRecord(data.result)) {
    return null;
  }
  const result = data.result;
  if (typeof result === "string") {
    return result;
  }
  if (!isRecord(result)) {
    return null;
  }
  if (typeof result.content === "string") {
    return result.content;
  }
  if (typeof result.output === "string") {
    return result.output;
  }
  if (Array.isArray(result.messages)) {
    const content = extractAssistantMessage(result.messages);
    if (content) {
      return content;
    }
  }
  const state = result.state;
  if (!isRecord(state) || !Array.isArray(state.messages)) {
    return null;
  }
  const content = extractAssistantMessage(state.messages);
  if (content) {
    return content;
  }
  return null;
}

function extractAssistantMessage(messages: unknown[]): string | null {
  const reversed = messages.slice().reverse();
  for (const message of reversed) {
    if (!isRecord(message)) {
      continue;
    }
    if (message.role !== "assistant") {
      continue;
    }
    const content = extractMessageContent(message.content);
    if (content) {
      return content;
    }
  }
  return null;
}

function extractMessageContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => extractMessageContent(part))
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    return parts.length > 0 ? parts.join("") : null;
  }
  if (isRecord(content)) {
    if (typeof content.text === "string") {
      return content.text;
    }
    if (typeof content.content === "string") {
      return content.content;
    }
  }
  return null;
}

function isToolError(result: unknown): boolean | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  if (typeof result.success === "boolean") {
    return !result.success;
  }
  return undefined;
}

function extractErrorCode(result: unknown): string | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  if (isRecord(result.error) && typeof result.error.code === "string") {
    return result.error.code;
  }
  return undefined;
}

function extractTelemetry(data: unknown): { durationMs?: number; attempts?: number } | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const result: { durationMs?: number; attempts?: number } = {};
  if (isRecord(data.meta)) {
    if (typeof data.meta.durationMs === "number") {
      result.durationMs = data.meta.durationMs;
    }
    if (typeof data.meta.attempts === "number") {
      result.attempts = data.meta.attempts;
    }
  }
  // Also check nested result meta if orchestrator passed it through
  if (isRecord(data.result) && isRecord(data.result.meta)) {
    if (typeof data.result.meta.durationMs === "number") {
      result.durationMs = data.result.meta.durationMs;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Combine multiple prompt additions into one
 */
function combinePromptAdditions(...additions: (string | undefined)[]): string | undefined {
  const nonEmpty = additions.filter((a): a is string => typeof a === "string" && a.length > 0);
  if (nonEmpty.length === 0) {
    return undefined;
  }
  return nonEmpty.join("\n\n---\n\n");
}

/**
 * Truncate content to approximate token budget
 * Uses rough estimate of 4 characters per token
 */
function truncateToTokenBudget(content: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return content;
  }
  // Truncate and add indicator
  return `${content.substring(0, maxChars - 50)}\n\n... (truncated for token budget)`;
}
