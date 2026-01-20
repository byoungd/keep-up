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
import { createContextRoutes } from "./routes/context";
import { createCostRoutes } from "./routes/cost";
import { createLessonRoutes } from "./routes/lessons";
import { createPipelineRoutes } from "./routes/pipelines";
import { createPreflightRoutes } from "./routes/preflight";
import { createProjectRoutes } from "./routes/projects";
import { createProviderRoutes } from "./routes/providers";
import { createSessionRoutes } from "./routes/sessions";
import { createSettingsRoutes } from "./routes/settings";
import { createStreamRoutes } from "./routes/stream";
import { createWorkflowRoutes } from "./routes/workflows";
import { CoworkRuntimeBridge } from "./runtime/coworkRuntime";
import type { CoworkTaskRuntime } from "./runtime/coworkTaskRuntime";
import type { ContextIndexManager } from "./services/contextIndexManager";
import { ProviderKeyService } from "./services/providerKeyService";
import type { StorageLayer } from "./storage/contracts";
import { SessionEventHub } from "./streaming/eventHub";

export interface CoworkAppDeps {
  storage: StorageLayer;
  corsOrigin?: string;
  events?: SessionEventHub;
  runtime?: CoworkRuntimeBridge;
  taskRuntime?: CoworkTaskRuntime;
  contextIndexManager?: ContextIndexManager;
  providerKeys?: ProviderKeyService;
  pipelineStore?: PipelineStore;
  pipelineRunner?: PipelineRunner;
  logger?: Pick<typeof serverLogger, "info" | "warn" | "error">;
  lessonStore?: LessonStore;
  critic?: CriticAgent;
}

export function createCoworkApp(deps: CoworkAppDeps) {
  const eventHub = deps.events ?? new SessionEventHub();
  const runtime =
    deps.runtime ??
    new CoworkRuntimeBridge(deps.storage.approvalStore, undefined, deps.storage.auditLogStore, {
      configStore: deps.storage.configStore,
      repoRoot: process.cwd(),
    });
  const taskRuntime = deps.taskRuntime;
  const logger = deps.logger ?? serverLogger;
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
    createChatRoutes({
      sessionStore: deps.storage.sessionStore,
      chatMessageStore: deps.storage.chatMessageStore,
      getSettings: () => deps.storage.configStore.get(),
      providerKeys,
      events: eventHub,
      critic: deps.critic,
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
