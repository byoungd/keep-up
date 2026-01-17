import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import type { PipelineRunner } from "../pipelines/pipelineRunner";
import { pipelineInputSchema, pipelineSchema } from "../pipelines/pipelineSchema";
import type { PipelineStore } from "../pipelines/pipelineStore";
import { triggerWebhookPipeline } from "../pipelines/triggers/webhook";

interface PipelineRouteDeps {
  store: PipelineStore;
  runner: PipelineRunner;
}

export function createPipelineRoutes(deps: PipelineRouteDeps) {
  const app = new Hono();

  app.get("/pipelines", async (c) => {
    const pipelines = await deps.store.getAllPipelines();
    return c.json({ ok: true, pipelines });
  });

  app.get("/pipelines/:pipelineId", async (c) => {
    const pipelineId = c.req.param("pipelineId");
    const pipeline = await deps.store.getPipelineById(pipelineId);
    if (!pipeline) {
      return jsonError(c, 404, "Pipeline not found");
    }
    return c.json({ ok: true, pipeline });
  });

  app.post("/pipelines", async (c) => {
    const body = await readJsonBody(c);
    const parsed = pipelineInputSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid pipeline payload", formatZodError(parsed.error));
    }
    const now = Date.now();
    const pipeline = pipelineSchema.parse({
      ...parsed.data,
      pipelineId: parsed.data.pipelineId ?? crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    await deps.store.createPipeline(pipeline);
    return c.json({ ok: true, pipeline }, 201);
  });

  app.post("/pipelines/:pipelineId/run", async (c) => {
    const pipelineId = c.req.param("pipelineId");
    const body = (await readJsonBody(c)) as Record<string, unknown> | null;
    const input =
      body?.input && typeof body.input === "object"
        ? (body.input as Record<string, unknown>)
        : undefined;

    try {
      const run = await deps.runner.startRun(pipelineId, input);
      return c.json({ ok: true, run }, 202);
    } catch (error) {
      return jsonError(c, 400, error instanceof Error ? error.message : String(error));
    }
  });

  app.get("/pipelines/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    const run = await deps.store.getRunById(runId);
    if (!run) {
      return jsonError(c, 404, "Pipeline run not found");
    }
    return c.json({ ok: true, run });
  });

  app.post("/pipelines/triggers/webhook/:pipelineId", async (c) => {
    const pipelineId = c.req.param("pipelineId");
    const payload = (await readJsonBody(c)) as Record<string, unknown> | null;
    const input = payload && typeof payload === "object" ? payload : undefined;

    try {
      const run = await triggerWebhookPipeline(deps.runner, pipelineId, input ?? undefined);
      return c.json({ ok: true, run }, 202);
    } catch (error) {
      return jsonError(c, 400, error instanceof Error ? error.message : String(error));
    }
  });

  app.post("/pipelines/triggers/github/:pipelineId", (c) =>
    jsonError(c, 501, "GitHub trigger not implemented yet")
  );

  app.post("/pipelines/triggers/linear/:pipelineId", (c) =>
    jsonError(c, 501, "Linear trigger not implemented yet")
  );

  return app;
}
