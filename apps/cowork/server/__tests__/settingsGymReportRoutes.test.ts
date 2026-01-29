import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsRoutes } from "../routes/settings";
import type { ProviderKeyService } from "../services/providerKeyService";
import type { ConfigStoreLike } from "../storage/contracts";
import type { CoworkSettings } from "../storage/types";

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

describe("Settings gym report routes", () => {
  let app: Hono;
  let reportDir: string;
  let reportPath: string;
  let originalPath: string | undefined;

  beforeEach(async () => {
    originalPath = process.env.COWORK_GYM_REPORT_PATH;
    reportDir = await mkdtemp(join(tmpdir(), "cowork-gym-report-"));
    reportPath = join(reportDir, "report.json");
    process.env.COWORK_GYM_REPORT_PATH = reportPath;

    const configStore = new MockConfigStore({});
    const providerKeys = { setKey: vi.fn() } as unknown as ProviderKeyService;
    app = createSettingsRoutes({ config: configStore, providerKeys });
  });

  afterEach(async () => {
    if (originalPath === undefined) {
      delete process.env.COWORK_GYM_REPORT_PATH;
    } else {
      process.env.COWORK_GYM_REPORT_PATH = originalPath;
    }
    await rm(reportDir, { recursive: true, force: true });
  });

  it("returns the gym report payload when present", async () => {
    const payload = { score: 92, scenarios: [{ id: "alpha", passed: true }] };
    await writeFile(reportPath, JSON.stringify(payload), "utf-8");

    const res = await app.request("/settings/gym-report");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; gymReport: unknown };
    expect(data.ok).toBe(true);
    expect(data.gymReport).toEqual(payload);
  });

  it("returns null when the gym report is missing", async () => {
    const res = await app.request("/settings/gym-report");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; gymReport: unknown };
    expect(data.ok).toBe(true);
    expect(data.gymReport).toBeNull();
  });
});
