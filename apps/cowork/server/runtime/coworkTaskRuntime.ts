import type { ConfirmationRequest, CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import {
  AgentModeManager,
  createAICoreAdapter,
  createBashToolServer,
  createCodeToolServer,
  createCoworkRuntime,
  createFileToolServer,
  createToolRegistry,
  createWebSearchToolServer,
} from "@ku0/agent-runtime";
// Future integrations available:
// import { createGhostAgent, type GhostAgent } from "@ku0/agent-runtime";
// import { createMem0MemoryAdapter, type Mem0MemoryAdapter } from "@ku0/agent-runtime";
import { normalizeModelId } from "@ku0/ai-core";
import { ApprovalService } from "../services/approvalService";
import { ProviderKeyService } from "../services/providerKeyService";
import type { StorageLayer } from "../storage/contracts";
import type { CoworkSettings } from "../storage/types";
import type { SessionEventHub } from "../streaming/eventHub";
// Service Imports
import { ApprovalCoordinator } from "./services/ApprovalCoordinator";
import { ArtifactProcessor } from "./services/ArtifactProcessor";
import { EventStreamPublisher } from "./services/EventStreamPublisher";
import { ProjectContextManager } from "./services/ProjectContextManager";
import { ProviderManager } from "./services/ProviderManager";
import { SessionLifecycleManager } from "./services/SessionLifecycleManager";
import { TaskOrchestrator } from "./services/TaskOrchestrator";
import { collectOutputRoots, combinePromptAdditions } from "./utils";
import { createWebSearchProvider } from "./webSearchProvider";

type Logger = Pick<Console, "info" | "warn" | "error" | "debug">;

type SessionRuntime = {
  sessionId: string;
  runtime: ReturnType<typeof createCoworkRuntime>;
  modeManager: AgentModeManager;
  activeTaskId: string | null;
  modelId: string | null;
  providerId: string | null;
  fallbackNotice: string | null;
  eventQueue: Promise<void>;
  unsubscribeQueue: () => void;
  unsubscribeOrchestrator: () => void;
};

type RuntimeFactory = (
  session: CoworkSession,
  settings: CoworkSettings
) => Promise<ReturnType<typeof createCoworkRuntime>>;

const noop = () => undefined;
export class CoworkTaskRuntime {
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly runtimeFactory?: RuntimeFactory;
  private readonly logger: Logger; // Store logger for use in methods

  // Services
  private readonly sessionManager: SessionLifecycleManager;
  private readonly providerManager: ProviderManager;
  private readonly taskOrchestrator: TaskOrchestrator;
  private readonly approvalCoordinator: ApprovalCoordinator;
  private readonly artifactProcessor: ArtifactProcessor;
  private readonly eventPublisher: EventStreamPublisher;
  private readonly projectContextManager: ProjectContextManager;
  private readonly providerKeys: ProviderKeyService;
  private readonly configStore: StorageLayer["configStore"];

  // Optional Advanced Services (available when enabled)
  // private memoryAdapter?: Mem0MemoryAdapter;
  // private ghostAgent?: GhostAgent;

  constructor(deps: {
    storage: StorageLayer;
    events: SessionEventHub;
    logger?: Logger;
    runtimeFactory?: RuntimeFactory;
    approvalService?: ApprovalService;
    providerKeys?: ProviderKeyService;
  }) {
    this.logger = deps.logger ?? console; // Assign to property
    const logger = this.logger;
    this.runtimeFactory = deps.runtimeFactory;
    this.configStore = deps.storage.configStore;
    this.providerKeys =
      deps.providerKeys ?? new ProviderKeyService(deps.storage.configStore, logger);

    // Initialize Services
    this.sessionManager = new SessionLifecycleManager(deps.storage.sessionStore);
    this.eventPublisher = new EventStreamPublisher(deps.events);
    this.artifactProcessor = new ArtifactProcessor(
      deps.storage.artifactStore,
      deps.storage.sessionStore
    );
    this.approvalCoordinator = new ApprovalCoordinator(
      deps.storage.approvalStore,
      deps.storage.auditLogStore,
      deps.approvalService ?? new ApprovalService(),
      this.eventPublisher
    );
    this.providerManager = new ProviderManager(logger, this.providerKeys);
    this.taskOrchestrator = new TaskOrchestrator(
      deps.storage.taskStore,
      this.artifactProcessor,
      this.eventPublisher,
      this.sessionManager,
      this.approvalCoordinator
    );
    this.projectContextManager = new ProjectContextManager(logger);
  }

  /**
   * Start session runtime
   */
  async startSessionRuntime(sessionId: string, settings: CoworkSettings) {
    const existing = this.runtimes.get(sessionId);
    if (existing) {
      return existing;
    }

    const initialSession = await this.sessionManager.getSession(sessionId);
    if (!initialSession) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const modeManager = new AgentModeManager(initialSession.agentMode ?? "build");
    const requestedModel = normalizeModelId(settings.defaultModel ?? undefined) ?? null;

    let modelId: string | null = requestedModel;
    let providerId: string | null = null;
    let fallbackNotice: string | null = null;
    let provider: unknown = null;

    // 2. Create Runtime
    let runtime: ReturnType<typeof createCoworkRuntime>;

    if (this.runtimeFactory) {
      runtime = await this.runtimeFactory(initialSession, settings);
    } else {
      // Resolve Provider
      const resolved = await this.providerManager.createProvider(settings, {
        prompt: initialSession.title ?? "Cowork Session",
      });
      provider = resolved.provider;
      modelId = resolved.model ?? requestedModel;
      providerId = resolved.providerId;
      fallbackNotice = resolved.fallbackNotice ?? null;

      const toolRegistry = createToolRegistry();

      // Register standard tools
      await toolRegistry.register(createFileToolServer());
      await toolRegistry.register(createBashToolServer()); // No args expected
      await toolRegistry.register(createCodeToolServer());
      await toolRegistry.register(
        createWebSearchToolServer(createWebSearchProvider(this.logger)) // Pass logger instead of settings
      );

      // Create Adapter
      const adapter = createAICoreAdapter(provider as Parameters<typeof createAICoreAdapter>[0], {
        model: modelId || undefined,
      });

      // System Prompt & Context
      const projectContext = await this.projectContextManager.getContext(initialSession);
      const systemPromptAddition = combinePromptAdditions(
        projectContext ? projectContext : undefined,
        modeManager.getSystemPromptAddition()
      );

      runtime = createCoworkRuntime({
        llm: adapter,
        registry: toolRegistry,
        cowork: {
          session: initialSession,
          audit: undefined,
          modeManager,
        },
        taskQueueConfig: { maxConcurrent: 1 },
        outputRoots: collectOutputRoots(initialSession),
        orchestratorOptions: {
          planning: {
            enabled: modeManager.isPlanMode(),
            autoExecuteLowRisk: false,
          },
        },
        systemPromptAddition: systemPromptAddition || undefined,
      });
    }

    // 3. Setup Event Handling
    const runtimeState: SessionRuntime = {
      sessionId,
      runtime,
      modeManager,
      activeTaskId: null,
      modelId,
      providerId,
      fallbackNotice,
      eventQueue: Promise.resolve(),
      unsubscribeQueue: noop,
      unsubscribeOrchestrator: noop,
    };

    const originalWaitForTask = runtime.waitForTask.bind(runtime);
    runtime.waitForTask = async (taskId: string) => {
      const result = await originalWaitForTask(taskId);
      await runtimeState.eventQueue.catch(() => undefined);
      return result;
    };

    runtime.orchestrator.setConfirmationHandler(async (request) => {
      const taskId = runtimeState.activeTaskId;
      if (taskId) {
        await this.taskOrchestrator.updateTaskStatus(taskId, "awaiting_confirmation", [
          "queued",
          "planning",
          "ready",
          "running",
          "awaiting_confirmation",
        ]);
      }

      const approved = await this.approvalCoordinator.requestApproval({
        sessionId,
        taskId: taskId ?? undefined,
        description: request.description,
        riskTags: request.riskTags,
        reason: request.reason,
        toolName: request.toolName,
      });

      if (approved && taskId) {
        await this.taskOrchestrator.updateTaskStatus(taskId, "running", [
          "awaiting_confirmation",
          "running",
        ]);
      }

      return approved;
    });

    // Task Events
    runtimeState.unsubscribeQueue = runtime.onCoworkEvents((event) => {
      if (
        event.type === "task.completed" ||
        event.type === "task.failed" ||
        event.type === "task.cancelled"
      ) {
        if (runtimeState.activeTaskId === event.taskId) {
          runtimeState.activeTaskId = null;
        }
      } else {
        runtimeState.activeTaskId = event.taskId;
      }
      runtimeState.eventQueue = runtimeState.eventQueue
        .then(() => this.taskOrchestrator.handleTaskEvent({ ...event, taskId: event.taskId }))
        .catch((err) => this.logger.error("Task event error", err));
    });

    // Orchestrator Events
    runtimeState.unsubscribeOrchestrator = runtime.orchestrator.on((event) => {
      runtimeState.eventQueue = runtimeState.eventQueue
        .then(() =>
          this.taskOrchestrator.handleOrchestratorEvent(sessionId, runtimeState.activeTaskId, event)
        )
        .catch((err) => this.logger.error("Orchestrator event error", err));
    });

    this.runtimes.set(sessionId, runtimeState);
    return runtimeState;
  }

  /**
   * Stop session runtime
   */
  async stopSessionRuntime(sessionId: string) {
    const runtime = this.runtimes.get(sessionId);
    if (runtime) {
      runtime.unsubscribeQueue();
      runtime.unsubscribeOrchestrator();
      this.runtimes.delete(sessionId);
    }
  }

  /**
   * Update the agent mode for an active runtime
   */
  updateSessionMode(sessionId: string, mode: "plan" | "build") {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      return;
    }
    runtime.modeManager.setMode(mode);
    if (!runtime.activeTaskId) {
      runtime.unsubscribeQueue();
      runtime.unsubscribeOrchestrator();
      this.runtimes.delete(sessionId);
    }
  }

  /**
   * Queue a task for execution
   */
  async enqueueTask(
    sessionId: string,
    task: { prompt: string; title?: string; modelId?: string; files?: string[] }
  ) {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const settings = await this.configStore.get();
    const requestedModel = normalizeModelId(settings.defaultModel ?? undefined) ?? null;
    let runtime = this.runtimes.get(sessionId);

    if (runtime && !runtime.activeTaskId && requestedModel && requestedModel !== runtime.modelId) {
      await this.stopSessionRuntime(sessionId);
      runtime = undefined;
    }

    if (!runtime) {
      runtime = await this.startSessionRuntime(sessionId, settings);
    }

    // Trigger execution
    const taskId = await runtime.runtime.enqueueTask(task.prompt, task.title);
    runtime.activeTaskId = taskId;
    const now = Date.now();
    const taskRecord: CoworkTask = {
      taskId,
      sessionId,
      title: task.title ?? "New Task",
      prompt: task.prompt,
      status: "queued",
      modelId: task.modelId ?? runtime.modelId ?? undefined,
      providerId: runtime.providerId ?? undefined,
      fallbackNotice: runtime.fallbackNotice ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    await this.taskOrchestrator.createTask(taskRecord);

    return {
      ...taskRecord,
    };
  }

  // --- Proxy Methods to Services ---

  async getArtifact(sessionId: string, artifactId: string) {
    return this.artifactProcessor.getArtifact(sessionId, artifactId);
  }

  async getProjectContext(session: CoworkSession) {
    return this.projectContextManager.getContext(session);
  }

  async regenerateProjectContext(session: CoworkSession) {
    return this.projectContextManager.regenerateContext(session);
  }

  async saveProjectContext(session: CoworkSession, content: string) {
    return this.projectContextManager.saveContext(session, content);
  }

  async requestApproval(sessionId: string, request: ConfirmationRequest) {
    return this.approvalCoordinator.requestApproval({
      sessionId,
      description: request.description,
      riskTags: request.riskTags,
      reason: request.reason,
      toolName: request.toolName,
    });
  }

  async resolveApproval(approvalId: string, decision: "approved" | "rejected") {
    return this.approvalCoordinator.resolveApproval(approvalId, decision);
  }
}
