import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCoworkPolicyConfig } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import { resolveCoworkPolicyConfig } from "../runtime/policyResolver";
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

    const { openAiKey, anthropicKey, geminiKey, policy, ...rest } = parsed.data;
    let validatedPolicy: CoworkSettings["policy"] | undefined;
    if (policy !== undefined && policy !== null) {
      const parsedPolicy = parseCoworkPolicyConfig(policy);
      if (!parsedPolicy) {
        return jsonError(c, 400, "Invalid policy config");
      }
      validatedPolicy = parsedPolicy;
    }
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
      if (policy !== undefined) {
        if (policy === null) {
          next.policy = null;
        } else if (validatedPolicy) {
          next.policy = validatedPolicy;
        }
      }
      delete next.openAiKey;
      delete next.anthropicKey;
      delete next.geminiKey;
      return next;
    });

    return c.json({ ok: true, settings: stripKeyFields(updated) });
  });

  app.get("/settings/policy", async (c) => {
    const settings = await deps.config.get();
    const resolution = await resolveCoworkPolicyConfig({
      repoRoot: resolveRepoRoot(),
      settings,
    });

    return c.json({
      ok: true,
      policy: resolution.config,
      source: resolution.source,
      reason: resolution.reason ?? null,
    });
  });

  app.post("/settings/policy/export", async (c) => {
    const settings = await deps.config.get();
    const resolution = await resolveCoworkPolicyConfig({
      repoRoot: resolveRepoRoot(),
      settings,
    });

    if (resolution.source === "deny_all") {
      return jsonError(
        c,
        400,
        "Policy export blocked",
        resolution.reason ?? "Invalid policy configuration"
      );
    }

    const policyDir = path.join(resolveRepoRoot(), ".keepup");
    const policyPath = path.join(policyDir, "policy.json");
    await mkdir(policyDir, { recursive: true });
    await writeFile(policyPath, `${JSON.stringify(resolution.config, null, 2)}\n`, "utf-8");

    return c.json({ ok: true, source: resolution.source, path: policyPath });
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

function resolveRepoRoot(): string {
  return process.cwd();
}
