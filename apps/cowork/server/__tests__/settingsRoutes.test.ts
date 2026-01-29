import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoworkPolicyConfig } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsRoutes } from "../routes/settings";
import type { ProviderKeyService } from "../services/providerKeyService";
import type { ConfigStoreLike } from "../storage/contracts";
import type { CoworkSettings, ProviderKeyRecord } from "../storage/types";

class MockConfigStore implements ConfigStoreLike {
  constructor(private settings: CoworkSettings) {}

  async get(): Promise<CoworkSettings> {
    return this.settings;
  }

  async set(next: CoworkSettings): Promise<CoworkSettings> {
    this.settings = next;
    return next;
  }

  async update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings> {
    this.settings = updater(this.settings);
    return this.settings;
  }
}

function createProviderKeyRecord(providerId: ProviderKeyRecord["providerId"]): ProviderKeyRecord {
  return {
    providerId,
    encryptedKey: "encrypted",
    createdAt: 1,
    updatedAt: 1,
    lastValidatedAt: 1,
  };
}

function createPolicyConfig(): CoworkPolicyConfig {
  return {
    version: "1.0",
    defaults: { fallback: "deny" },
    rules: [
      {
        id: "allow-network",
        action: "network.request",
        decision: "allow",
        riskTags: ["network"],
      },
    ],
  };
}

describe("Settings routes", () => {
  let app: Hono;
  let configStore: MockConfigStore;
  let providerKeys: ProviderKeyService;

  beforeEach(() => {
    configStore = new MockConfigStore({
      theme: "light",
      openAiKey: "legacy-key",
      providerKeys: {
        openai: createProviderKeyRecord("openai"),
      },
    });

    providerKeys = {
      setKey: vi.fn().mockResolvedValue(createProviderKeyRecord("openai")),
    } as unknown as ProviderKeyService;

    app = createSettingsRoutes({
      config: configStore,
      providerKeys,
    });
  });

  it("returns settings with keys stripped", async () => {
    const res = await app.request("/settings");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; settings: CoworkSettings };
    expect(data.ok).toBe(true);
    expect(data.settings.openAiKey).toBeUndefined();
    expect(data.settings.providerKeys).toBeUndefined();
  });

  it("rejects invalid settings payloads", async () => {
    const res = await app.request("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "blue" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid policy configs", async () => {
    const res = await app.request("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: { version: "1.0", defaults: {}, rules: [] } }),
    });
    expect(res.status).toBe(400);
  });

  it("updates settings and delegates provider keys", async () => {
    const res = await app.request("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "dark", openAiKey: "sk-test" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; settings: CoworkSettings };
    expect(data.ok).toBe(true);
    expect(data.settings.theme).toBe("dark");
    expect(data.settings.openAiKey).toBeUndefined();
    expect(data.settings.providerKeys).toBeUndefined();

    const stored = await configStore.get();
    expect(stored.theme).toBe("dark");
    expect(stored.openAiKey).toBeUndefined();
    expect(stored.providerKeys?.openai?.providerId).toBe("openai");

    const setKey = providerKeys.setKey as ReturnType<typeof vi.fn>;
    expect(setKey).toHaveBeenCalledWith("openai", "sk-test");
  });
});

describe("Settings policy routes", () => {
  let app: Hono;
  let configStore: MockConfigStore;
  let providerKeys: ProviderKeyService;
  let workingDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workingDir = await mkdtemp(join(tmpdir(), "cowork-settings-policy-"));
    process.chdir(workingDir);

    configStore = new MockConfigStore({
      policy: createPolicyConfig(),
    });
    providerKeys = { setKey: vi.fn() } as unknown as ProviderKeyService;
    app = createSettingsRoutes({ config: configStore, providerKeys });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workingDir, { recursive: true, force: true });
  });

  it("returns the resolved policy", async () => {
    const res = await app.request("/settings/policy");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      policy: CoworkPolicyConfig;
      source: string;
    };
    expect(data.ok).toBe(true);
    expect(data.source).toBe("settings");
    expect(data.policy).toEqual(createPolicyConfig());
  });

  it("exports the resolved policy to disk", async () => {
    const res = await app.request("/settings/policy/export", { method: "POST" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; path: string };
    expect(data.ok).toBe(true);
    expect(data.path.endsWith("/.keepup/policy.json")).toBe(true);

    const payload = await readFile(data.path, "utf-8");
    const parsed = JSON.parse(payload) as CoworkPolicyConfig;
    expect(parsed).toEqual(createPolicyConfig());
  });

  it("blocks exports when policy resolution denies all", async () => {
    configStore = new MockConfigStore({
      policy: { version: "1.0", defaults: {}, rules: [] } as unknown as CoworkPolicyConfig,
    });
    app = createSettingsRoutes({ config: configStore, providerKeys });

    const res = await app.request("/settings/policy/export", { method: "POST" });
    expect(res.status).toBe(400);
  });
});
