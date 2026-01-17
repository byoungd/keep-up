import { Hono } from "hono";
import { cors } from "hono/cors";
import { jsonError } from "./http";
import { serverLogger } from "./logger";
import { createApprovalRoutes } from "./routes/approvals";
import { createArtifactRoutes } from "./routes/artifacts";
import { createAuditLogRoutes } from "./routes/auditLogs";
import { createChatRoutes } from "./routes/chat";
import { createContextRoutes } from "./routes/context";
import { createProjectRoutes } from "./routes/projects";
import { createSessionRoutes } from "./routes/sessions";
import { createSettingsRoutes } from "./routes/settings";
import { createStreamRoutes } from "./routes/stream";
import { CoworkRuntimeBridge } from "./runtime/coworkRuntime";
import type { CoworkTaskRuntime } from "./runtime/coworkTaskRuntime";
import type { StorageLayer } from "./storage/contracts";
import { SessionEventHub } from "./streaming/eventHub";

export interface CoworkAppDeps {
  storage: StorageLayer;
  corsOrigin?: string;
  events?: SessionEventHub;
  runtime?: CoworkRuntimeBridge;
  taskRuntime?: CoworkTaskRuntime;
  logger?: Pick<typeof serverLogger, "info" | "error">;
}

export function createCoworkApp(deps: CoworkAppDeps) {
  const eventHub = deps.events ?? new SessionEventHub();
  const runtime =
    deps.runtime ??
    new CoworkRuntimeBridge(deps.storage.approvalStore, undefined, deps.storage.auditLogStore);
  const taskRuntime = deps.taskRuntime;
  const logger = deps.logger ?? serverLogger;

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: deps.corsOrigin ?? "*",
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
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
    createProjectRoutes({
      projectStore: deps.storage.projectStore,
    })
  );

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
    })
  );

  app.onError((error, c) => {
    logger.error("Server error", error);
    return jsonError(c, 500, "Internal server error");
  });
  // Project context routes (AGENTS.md analysis and generation)
  app.route("/api", createContextRoutes());

  logger.info("Cowork server initialized");
  return app;
}
