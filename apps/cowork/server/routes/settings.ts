import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import { settingsPatchSchema } from "../schemas";
import type { ConfigStoreLike } from "../storage/contracts";

interface SettingsRouteDeps {
  config: ConfigStoreLike;
}

export function createSettingsRoutes(deps: SettingsRouteDeps) {
  const app = new Hono();

  app.get("/settings", async (c) => {
    const settings = await deps.config.get();
    return c.json({ ok: true, settings });
  });

  app.patch("/settings", async (c) => {
    const body = await readJsonBody(c);
    const parsed = settingsPatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid settings payload", formatZodError(parsed.error));
    }

    const updated = await deps.config.update((current) => ({
      ...current,
      ...parsed.data,
    }));

    return c.json({ ok: true, settings: updated });
  });

  return app;
}
