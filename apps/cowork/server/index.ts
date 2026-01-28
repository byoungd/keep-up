import "./env";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { CriticAgent, createLessonStore } from "@ku0/agent-runtime";
import { createEventBus } from "@ku0/agent-runtime-control";
import { createCoworkApp } from "./app";
import { serverConfig } from "./config";
import { serverLogger } from "./logger";
import { createPipelineRunner } from "./pipelines/pipelineRunner";
import { createPipelineStore } from "./pipelines/pipelineStore";
import { CoworkTaskRuntime } from "./runtime/coworkTaskRuntime";
import { createGatewayControlRuntime } from "./runtime/gatewayControl";
import { createAIEnvelopeGateway } from "./runtime/lfccEnvelopeGateway";
import { ContextIndexManager } from "./services/contextIndexManager";
import { McpServerManager } from "./services/mcpServerManager";
import { createStorageLayer } from "./storage";
import { ensureStateDir } from "./storage/statePaths";
import { SessionEventHub } from "./streaming/eventHub";

const storage = await createStorageLayer(serverConfig.storage);
const stateDir = await ensureStateDir();
const eventHub = new SessionEventHub();
const runtimeEventBus = createEventBus();
const contextIndexManager = new ContextIndexManager({ stateDir });
const mcpServers = new McpServerManager({
  stateDir,
  eventBus: runtimeEventBus,
  logger: serverLogger,
});
await mcpServers.initialize();
const pipelineStore = await createPipelineStore();
const pipelineRunner = createPipelineRunner({ store: pipelineStore, logger: serverLogger });
void pipelineRunner.resumePendingRuns();
const aiEnvelopeGateway = createAIEnvelopeGateway(serverLogger);
const lessonVectorPath =
  process.env.COWORK_LESSON_VECTOR_PATH ?? join(stateDir, "lessons.vectors.sqlite");
const sqliteVecPath = process.env.COWORK_SQLITE_VEC_PATH;
const vectorStoreExtensions = sqliteVecPath
  ? [
      {
        name: "sqlite-vec",
        load: (db: { loadExtension: (path: string) => void }) => {
          db.loadExtension(sqliteVecPath);
        },
      },
    ]
  : undefined;
const lessonStore = createLessonStore({
  filePath: join(stateDir, "lessons.json"),
  vectorStorePath: lessonVectorPath,
  vectorStoreExtensions,
  vectorStoreIgnoreExtensionErrors: process.env.COWORK_SQLITE_VEC_IGNORE_ERRORS === "true",
  vectorStoreUseVec: Boolean(sqliteVecPath),
  vectorStoreDistanceMetric: "cosine",
});
const critic = new CriticAgent({ lessonStore, logger: serverLogger });
const taskRuntime = new CoworkTaskRuntime({
  storage,
  events: eventHub,
  eventBus: runtimeEventBus,
  logger: serverLogger,
  contextIndexManager,
  runtimePersistence: serverConfig.runtimePersistence,
  lfcc: aiEnvelopeGateway ? { aiEnvelopeGateway } : undefined,
  lessonStore,
  mcpServers,
});
const gatewayRuntime = createGatewayControlRuntime({
  gateway: serverConfig.gatewayControl,
  telegram: serverConfig.telegram,
  discord: serverConfig.discord,
  taskRuntime,
  eventBus: runtimeEventBus,
});
const app = createCoworkApp({
  storage,
  corsOrigin: serverConfig.corsOrigin,
  logger: serverLogger,
  events: eventHub,
  taskRuntime,
  gatewayRuntime,
  contextIndexManager,
  pipelineStore,
  pipelineRunner,
  lessonStore,
  critic,
  mcpServers,
});

export default app;

if (process.env.COWORK_SERVER_START === "true") {
  const { port } = serverConfig;
  serverLogger.info(`Server listening on http://localhost:${port}`);
  await gatewayRuntime.start();
  serve({
    port,
    fetch: app.fetch,
  });
}
