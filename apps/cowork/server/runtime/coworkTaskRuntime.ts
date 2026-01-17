import { join, resolve } from "node:path";
import type { ConfirmationRequest, CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import {
  AgentModeManager,
  BrowserManager,
  createAICoreAdapter,
  createBashToolServer,
  createBrowserToolServer,
  createCodeToolServer,
  createCoworkRuntime,
  createDockerBashExecutor,
  createFileToolServer,
  createSandboxToolServer,
  createSecurityPolicy,
  createToolRegistry,
  createWebSearchToolServer,
  DockerSandboxManager,
  ProcessCodeExecutor,
  RuntimeAssetManager,
} from "@ku0/agent-runtime";
// Future integrations available:
// import { createGhostAgent, type GhostAgent } from "@ku0/agent-runtime";
// import { createMem0MemoryAdapter, type Mem0MemoryAdapter } from "@ku0/agent-runtime";
import { normalizeModelId } from "@ku0/ai-core";
import { ApprovalService } from "../services/approvalService";
import type { ContextIndexManager } from "../services/contextIndexManager";
import { ProviderKeyService } from "../services/providerKeyService";
import type { StorageLayer } from "../storage/contracts";
import { resolveStateDir } from "../storage/statePaths";
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
  contextPackKey: string | null;
  eventQueue: Promise<void>;
  unsubscribeQueue: () => void;
  unsubscribeOrchestrator: () => void;
};

type RuntimeFactory = (
  session: CoworkSession,
  settings: CoworkSettings
) => Promise<ReturnType<typeof createCoworkRuntime>>;

type RuntimeBuildResult = {
  runtime: ReturnType<typeof createCoworkRuntime>;
  modelId: string | null;
  providerId: string | null;
  fallbackNotice: string | null;
  contextPackKey: string | null;
};

