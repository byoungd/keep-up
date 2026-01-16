import "./env";
import { serve } from "@hono/node-server";
import { createCoworkApp } from "./app";
import { serverConfig } from "./config";
import { serverLogger } from "./logger";
import { CoworkTaskRuntime } from "./runtime/coworkTaskRuntime";
import { createStorageLayer } from "./storage";
import { SessionEventHub } from "./streaming/eventHub";

const storage = await createStorageLayer(serverConfig.storage);
const eventHub = new SessionEventHub();
const taskRuntime = new CoworkTaskRuntime({
  storage,
  events: eventHub,
  logger: serverLogger,
});
const app = createCoworkApp({
  storage,
  corsOrigin: serverConfig.corsOrigin,
  logger: serverLogger,
  events: eventHub,
  taskRuntime,
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
