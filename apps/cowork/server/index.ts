import { Hono } from "hono";
import { cors } from "hono/cors";
import { serverConfig } from "./config";
import { jsonError } from "./http";
import { createApprovalRoutes } from "./routes/approvals";
import { createSessionRoutes } from "./routes/sessions";
import { createSettingsRoutes } from "./routes/settings";
import { createStreamRoutes } from "./routes/stream";
import { CoworkRuntimeBridge } from "./runtime/coworkRuntime";
import { createStorageLayer } from "./storage";
import { SessionEventHub } from "./streaming/eventHub";

const { sessionStore, taskStore, approvalStore, configStore } = await createStorageLayer(
  serverConfig.storage
);
const eventHub = new SessionEventHub();
const runtime = new CoworkRuntimeBridge(approvalStore);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: serverConfig.corsOrigin,
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Last-Event-ID"],
  })
);

app.get("/api/health", (c) => {
  return c.json({ ok: true, timestamp: Date.now() });
});

app.route(
  "/api",
  createSessionRoutes({
    sessionStore,
    taskStore,
    events: eventHub,
  })
);

app.route(
  "/api",
  createSettingsRoutes({
    config: configStore,
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
  createApprovalRoutes({
    approvals: approvalStore,
    sessions: sessionStore,
    events: eventHub,
    runtime,
  })
);

app.onError((error, c) => {
  console.error("Cowork server error", error);
  return jsonError(c, 500, "Internal server error");
});

export default app;

if (process.env.COWORK_SERVER_START === "true") {
  const { port } = serverConfig;
  console.info(`[cowork] server listening on http://localhost:${port}`);
  Bun.serve({
    port,
    fetch: app.fetch,
  });
}
