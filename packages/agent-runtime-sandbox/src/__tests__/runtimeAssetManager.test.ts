import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Dockerode from "dockerode";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let mockExecutablePath = "";

vi.mock("playwright", () => ({
  chromium: {
    executablePath: () => mockExecutablePath,
  },
}));

let RuntimeAssetManager: typeof import("../assets/runtimeAssetManager").RuntimeAssetManager;

const originalBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;

beforeAll(async () => {
  ({ RuntimeAssetManager } = await import("../assets/runtimeAssetManager"));
});

afterEach(async () => {
  if (originalBrowsersPath === undefined) {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  } else {
    process.env.PLAYWRIGHT_BROWSERS_PATH = originalBrowsersPath;
  }
  mockExecutablePath = "";
});

function createDockerClientStub(options: {
  pingReject?: boolean;
  inspectInfo?: Dockerode.ImageInspectInfo | null;
}): Dockerode {
  const ping = options.pingReject
    ? vi.fn().mockRejectedValue(new Error("unavailable"))
    : vi.fn().mockResolvedValue("OK");
  const inspect = options.inspectInfo
    ? vi.fn().mockResolvedValue(options.inspectInfo)
    : vi.fn().mockRejectedValue(new Error("not found"));

  const client = {
    ping,
    getImage: vi.fn().mockReturnValue({ inspect }),
    pull: vi.fn(),
    modem: {
      followProgress: vi.fn(),
    },
  };

  return client as unknown as Dockerode;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "runtime-assets-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("RuntimeAssetManager", () => {
  it("detects an installed Playwright browser", async () => {
    await withTempDir(async (dir) => {
      const browsersPath = join(dir, "browsers");
      const executablePath = join(dir, "chromium");
      await writeFile(executablePath, "stub");
      mockExecutablePath = executablePath;

      delete process.env.PLAYWRIGHT_BROWSERS_PATH;

      const manager = new RuntimeAssetManager({
        cacheDir: dir,
        playwright: {
          browsersPath,
          installOnDemand: false,
        },
      });

      const status = await manager.inspectPlaywrightBrowser();
      expect(status.available).toBe(true);
      expect(status.installed).toBe(true);
      expect(status.executablePath).toBe(executablePath);
      expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(browsersPath);
    });
  });

  it("respects installOnDemand=false for Playwright", async () => {
    await withTempDir(async (dir) => {
      mockExecutablePath = join(dir, "missing-chromium");

      const manager = new RuntimeAssetManager({
        cacheDir: dir,
        playwright: {
          installOnDemand: false,
        },
      });

      const status = await manager.ensurePlaywrightBrowser();
      expect(status.available).toBe(false);
      expect(status.installed).toBe(false);
      expect(status.reason).toBe("Playwright browsers not installed");
    });
  });

  it("returns unavailable when Docker engine is not reachable", async () => {
    await withTempDir(async (dir) => {
      const dockerClient = createDockerClientStub({ pingReject: true });
      const manager = new RuntimeAssetManager({
        cacheDir: dir,
        docker: {
          client: dockerClient,
        },
      });

      const status = await manager.inspectDockerImage("node:20-alpine");
      expect(status.available).toBe(false);
      expect(status.imagePresent).toBe(false);
      expect(status.reason).toBe("Docker engine not reachable");
    });
  });

  it("records Docker image metadata when present", async () => {
    await withTempDir(async (dir) => {
      const imageId = "sha256:abc";
      const dockerClient = createDockerClientStub({
        inspectInfo: { Id: imageId } as Dockerode.ImageInspectInfo,
      });
      const manager = new RuntimeAssetManager({
        cacheDir: dir,
        docker: {
          client: dockerClient,
          pullOnDemand: false,
        },
      });

      const status = await manager.ensureDockerImage("node:20-alpine");
      expect(status.available).toBe(true);
      expect(status.imagePresent).toBe(true);
      expect(status.imageId).toBe(imageId);

      const raw = await readFile(join(dir, "runtime-assets.json"), "utf-8");
      const state = JSON.parse(raw) as {
        docker?: Record<string, { imageId?: string }>;
      };
      expect(state.docker?.["node:20-alpine"]?.imageId).toBe(imageId);
    });
  });
});
