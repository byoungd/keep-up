import type { CriticAgent, LessonStore } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { jsonError } from "./http";
import { serverLogger } from "./logger";
import type { PipelineRunner } from "./pipelines/pipelineRunner";
import type { PipelineStore } from "./pipelines/pipelineStore";
import { createAgentProtocolRoutes } from "./routes/agentProtocol";
import { createApprovalRoutes } from "./routes/approvals";
import { createArtifactRoutes } from "./routes/artifacts";
import { createAuditLogRoutes } from "./routes/auditLogs";
import { createChatRoutes } from "./routes/chat";
import { createCheckpointRoutes } from "./routes/checkpoints";
import { createClarificationRoutes } from "./routes/clarifications";
import { createContextRoutes } from "./routes/context";
import { createCostRoutes } from "./routes/cost";
import { createGatewayHealthRoutes } from "./routes/gatewayHealth";
import { createGatewayNodeRoutes } from "./routes/gatewayNodes";
import { createLessonRoutes } from "./routes/lessons";
import { createMcpAppsRoutes } from "./routes/mcpApps";
import { createPipelineRoutes } from "./routes/pipelines";
import { createPreflightRoutes } from "./routes/preflight";
import { createProjectRoutes } from "./routes/projects";
import { createProviderRoutes } from "./routes/providers";
import { createSessionRoutes } from "./routes/sessions";
import { createSettingsRoutes } from "./routes/settings";
import { createSkillRoutes } from "./routes/skills";
import { createStreamRoutes } from "./routes/stream";
import { createUserRoutes } from "./routes/user";
import { createWorkflowRoutes } from "./routes/workflows";
import { createWorkspaceSessionRoutes } from "./routes/workspaceSessions";
import { createWorkspaceRoutes } from "./routes/workspaces";
import { CoworkRuntimeBridge } from "./runtime/coworkRuntime";
import type { CoworkTaskRuntime } from "./runtime/coworkTaskRuntime";
import type { GatewayControlRuntime } from "./runtime/gatewayControl";
import { WorkspaceSessionRuntime } from "./runtime/services/WorkspaceSessionRuntime";
import type { ContextIndexManager } from "./services/contextIndexManager";
import type { McpServerManager } from "./services/mcpServerManager";
import { ProviderKeyService } from "./services/providerKeyService";
import type { StorageLayer } from "./storage/contracts";
import { SessionEventHub } from "./streaming/eventHub";

export interface CoworkAppDeps {
  storage: StorageLayer;
  corsOrigin?: string;
  events?: SessionEventHub;
  runtime?: CoworkRuntimeBridge;
  taskRuntime?: CoworkTaskRuntime;
  gatewayRuntime?: GatewayControlRuntime;
  contextIndexManager?: ContextIndexManager;
  providerKeys?: ProviderKeyService;
  pipelineStore?: PipelineStore;
  pipelineRunner?: PipelineRunner;
  logger?: Pick<typeof serverLogger, "info" | "warn" | "error">;
  workspaceRuntime?: WorkspaceSessionRuntime;
  lessonStore?: LessonStore;
  critic?: CriticAgent;
  mcpServers?: McpServerManager;
}

