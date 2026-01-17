import { MODEL_CATALOG, PROVIDER_CATALOG } from "@ku0/ai-core";
import { Hono } from "hono";
import { jsonError, readJsonBody } from "../http";
import {
  getCoworkProviderIds,
  isCoworkProviderId,
  type ProviderKeyService,
  type ProviderKeyStatus,
} from "../services/providerKeyService";

interface ProviderRouteDeps {
  providerKeys: ProviderKeyService;
}

type ProviderResponse = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  accentColor?: string;
  icon?: string;
  models: Array<{
    id: string;
    label: string;
    shortLabel?: string;
    contextWindow: number;
    supports: {
      vision: boolean;
      tools: boolean;
      thinking: boolean;
    };
    pricing?: {
      inputTokensPer1M: number;
      outputTokensPer1M: number;
    };
  }>;
  hasKey: boolean;
  lastValidatedAt?: number;
  source: ProviderKeyStatus["source"];
};

type ProviderDisplay = {
  name: string;
  shortName: string;
  description?: string;
  accentColor?: string;
  icon?: string;
};

const PROVIDER_KIND_MAP: Record<string, string> = {
  openai: "openai",
  anthropic: "claude",
  gemini: "gemini",
};

export function createProviderRoutes(deps: ProviderRouteDeps) {
  const app = new Hono();

  app.get("/providers", async (c) => {
    const providerIds = getCoworkProviderIds();
    const providers: ProviderResponse[] = [];

    for (const providerId of providerIds) {
      const providerKind = PROVIDER_KIND_MAP[providerId] ?? providerId;
      const display: ProviderDisplay = PROVIDER_CATALOG.find((entry) => entry.id === providerKind)
        ?.display ?? {
        name: providerId,
        shortName: providerId,
      };

      const status = await deps.providerKeys.getStatus(providerId);
      const models = MODEL_CATALOG.filter((model) => model.provider === providerKind).map(
        (model) => ({
          id: model.id,
          label: model.label,
          shortLabel: model.shortLabel,
          contextWindow: model.contextWindow,
          supports: model.supports,
          pricing: model.pricing
            ? {
                inputTokensPer1M: model.pricing.inputTokensPer1M,
                outputTokensPer1M: model.pricing.outputTokensPer1M,
              }
            : undefined,
        })
      );

      providers.push({
        id: providerId,
        name: display.name,
        shortName: display.shortName,
        description: display.description,
        accentColor: display.accentColor,
        icon: display.icon,
        models,
        hasKey: status.hasKey,
        lastValidatedAt: status.lastValidatedAt,
        source: status.source,
      });
    }

    return c.json({ ok: true, providers });
  });

  app.get("/settings/providers/:providerId/key", async (c) => {
    const providerId = c.req.param("providerId");
    if (!isCoworkProviderId(providerId)) {
      return jsonError(c, 400, "Unsupported provider");
    }

    const status = await deps.providerKeys.getStatus(providerId);
    return c.json({
      ok: true,
      providerId,
      hasKey: status.hasKey,
      lastValidatedAt: status.lastValidatedAt,
      source: status.source,
    });
  });

  app.post("/settings/providers/:providerId/key", async (c) => {
    const providerId = c.req.param("providerId");
    if (!isCoworkProviderId(providerId)) {
      return jsonError(c, 400, "Unsupported provider");
    }

    const body = (await readJsonBody(c)) as { key?: string } | null;
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!key) {
      return jsonError(c, 400, "API key is required");
    }

    const record = await deps.providerKeys.setKey(providerId, key);
    return c.json({
      ok: true,
      providerId,
      hasKey: true,
      lastValidatedAt: record.lastValidatedAt ?? record.updatedAt,
      source: "settings",
    });
  });

  app.delete("/settings/providers/:providerId/key", async (c) => {
    const providerId = c.req.param("providerId");
    if (!isCoworkProviderId(providerId)) {
      return jsonError(c, 400, "Unsupported provider");
    }

    const removed = await deps.providerKeys.deleteKey(providerId);
    return c.json({
      ok: true,
      providerId,
      removed,
    });
  });

  return app;
}
