import { createCoworkApp } from "./app";
import { type D1Database, createD1StorageLayer } from "./storage/d1Storage";

export type CoworkWorkerEnv = {
  COWORK_DB?: D1Database;
  COWORK_CORS_ORIGIN?: string;
};

let appPromise: Promise<ReturnType<typeof createCoworkApp>> | null = null;

async function getApp(env: CoworkWorkerEnv) {
  if (!env.COWORK_DB) {
    throw new Error("Missing COWORK_DB binding");
  }
  if (!appPromise) {
    const storage = await createD1StorageLayer(env.COWORK_DB);
    appPromise = Promise.resolve(
      createCoworkApp({
        storage,
        corsOrigin: env.COWORK_CORS_ORIGIN ?? "*",
        logger: console,
      })
    );
  }
  return appPromise;
}

export default {
  async fetch(request: Request, env: CoworkWorkerEnv): Promise<Response> {
    try {
      const app = await getApp(env);
      return app.fetch(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker initialization failed";
      return new Response(
        JSON.stringify({
          ok: false,
          error: { message },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