export function createCoworkApp(deps: CoworkAppDeps) {
  const eventHub = deps.events ?? new SessionEventHub();
  const logger = deps.logger ?? serverLogger;
  const workspaceLogger = {
    info: (message: string, meta?: Record<string, unknown>) => logger.info(message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, meta),
    error: (message: string, meta?: Record<string, unknown>) =>
      logger.error(message, undefined, meta),
  };
  const runtime =
    deps.runtime ??
    new CoworkRuntimeBridge(deps.storage.approvalStore, undefined, deps.storage.auditLogStore, {
      configStore: deps.storage.configStore,
      repoRoot: process.cwd(),
    });
  const workspaceRuntime =
    deps.workspaceRuntime ??
    new WorkspaceSessionRuntime({
      workspaceSessions: deps.storage.workspaceSessionStore,
      workspaceEvents: deps.storage.workspaceEventStore,
      events: eventHub,
      logger: workspaceLogger,
    });
  const taskRuntime = deps.taskRuntime;
  const providerKeys =
    deps.providerKeys ?? new ProviderKeyService(deps.storage.configStore, logger);

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: deps.corsOrigin ?? "*",
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Last-Event-ID"],
    })
  );

  app.get("/api/health", (c) => c.json({ ok: true, timestamp: Date.now() }));

  app.route(
    "/api",
    createGatewayHealthRoutes({
      gateway: deps.gatewayRuntime,
    })
  );
  app.route(
    "/api",
    createGatewayNodeRoutes({
      gateway: deps.gatewayRuntime,
    })
  );

  app.route(
    "/api",
    createSessionRoutes({
      sessionStore: deps.storage.sessionStore,
      taskStore: deps.storage.taskStore,
      events: eventHub,
      taskRuntime,
    })
  );

  app.route(
    "/api",
    createAgentProtocolRoutes({
      sessionStore: deps.storage.sessionStore,
      taskStore: deps.storage.taskStore,
      stepStore: deps.storage.stepStore,
      artifactStore: deps.storage.artifactStore,
      auditLogStore: deps.storage.auditLogStore,
    })
  );

  app.route(
    "/api",
    createArtifactRoutes({
      artifactStore: deps.storage.artifactStore,
      auditLogStore: deps.storage.auditLogStore,
      sessionStore: deps.storage.sessionStore,
      taskStore: deps.storage.taskStore,
    })
  );

  app.route(
    "/api",
    createAuditLogRoutes({
      auditLogStore: deps.storage.auditLogStore,
      sessions: deps.storage.sessionStore,
    })
  );

  app.route(
    "/api",
    createSettingsRoutes({
      config: deps.storage.configStore,
      providerKeys,
    })
  );

  app.route(
    "/api",
    createStreamRoutes({
      events: eventHub,
    })
  );

  if (deps.mcpServers) {
    app.route(
      "/api",
      createMcpAppsRoutes({
        mcpServers: deps.mcpServers,
      })
    );
  }

  app.route("/api", createUserRoutes());

  app.route(
    "/api",
    createProviderRoutes({
      providerKeys,
    })
  );

  app.route(
    "/api",
    createCostRoutes({
      sessionStore: deps.storage.sessionStore,
      chatMessageStore: deps.storage.chatMessageStore,
      taskStore: deps.storage.taskStore,
    })
  );

  app.route(
    "/api",
    createProjectRoutes({
      projectStore: deps.storage.projectStore,
    })
  );

  app.route(
    "/api",
    createWorkspaceRoutes({
      sessionStore: deps.storage.sessionStore,
    })
  );

  app.route(
    "/api",
    createWorkspaceSessionRoutes({
      sessions: deps.storage.sessionStore,
      workspaceSessions: deps.storage.workspaceSessionStore,
      workspaceEvents: deps.storage.workspaceEventStore,
      events: eventHub,
      runtime: workspaceRuntime,
    })
  );

  app.route(
    "/api",
    createWorkflowRoutes({
      workflowTemplates: deps.storage.workflowTemplateStore,
      auditLogs: deps.storage.auditLogStore,
    })
  );

  app.route(
    "/api",
    createPreflightRoutes({
      sessionStore: deps.storage.sessionStore,
      artifactStore: deps.storage.artifactStore,
      auditLogStore: deps.storage.auditLogStore,
    })
  );

  if (deps.pipelineStore && deps.pipelineRunner) {
    app.route(
      "/api",
      createPipelineRoutes({
        store: deps.pipelineStore,
        runner: deps.pipelineRunner,
      })
    );
  }

  app.route(
    "/api",
    createApprovalRoutes({
      approvals: deps.storage.approvalStore,
      sessions: deps.storage.sessionStore,
      events: eventHub,
      runtime,
      taskRuntime,
    })
  );

  app.route(
    "/api",
    createClarificationRoutes({
      taskRuntime,
    })
  );

  app.route(
    "/api",
    createSkillRoutes({
      taskRuntime,
      sessions: deps.storage.sessionStore,
    })
  );

  app.route(
    "/api",
    createChatRoutes({
      sessionStore: deps.storage.sessionStore,
      chatMessageStore: deps.storage.chatMessageStore,
      getSettings: () => deps.storage.configStore.get(),
      providerKeys,
      events: eventHub,
      critic: deps.critic,
    })
  );

  app.route(
    "/api",
    createCheckpointRoutes({
      sessions: deps.storage.sessionStore,
      taskRuntime,
    })
  );

  if (deps.lessonStore) {
    app.route(
      "/api",
      createLessonRoutes({
        lessonStore: deps.lessonStore,
      })
    );
  }

  app.onError((error, c) => {
    logger.error("Server error", error);
    return jsonError(c, 500, "Internal server error");
  });
  // Project context routes (AGENTS.md analysis and generation)
  app.route(
    "/api",
    createContextRoutes({
      contextIndexManager: deps.contextIndexManager,
    })
  );

  logger.info("Cowork server initialized");
  return app;
}
