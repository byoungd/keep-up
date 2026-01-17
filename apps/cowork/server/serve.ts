import "./env";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
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

const baseDir = dirname(fileURLToPath(import.meta.url));
const defaultDistDir = resolve(baseDir, "..", "dist");
const staticDir = resolve(process.env.COWORK_STATIC_DIR ?? defaultDistDir);
const indexPath = resolve(process.env.COWORK_STATIC_INDEX ?? join(staticDir, "index.html"));

let indexHtml: string;
try {
  indexHtml = await readFile(indexPath, "utf-8");
} catch (error) {
  const err = error instanceof Error ? error : new Error(String(error));
  serverLogger.error(`Failed to load Cowork UI from ${indexPath}. Build the UI first.`, err);
  throw err;
}

const staticMiddleware = serveStatic({ root: staticDir });

app.use("/*", async (c, next) => {
  if (c.req.path.startsWith("/api")) {
    return next();
  }
  return staticMiddleware(c, next);
});

app.get("*", (c) => {
  if (c.req.path.startsWith("/api")) {
    return c.notFound();
  }
  return c.html(indexHtml);
});

export default app;

if (process.env.COWORK_SERVER_START === "true") {
  const { port } = serverConfig;
  serverLogger.info(`Cowork UI+API listening on http://localhost:${port}`);
  serve({
    port,
    fetch: app.fetch,
  });
}
