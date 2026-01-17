import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import Dockerode from "dockerode";
import { chromium } from "playwright";

type Logger = Pick<Console, "info" | "warn" | "error">;

export interface RuntimeAssetManagerOptions {
  cacheDir: string;
  logger?: Logger;
  playwright?: {
    browsersPath?: string;
    installOnDemand?: boolean;
    expectedDownloadMB?: number;
  };
  docker?: {
    pullOnDemand?: boolean;
    expectedDownloadMB?: number;
    client?: Dockerode;
  };
}

export interface PlaywrightAssetStatus {
  available: boolean;
  installed: boolean;
  browsersPath: string;
  executablePath?: string;
  expectedDownloadMB?: number;
  reason?: string;
}

export interface DockerAssetStatus {
  available: boolean;
  image: string;
  imagePresent: boolean;
  imageId?: string;
  expectedDownloadMB?: number;
  reason?: string;
}

type RuntimeAssetState = {
  schemaVersion: 1;
  playwright?: {
    browser: "chromium";
    playwrightVersion?: string;
    browsersPath: string;
    executablePath?: string;
    installedAt?: number;
  };
  docker?: Record<
    string,
    {
      image: string;
      imageId?: string;
      pulledAt?: number;
    }
  >;
};

const DEFAULT_STATE: RuntimeAssetState = {
  schemaVersion: 1,
  docker: {},
};

export class RuntimeAssetManager {
  private readonly cacheDir: string;
  private readonly logger?: Logger;
  private readonly playwrightOptions: NonNullable<RuntimeAssetManagerOptions["playwright"]>;
  private readonly dockerOptions: NonNullable<RuntimeAssetManagerOptions["docker"]>;
  private readonly statePath: string;
  private statePromise?: Promise<RuntimeAssetState>;
  private stateWritePromise: Promise<void> = Promise.resolve();
  private playwrightEnsurePromise?: Promise<PlaywrightAssetStatus>;
  private dockerEnsurePromises = new Map<string, Promise<DockerAssetStatus>>();
  private dockerClient: Dockerode;

  constructor(options: RuntimeAssetManagerOptions) {
    this.cacheDir = options.cacheDir;
    this.logger = options.logger;
    this.playwrightOptions = {
      browsersPath: options.playwright?.browsersPath,
      installOnDemand: options.playwright?.installOnDemand ?? true,
      expectedDownloadMB: options.playwright?.expectedDownloadMB,
    };
    this.dockerOptions = {
      pullOnDemand: options.docker?.pullOnDemand ?? true,
      expectedDownloadMB: options.docker?.expectedDownloadMB,
      client: options.docker?.client,
    };
    this.statePath = join(this.cacheDir, "runtime-assets.json");
    this.dockerClient = options.docker?.client ?? new Dockerode();
  }

  getDockerClient(): Dockerode {
    return this.dockerClient;
  }

  async inspectPlaywrightBrowser(): Promise<PlaywrightAssetStatus> {
    const config = this.getPlaywrightConfig();
    this.ensurePlaywrightEnv(config.browsersPath);
    const executablePath = chromium.executablePath();
    const installed = Boolean(executablePath && existsSync(executablePath));
    return {
      available: installed,
      installed,
      browsersPath: config.browsersPath,
      executablePath: installed ? executablePath : undefined,
      expectedDownloadMB: config.expectedDownloadMB,
      reason: installed ? undefined : "Playwright browsers not installed",
    };
  }

  async ensurePlaywrightBrowser(): Promise<PlaywrightAssetStatus> {
    if (this.playwrightEnsurePromise) {
      return this.playwrightEnsurePromise;
    }
    this.playwrightEnsurePromise = this.ensurePlaywrightBrowserInternal();
    try {
      return await this.playwrightEnsurePromise;
    } finally {
      this.playwrightEnsurePromise = undefined;
    }
  }

  async inspectDockerImage(image: string): Promise<DockerAssetStatus> {
    const resolvedImage = image;
    const available = await this.checkDockerAvailable();
    if (!available) {
      return {
        available: false,
        image: resolvedImage,
        imagePresent: false,
        expectedDownloadMB: this.dockerOptions.expectedDownloadMB,
        reason: "Docker engine not reachable",
      };
    }
    const inspect = await this.tryInspectImage(resolvedImage);
    return {
      available: true,
      image: resolvedImage,
      imagePresent: Boolean(inspect),
      imageId: inspect?.Id,
      expectedDownloadMB: this.dockerOptions.expectedDownloadMB,
      reason: inspect ? undefined : "Docker image not present",
    };
  }

  async ensureDockerImage(image: string): Promise<DockerAssetStatus> {
    const existing = this.dockerEnsurePromises.get(image);
    if (existing) {
      return existing;
    }
    const promise = this.ensureDockerImageInternal(image);
    this.dockerEnsurePromises.set(image, promise);
    try {
      return await promise;
    } finally {
      this.dockerEnsurePromises.delete(image);
    }
  }

  private async ensurePlaywrightBrowserInternal(): Promise<PlaywrightAssetStatus> {
    const status = await this.inspectPlaywrightBrowser();
    if (status.installed) {
      await this.recordPlaywrightState(status);
      return status;
    }
    const config = this.getPlaywrightConfig();
    if (!config.installOnDemand) {
      return status;
    }
    this.logger?.info("Playwright browsers missing; installing on demand.");
    const installResult = await installPlaywrightBrowser(config.browsersPath, this.logger);
    if (!installResult.success) {
      return {
        ...status,
        reason: installResult.error ?? "Playwright install failed",
      };
    }
    const updated = await this.inspectPlaywrightBrowser();
    if (updated.installed) {
      await this.recordPlaywrightState(updated);
    }
    return updated;
  }

