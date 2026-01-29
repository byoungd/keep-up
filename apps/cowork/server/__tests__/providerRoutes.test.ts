import type { CoworkProviderId } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProviderRoutes } from "../routes/providers";
import type { ProviderKeyService, ProviderKeyStatus } from "../services/providerKeyService";
import { getCoworkProviderIds } from "../services/providerKeyService";

const defaultStatus: ProviderKeyStatus = {
  providerId: "openai",
  hasKey: false,
  source: "none",
};

describe("Provider routes", () => {
  let app: Hono;
  let providerKeys: ProviderKeyService;

  beforeEach(() => {
    providerKeys = {
      getStatus: vi.fn(async (providerId: CoworkProviderId) => ({
        ...defaultStatus,
        providerId,
      })),
      setKey: vi.fn(async (providerId: CoworkProviderId) => ({
        providerId,
        encryptedKey: "encrypted",
        createdAt: 1,
        updatedAt: 2,
        lastValidatedAt: 3,
      })),
      deleteKey: vi.fn(async () => true),
    } as unknown as ProviderKeyService;

    app = createProviderRoutes({ providerKeys });
  });

  it("lists available providers", async () => {
    const res = await app.request("/providers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; providers: Array<{ id: string }> };
    expect(data.ok).toBe(true);
    const expectedIds = getCoworkProviderIds();
    expect(data.providers.length).toBe(expectedIds.length);
    const ids = data.providers.map((provider) => provider.id);
    for (const id of expectedIds) {
      expect(ids).toContain(id);
    }
  });

  it("rejects unsupported providers", async () => {
    const res = await app.request("/settings/providers/unknown/key");
    expect(res.status).toBe(400);
  });

  it("returns provider key status", async () => {
    const res = await app.request("/settings/providers/openai/key");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; providerId: string };
    expect(data.ok).toBe(true);
    expect(data.providerId).toBe("openai");
  });

  it("requires a provider key", async () => {
    const res = await app.request("/settings/providers/openai/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("stores provider keys", async () => {
    const res = await app.request("/settings/providers/openai/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sk-test" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; hasKey: boolean; source: string };
    expect(data.ok).toBe(true);
    expect(data.hasKey).toBe(true);
    expect(data.source).toBe("settings");
  });

  it("deletes provider keys", async () => {
    const res = await app.request("/settings/providers/openai/key", { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; removed: boolean };
    expect(data.ok).toBe(true);
    expect(data.removed).toBe(true);
  });
});
