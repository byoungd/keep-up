import "./env";
import { serve } from "@hono/node-server";
import { createCoworkApp } from "./app";
import { serverConfig } from "./config";
import { serverLogger } from "./logger";
import { CoworkTaskRuntime } from "./runtime/coworkTaskRuntime";
import { ContextIndexManager } from "./services/contextIndexManager";
import { createStorageLayer } from "./storage";
import { ensureStateDir } from "./storage/statePaths";
import { SessionEventHub } from "./streaming/eventHub";

const storage = await createStorageLayer(serverConfig.storage);
const stateDir = await ensureStateDir();
const eventHub = new SessionEventHub();
const contextIndexManager = new ContextIndexManager({ stateDir });
const taskRuntime = new CoworkTaskRuntime({
  storage,
  events: eventHub,
  logger: serverLogger,
  contextIndexManager,
});
const app = createCoworkApp({
  storage,
  corsOrigin: serverConfig.corsOrigin,
  logger: serverLogger,
  events: eventHub,
  taskRuntime,
  contextIndexManager,
});

export default app;

if (process.env.COWORK_SERVER_START === "true") {
  const { port } = serverConfig;
  serverLogger.info(`Server listening on http://localhost:${port}`);
  serve({
    port,
    fetch: app.fetch,
  });
}