  private async ensureDockerImageInternal(image: string): Promise<DockerAssetStatus> {
    const status = await this.inspectDockerImage(image);
    if (!status.available) {
      return status;
    }
    if (status.imagePresent) {
      await this.recordDockerState(status);
      return status;
    }
    if (!this.dockerOptions.pullOnDemand) {
      return status;
    }
    this.logger?.info(`Docker image ${image} missing; pulling on demand.`);
    const pulled = await pullDockerImage(this.dockerClient, image, this.logger);
    if (!pulled) {
      return {
        ...status,
        reason: "Docker image pull failed",
      };
    }
    const updated = await this.inspectDockerImage(image);
    if (updated.imagePresent) {
      await this.recordDockerState(updated);
    }
    return updated;
  }

  private async checkDockerAvailable(): Promise<boolean> {
    try {
      const ping = this.dockerClient.ping();
      const timeout = new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("timeout")), 1500)
      );
      await Promise.race([ping, timeout]);
      return true;
    } catch {
      return false;
    }
  }

  private async tryInspectImage(image: string): Promise<Dockerode.ImageInspectInfo | null> {
    try {
      return await this.dockerClient.getImage(image).inspect();
    } catch {
      return null;
    }
  }

  private getPlaywrightConfig(): {
    browsersPath: string;
    installOnDemand: boolean;
    expectedDownloadMB?: number;
  } {
    const envBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const browsersPath =
      this.playwrightOptions.browsersPath ??
      envBrowsersPath ??
      join(this.cacheDir, "playwright-browsers");
    return {
      browsersPath,
      installOnDemand: this.playwrightOptions.installOnDemand ?? true,
      expectedDownloadMB: this.playwrightOptions.expectedDownloadMB,
    };
  }

  private ensurePlaywrightEnv(browsersPath: string): void {
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
    }
  }

  private async recordPlaywrightState(status: PlaywrightAssetStatus): Promise<void> {
    if (!status.installed) {
      return;
    }
    const version = readPlaywrightVersion();
    await this.updateState((state) => ({
      ...state,
      playwright: {
        browser: "chromium",
        playwrightVersion: version,
        browsersPath: status.browsersPath,
        executablePath: status.executablePath,
        installedAt: Date.now(),
      },
    }));
  }

  private async recordDockerState(status: DockerAssetStatus): Promise<void> {
    if (!status.imagePresent) {
      return;
    }
    await this.updateState((state) => {
      const next = { ...state, docker: { ...(state.docker ?? {}) } };
      next.docker[status.image] = {
        image: status.image,
        imageId: status.imageId,
        pulledAt: Date.now(),
      };
      return next;
    });
  }

  private async updateState(
    updater: (state: RuntimeAssetState) => RuntimeAssetState
  ): Promise<void> {
    const current = await this.loadState();
    const next = updater(current);
    this.statePromise = Promise.resolve(next);
    this.stateWritePromise = this.stateWritePromise.then(async () => {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(this.statePath, JSON.stringify(next, null, 2), "utf-8");
    });
    await this.stateWritePromise;
  }

  private async loadState(): Promise<RuntimeAssetState> {
    if (this.statePromise) {
      return this.statePromise;
    }
    this.statePromise = loadStateFromDisk(this.statePath, this.logger);
    return this.statePromise;
  }
}

async function loadStateFromDisk(path: string, logger?: Logger): Promise<RuntimeAssetState> {
  try {
    if (!existsSync(path)) {
      return { ...DEFAULT_STATE };
    }
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as RuntimeAssetState;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      docker: { ...DEFAULT_STATE.docker, ...(parsed.docker ?? {}) },
    };
  } catch (error) {
    logger?.warn(
      `Failed to read runtime asset state: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ...DEFAULT_STATE };
  }
}

async function installPlaywrightBrowser(
  browsersPath: string,
  logger?: Logger
): Promise<{ success: boolean; error?: string }> {
  const cliPath = resolvePlaywrightCli();
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath };
  const result = await runCommand(process.execPath, [cliPath, "install", "chromium"], env);
  if (!result.success) {
    logger?.error(`Playwright install failed: ${result.error ?? "unknown error"}`);
  }
  return result;
}

function resolvePlaywrightCli(): string {
  const require = createRequire(import.meta.url);
  return require.resolve("playwright/cli");
}

function readPlaywrightVersion(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("playwright/package.json") as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
        return;
      }
      resolve({
        success: false,
        error: stderr ? stderr.trim() : `Command failed with exit code ${code ?? "unknown"}`,
      });
    });
  });
}

async function pullDockerImage(
  docker: Dockerode,
  image: string,
  logger?: Logger
): Promise<boolean> {
  return new Promise((resolve) => {
    docker.pull(image, (error: Error | null, stream: NodeJS.ReadableStream) => {
      if (error || !stream) {
        logger?.error(
          `Docker pull failed: ${error instanceof Error ? error.message : String(error)}`
        );
        resolve(false);
        return;
      }
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) {
          logger?.error(`Docker pull failed: ${err.message}`);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  });
}