const noop = () => undefined;
export class CoworkTaskRuntime {
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly runtimeFactory?: RuntimeFactory;
  private readonly logger: Logger; // Store logger for use in methods
  private runtimeAssetManager?: RuntimeAssetManager;

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
    contextIndexManager?: ContextIndexManager;
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
    this.projectContextManager = new ProjectContextManager(logger, deps.contextIndexManager);
  }

  /**
   * Start session runtime
   */
  async startSessionRuntime(sessionId: string, settings: CoworkSettings) {
    const existing = this.runtimes.get(sessionId);
    if (existing) {
      return existing;
    }

    const initialSession = await this.getSessionOrThrow(sessionId);
    const modeManager = new AgentModeManager(initialSession.agentMode ?? "build");
    const requestedModel = normalizeModelId(settings.defaultModel ?? undefined) ?? null;

    const runtimeResult = await this.buildRuntime(
      initialSession,
      settings,
      modeManager,
      requestedModel
    );
    const runtimeState = this.createRuntimeState(sessionId, runtimeResult, modeManager);
    this.attachRuntimeHandlers(runtimeState);

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
    task: {
      prompt: string;
      title?: string;
      modelId?: string;
      files?: string[];
      metadata?: Record<string, unknown>;
    }
  ) {
    const session = await this.getSessionOrThrow(sessionId);
    const settings = await this.configStore.get();
    const requestedModel = normalizeModelId(settings.defaultModel ?? undefined) ?? null;
    const runtime = await this.ensureRuntimeForTask(sessionId, session, settings, requestedModel);

    // Trigger execution
    const taskId = await runtime.runtime.enqueueTask(task.prompt, task.title);
    runtime.activeTaskId = taskId;
    const now = Date.now();
    const metadata = this.buildTaskMetadata(task.metadata, runtime.contextPackKey);
    const taskRecord: CoworkTask = {
      taskId,
      sessionId,
      title: task.title ?? "New Task",
      prompt: task.prompt,
      status: "queued",
      modelId: task.modelId ?? runtime.modelId ?? undefined,
      providerId: runtime.providerId ?? undefined,
      fallbackNotice: runtime.fallbackNotice ?? undefined,
      metadata,
      createdAt: now,
      updatedAt: now,
    };
    await this.taskOrchestrator.createTask(taskRecord);

    return {
      ...taskRecord,
    };
  }

  private async getSessionOrThrow(sessionId: string): Promise<CoworkSession> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  private async buildRuntime(
    session: CoworkSession,
    settings: CoworkSettings,
    modeManager: AgentModeManager,
    requestedModel: string | null
  ): Promise<RuntimeBuildResult> {
    if (this.runtimeFactory) {
      const runtime = await this.runtimeFactory(session, settings);
      const contextPackKey = await this.projectContextManager.getContextPackKey(session);
      return {
        runtime,
        modelId: requestedModel,
        providerId: null,
        fallbackNotice: null,
        contextPackKey,
      };
    }

    const resolved = await this.providerManager.createProvider(settings, {
      prompt: session.title ?? "Cowork Session",
    });
    const modelId = resolved.model ?? requestedModel;
    const toolRegistryResult = await this.buildToolRegistry(session);
    const toolRegistry = toolRegistryResult.registry;
    const adapter = createAICoreAdapter(resolved.provider, {
      model: modelId || undefined,
    });
    const prompt = await this.buildSystemPromptAddition(session, modeManager);
    const securityPolicy = toolRegistryResult.dockerAvailable
      ? buildDockerSecurityPolicy()
      : undefined;
    const runtime = createCoworkRuntime({
      llm: adapter,
      registry: toolRegistry,
      cowork: {
        session,
        audit: undefined,
        modeManager,
        securityPolicy,
      },
      taskQueueConfig: { maxConcurrent: 1 },
      outputRoots: collectOutputRoots(session),
      orchestratorOptions: {
        planning: {
          enabled: modeManager.isPlanMode(),
          autoExecuteLowRisk: false,
        },
      },
      systemPromptAddition: prompt.addition,
    });

    return {
      runtime,
      modelId,
      providerId: resolved.providerId,
      fallbackNotice: resolved.fallbackNotice ?? null,
      contextPackKey: prompt.contextPackKey,
    };
  }

  private async buildToolRegistry(session: CoworkSession): Promise<{
    registry: ReturnType<typeof createToolRegistry>;
    dockerAvailable: boolean;
  }> {
    const toolRegistry = createToolRegistry();
    await toolRegistry.register(createFileToolServer());
    const workspacePath = process.cwd();
    const assetManager = this.getRuntimeAssetManager();
    const dockerAvailable = await this.registerExecutionTools({
      registry: toolRegistry,
      session,
      workspacePath,
      assetManager,
    });
    await toolRegistry.register(createWebSearchToolServer(createWebSearchProvider(this.logger)));
    await this.registerBrowserTools(toolRegistry, assetManager);
    return { registry: toolRegistry, dockerAvailable };
  }

  private async buildSystemPromptAddition(
    session: CoworkSession,
    modeManager: AgentModeManager
  ): Promise<{ addition?: string; contextPackKey: string | null }> {
    const projectContext = await this.projectContextManager.getContext(session);
    const packPrompt = await this.projectContextManager.getContextPackPrompt(session);
    const addition = combinePromptAdditions(
      projectContext ? projectContext : undefined,
      packPrompt.prompt,
      modeManager.getSystemPromptAddition()
    );

    return {
      addition: addition || undefined,
      contextPackKey: packPrompt.packKey ?? null,
    };
  }

  private createRuntimeState(
    sessionId: string,
    runtimeResult: RuntimeBuildResult,
    modeManager: AgentModeManager
  ): SessionRuntime {
    return {
      sessionId,
      runtime: runtimeResult.runtime,
      modeManager,
      activeTaskId: null,
      modelId: runtimeResult.modelId,
      providerId: runtimeResult.providerId,
      fallbackNotice: runtimeResult.fallbackNotice,
      contextPackKey: runtimeResult.contextPackKey,
      eventQueue: Promise.resolve(),
      unsubscribeQueue: noop,
      unsubscribeOrchestrator: noop,
    };
  }

  private attachRuntimeHandlers(runtimeState: SessionRuntime): void {
    const { runtime } = runtimeState;
    const sessionId = runtimeState.sessionId;
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

    runtimeState.unsubscribeOrchestrator = runtime.orchestrator.on((event) => {
      runtimeState.eventQueue = runtimeState.eventQueue
        .then(() =>
          this.taskOrchestrator.handleOrchestratorEvent(
            sessionId,
            runtimeState.activeTaskId,
            event,
            {
              modelId: runtimeState.modelId ?? undefined,
              providerId: runtimeState.providerId ?? undefined,
            }
          )
        )
        .catch((err) => this.logger.error("Orchestrator event error", err));
    });
  }

  private async ensureRuntimeForTask(
    sessionId: string,
    session: CoworkSession,
    settings: CoworkSettings,
    requestedModel: string | null
  ): Promise<SessionRuntime> {
    let runtime = this.runtimes.get(sessionId);
    if (runtime && !runtime.activeTaskId) {
      const shouldRestart = await this.shouldRestartRuntime(runtime, requestedModel, session);
      if (shouldRestart) {
        await this.stopSessionRuntime(sessionId);
        runtime = undefined;
      }
    }

    if (!runtime) {
      runtime = await this.startSessionRuntime(sessionId, settings);
    }

    return runtime;
  }

  private async shouldRestartRuntime(
    runtime: SessionRuntime,
    requestedModel: string | null,
    session: CoworkSession
  ): Promise<boolean> {
    if (requestedModel && requestedModel !== runtime.modelId) {
      return true;
    }
    const nextPackKey = await this.projectContextManager.getContextPackKey(session);
    return nextPackKey !== runtime.contextPackKey;
  }

  private buildTaskMetadata(
    input: Record<string, unknown> | undefined,
    contextPackKey: string | null
  ): Record<string, unknown> | undefined {
    const metadata = input ? { ...input } : {};
    if (contextPackKey && metadata.contextPackKey === undefined) {
      metadata.contextPackKey = contextPackKey;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private async registerExecutionTools(input: {
    registry: ReturnType<typeof createToolRegistry>;
    session: CoworkSession;
    workspacePath: string;
    assetManager: RuntimeAssetManager;
  }): Promise<boolean> {
    const { dockerAvailable, dockerImage, dockerStatus } = await this.resolveDockerRuntimeStatus(
      input.assetManager
    );

    if (!dockerAvailable) {
      this.logDockerFallback(dockerStatus, dockerImage);
      await input.registry.register(createBashToolServer());
      await input.registry.register(createCodeToolServer());
      return false;
    }

    if (!dockerStatus.imagePresent) {
      const sizeHint = dockerStatus.expectedDownloadMB
        ? ` (~${dockerStatus.expectedDownloadMB}MB)`
        : "";
      this.logger.info(`Docker image ${dockerImage} missing; will pull on demand${sizeHint}.`);
    }

    const sandboxManager = new DockerSandboxManager({
      workspacePath: input.workspacePath,
      image: dockerImage,
      assetManager: input.assetManager,
    });
    const dockerBash = createDockerBashExecutor(sandboxManager, {
      sessionId: input.session.sessionId,
      workspacePath: input.workspacePath,
    });
    await input.registry.register(createBashToolServer(dockerBash));
    const codeExecutor = new ProcessCodeExecutor({ bashExecutor: dockerBash });
    await input.registry.register(createCodeToolServer(codeExecutor));
    await input.registry.register(createSandboxToolServer({ manager: sandboxManager }));
    return true;
  }

  private async registerBrowserTools(
    registry: ReturnType<typeof createToolRegistry>,
    assetManager: RuntimeAssetManager
  ): Promise<void> {
    const recordingsDir = join(resolveStateDir(), "browser-recordings");
    const playwrightInstallOnDemand = parseBooleanEnv(process.env.COWORK_PLAYWRIGHT_INSTALL, true);
    const playwrightStatus = await assetManager.inspectPlaywrightBrowser();
    this.logPlaywrightStatus(playwrightStatus, playwrightInstallOnDemand);
    const browserManager = new BrowserManager({
      recordingDir: recordingsDir,
      assetManager,
    });
    await registry.register(createBrowserToolServer({ manager: browserManager }));
  }

  private async resolveDockerRuntimeStatus(assetManager: RuntimeAssetManager): Promise<{
    dockerAvailable: boolean;
    dockerImage: string;
    dockerStatus: Awaited<ReturnType<RuntimeAssetManager["inspectDockerImage"]>>;
  }> {
    const dockerImage = process.env.COWORK_SANDBOX_IMAGE ?? DEFAULT_DOCKER_IMAGE;
    const dockerPullOnDemand = parseBooleanEnv(process.env.COWORK_DOCKER_PULL, true);
    const dockerStatus = await assetManager.inspectDockerImage(dockerImage);
    const dockerAvailable =
      dockerStatus.available && (dockerStatus.imagePresent || dockerPullOnDemand);
    return { dockerAvailable, dockerImage, dockerStatus };
  }

  private logDockerFallback(
    dockerStatus: Awaited<ReturnType<RuntimeAssetManager["inspectDockerImage"]>>,
    dockerImage: string
  ): void {
    if (!dockerStatus.available) {
      this.logger.warn(
        `Docker sandbox unavailable (${dockerStatus.reason ?? "unknown"}); using process execution.`
      );
      return;
    }

    this.logger.warn(
      `Docker image ${dockerImage} missing; set COWORK_DOCKER_PULL=true to enable on-demand pulls.`
    );
  }

  private logPlaywrightStatus(
    playwrightStatus: Awaited<ReturnType<RuntimeAssetManager["inspectPlaywrightBrowser"]>>,
    installOnDemand: boolean
  ): void {
    if (playwrightStatus.available) {
      return;
    }
    const sizeHint = playwrightStatus.expectedDownloadMB
      ? ` (~${playwrightStatus.expectedDownloadMB}MB)`
      : "";
    if (installOnDemand) {
      this.logger.info(`Playwright browsers missing; will install on demand${sizeHint}.`);
      return;
    }
    this.logger.warn(
      "Playwright browsers missing; set COWORK_PLAYWRIGHT_INSTALL=true to enable on-demand installs."
    );
  }

  private getRuntimeAssetManager(): RuntimeAssetManager {
    if (!this.runtimeAssetManager) {
      const cacheDir = resolveRuntimeAssetDir();
      this.runtimeAssetManager = new RuntimeAssetManager({
        cacheDir,
        logger: this.logger,
        playwright: {
          browsersPath: process.env.COWORK_PLAYWRIGHT_BROWSERS_PATH,
          installOnDemand: parseBooleanEnv(process.env.COWORK_PLAYWRIGHT_INSTALL, true),
          expectedDownloadMB: parseNumberEnv(process.env.COWORK_PLAYWRIGHT_DOWNLOAD_MB),
        },
        docker: {
          pullOnDemand: parseBooleanEnv(process.env.COWORK_DOCKER_PULL, true),
          expectedDownloadMB: parseNumberEnv(process.env.COWORK_DOCKER_DOWNLOAD_MB),
        },
      });
    }
    return this.runtimeAssetManager;
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

function buildDockerSecurityPolicy() {
  const policy = createSecurityPolicy("balanced");
  return {
    ...policy,
    sandbox: {
      ...policy.sandbox,
      type: "docker" as const,
      workingDirectory: "/workspace",
    },
  };
}

const DEFAULT_DOCKER_IMAGE = "node:20-alpine";

function resolveRuntimeAssetDir(): string {
  return process.env.COWORK_RUNTIME_ASSET_DIR
    ? resolve(process.env.COWORK_RUNTIME_ASSET_DIR)
    : join(resolveStateDir(), "runtime-assets");
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseNumberEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
