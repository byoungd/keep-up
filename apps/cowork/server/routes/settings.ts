import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import { settingsPatchSchema } from "../schemas";
import type { ProviderKeyService } from "../services/providerKeyService";
import type { ConfigStoreLike } from "../storage/contracts";
import type { CoworkSettings } from "../storage/types";

interface SettingsRouteDeps {
  config: ConfigStoreLike;
  providerKeys: ProviderKeyService;
}

export function createSettingsRoutes(deps: SettingsRouteDeps) {
  const app = new Hono();

  app.get("/settings", async (c) => {
    const settings = await deps.config.get();
    return c.json({ ok: true, settings: stripKeyFields(settings) });
  });

  app.patch("/settings", async (c) => {
    const body = await readJsonBody(c);
    const parsed = settingsPatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid settings payload", formatZodError(parsed.error));
    }

    const { openAiKey, anthropicKey, geminiKey, ...rest } = parsed.data;
    if (openAiKey) {
      await deps.providerKeys.setKey("openai", openAiKey);
    }
    if (anthropicKey) {
      await deps.providerKeys.setKey("anthropic", anthropicKey);
    }
    if (geminiKey) {
      await deps.providerKeys.setKey("gemini", geminiKey);
    }

    const updated = await deps.config.update((current) => {
      const next = { ...current, ...rest };
      delete next.openAiKey;
      delete next.anthropicKey;
      delete next.geminiKey;
      return next;
    });

    return c.json({ ok: true, settings: stripKeyFields(updated) });
  });

  return app;
}

function stripKeyFields(settings: CoworkSettings): CoworkSettings {
  const next: CoworkSettings = { ...settings };
  delete next.openAiKey;
  delete next.anthropicKey;
  delete next.geminiKey;
  delete next.providerKeys;
  return next;
}
