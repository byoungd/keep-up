import "./env";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { CriticAgent, createLessonStore } from "@ku0/agent-runtime";
import { createCoworkApp } from "./app";
import { serverConfig } from "./config";
import { serverLogger } from "./logger";
import { createPipelineRunner } from "./pipelines/pipelineRunner";
import { createPipelineStore } from "./pipelines/pipelineStore";
import { CoworkTaskRuntime } from "./runtime/coworkTaskRuntime";
import { createAIEnvelopeGateway } from "./runtime/lfccEnvelopeGateway";
import { ContextIndexManager } from "./services/contextIndexManager";
import { createStorageLayer } from "./storage";
import { ensureStateDir } from "./storage/statePaths";
import { SessionEventHub } from "./streaming/eventHub";

const storage = await createStorageLayer(serverConfig.storage);
const stateDir = await ensureStateDir();
const eventHub = new SessionEventHub();
const contextIndexManager = new ContextIndexManager({ stateDir });
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
});
const critic = new CriticAgent({ lessonStore, logger: serverLogger });
const taskRuntime = new CoworkTaskRuntime({
  storage,
  events: eventHub,
  logger: serverLogger,
  contextIndexManager,
  runtimePersistence: serverConfig.runtimePersistence,
  lfcc: aiEnvelopeGateway ? { aiEnvelopeGateway } : undefined,
  lessonStore,
});
const app = createCoworkApp({
  storage,
  corsOrigin: serverConfig.corsOrigin,
  logger: serverLogger,
  events: eventHub,
  taskRuntime,
  contextIndexManager,
  pipelineStore,
  pipelineRunner,
  lessonStore,
  critic,
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
