import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  const gymReportPath = resolveGymReportPath();

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

  app.get("/settings/gym-report", async (c) => {
    try {
      const payload = await readFile(gymReportPath, "utf-8");
      const report = JSON.parse(payload) as unknown;
      return c.json({ ok: true, gymReport: report });
    } catch (err) {
      if (err instanceof Error && err.message.includes("ENOENT")) {
        return c.json({ ok: true, gymReport: null });
      }
      return jsonError(
        c,
        500,
        "Failed to load gym report",
        err instanceof Error ? err.message : String(err)
      );
    }
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

function resolveGymReportPath(): string {
  if (process.env.COWORK_GYM_REPORT_PATH) {
    return path.resolve(process.env.COWORK_GYM_REPORT_PATH);
  }
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, "../../../../");
  return path.join(repoRoot, "packages/agent-gym/reports/latest.json");
}
