/**
 * Docker Sandbox Manager
 *
 * Creates and manages Docker-based sandboxes for tool execution.
 */

import { PassThrough } from "node:stream";
import type Dockerode from "dockerode";
import type { Container } from "dockerode";
import type { RuntimeAssetManager } from "../assets";
import { createDockerClient } from "../docker/dockerClient";
import { createSandboxContainer } from "./containerFactory";
import { ContainerPool } from "./containerPool";
import type {
  SandboxContext,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxInfo,
} from "./sandboxContext";
import type { DockerSandboxPoolOptions, SandboxPolicy, SandboxSessionConfig } from "./types";

export interface SandboxManager {
  isAvailable(timeoutMs?: number): Promise<boolean>;
  getSandbox(id: string, config?: SandboxSessionConfig): Promise<SandboxContext>;
  createSandbox(id: string, config?: SandboxSessionConfig): Promise<SandboxContext>;
  closeSandbox(id: string): Promise<void>;
  listSandboxes(): SandboxInfo[];
  getSandboxInfo(id: string): SandboxInfo | null;
  dispose(): Promise<void>;
}

export interface DockerSandboxManagerOptions {
  docker?: Dockerode;
  image?: string;
  workspacePath?: string;
  containerWorkspacePath?: string;
  defaultPolicy?: SandboxPolicy;
  assetManager?: RuntimeAssetManager;
  pool?: DockerSandboxPoolOptions;
}

const DEFAULT_POLICY: SandboxPolicy = {
  network: "none",
  filesystem: "workspace-only",
  maxMemoryMB: 512,
  maxCpuPercent: 50,
  timeoutMs: 30_000,
};

const DEFAULT_IMAGE = "node:20-alpine";
const DEFAULT_CONTAINER_WORKSPACE = "/workspace";
const DEFAULT_POOL_OPTIONS: Required<
  Pick<DockerSandboxPoolOptions, "enabled" | "minSize" | "maxSize">
> = {
  enabled: true,
  minSize: 2,
  maxSize: 10,
};

export class DockerSandboxManager implements SandboxManager {
  private readonly docker: Dockerode;
  private readonly contexts = new Map<string, DockerSandboxContext>();
  private readonly image: string;
  private readonly workspacePath: string;
  private readonly containerWorkspacePath: string;
  private readonly defaultPolicy: SandboxPolicy;
  private readonly assetManager?: RuntimeAssetManager;
  private readonly poolOptions: DockerSandboxPoolOptions;
  private pool?: ContainerPool;

  constructor(options: DockerSandboxManagerOptions = {}) {
    this.assetManager = options.assetManager;
    this.docker = options.docker ?? options.assetManager?.getDockerClient() ?? createDockerClient();
    this.image = options.image ?? DEFAULT_IMAGE;
    this.workspacePath = options.workspacePath ?? process.cwd();
    this.containerWorkspacePath = options.containerWorkspacePath ?? DEFAULT_CONTAINER_WORKSPACE;
    this.defaultPolicy = options.defaultPolicy ?? DEFAULT_POLICY;
    this.poolOptions = { ...DEFAULT_POOL_OPTIONS, ...options.pool };
  }

  async isAvailable(timeoutMs = 1500): Promise<boolean> {
    try {
      const ping = this.docker.ping();
      const timeout = new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      );
      await Promise.race([ping, timeout]);
      return true;
    } catch {
      return false;
    }
  }

  async getSandbox(id: string, config: SandboxSessionConfig = {}): Promise<SandboxContext> {
    const existing = this.contexts.get(id);
    if (existing && !config.newContainer) {
      await existing.ensureRunning();
      return existing;
    }
    if (existing) {
      await existing.dispose();
      this.contexts.delete(id);
    }
    return this.createSandbox(id, config);
  }

  async createSandbox(id: string, config: SandboxSessionConfig = {}): Promise<SandboxContext> {
    const policy = config.policy ?? this.defaultPolicy;
    const workspacePath = config.workspacePath ?? this.workspacePath;
    const image = config.image ?? this.image;
    await this.ensureImageAvailable(image);
    const usePool = this.shouldUsePool(config, image, workspacePath);
    const container = usePool
      ? await this.getOrCreatePool().acquire()
      : await this.createContainer({
          image,
          workspacePath,
          policy,
        });

    const context = new DockerSandboxContext({
      id,
      container,
      image,
      workspacePath,
      containerWorkspacePath: this.containerWorkspacePath,
      policy,
      docker: this.docker,
      releaseContainer: usePool
        ? async (leased, clean) => {
            await this.getOrCreatePool().release(leased, clean);
          }
        : undefined,
    });
    this.contexts.set(id, context);
    return context;
  }

  async closeSandbox(id: string): Promise<void> {
    const context = this.contexts.get(id);
    if (!context) {
      return;
    }
    await context.dispose();
    this.contexts.delete(id);
  }

  listSandboxes(): SandboxInfo[] {
    return Array.from(this.contexts.values()).map((context) => context.info());
  }

  getSandboxInfo(id: string): SandboxInfo | null {
    const context = this.contexts.get(id);
    return context ? context.info() : null;
  }

  async dispose(): Promise<void> {
    const ids = Array.from(this.contexts.keys());
    for (const id of ids) {
      await this.closeSandbox(id);
    }
    if (this.pool) {
      await this.pool.dispose();
      this.pool = undefined;
    }
  }

  private async createContainer(input: {
    image: string;
    workspacePath: string;
    policy: SandboxPolicy;
  }): Promise<Container> {
    return createSandboxContainer({
      docker: this.docker,
      image: input.image,
      workspacePath: input.workspacePath,
      containerWorkspacePath: this.containerWorkspacePath,
      policy: input.policy,
    });
  }

  private async ensureImageAvailable(image: string): Promise<void> {
    if (!this.assetManager) {
      return;
    }
    const status = await this.assetManager.ensureDockerImage(image);
    if (!status.available) {
      throw new Error(status.reason ?? "Docker engine unavailable");
    }
    if (!status.imagePresent) {
      throw new Error(status.reason ?? `Docker image ${image} unavailable`);
    }
  }

  private shouldUsePool(
    config: SandboxSessionConfig,
    image: string,
    workspacePath: string
  ): boolean {
    if (!this.poolOptions.enabled) {
      return false;
    }
    if (this.poolOptions.maxSize !== undefined && this.poolOptions.maxSize < 1) {
      return false;
    }
    if (config.policy) {
      return false;
    }
    if (image !== this.image) {
      return false;
    }
    if (workspacePath !== this.workspacePath) {
      return false;
    }
    return true;
  }

  private getOrCreatePool(): ContainerPool {
    if (!this.pool) {
      this.pool = new ContainerPool(this.docker, {
        minSize: this.poolOptions.minSize ?? DEFAULT_POOL_OPTIONS.minSize,
        maxSize: this.poolOptions.maxSize ?? DEFAULT_POOL_OPTIONS.maxSize,
        idleTimeoutMs: this.poolOptions.idleTimeoutMs,
        healthCheckIntervalMs: this.poolOptions.healthCheckIntervalMs,
        resetCommand: this.poolOptions.resetCommand,
        resetTimeoutMs: this.poolOptions.resetTimeoutMs,
        image: this.image,
        workspacePath: this.workspacePath,
        containerWorkspacePath: this.containerWorkspacePath,
        policy: this.defaultPolicy,
      });
      this.pool.start();
    }
    return this.pool;
  }
}

class DockerSandboxContext implements SandboxContext {
  readonly id: string;
  readonly containerId: string;
  readonly image: string;
  readonly workspacePath: string;
  readonly containerWorkspacePath: string;
  readonly policy: SandboxPolicy;
  readonly createdAt: number;
  lastUsedAt: number;

  private readonly container: Container;
  private readonly docker: Dockerode;
  private readonly releaseContainer?: (container: Container, clean: boolean) => Promise<void>;
  private dirty = false;

  constructor(input: {
    id: string;
    container: Container;
    image: string;
    workspacePath: string;
    containerWorkspacePath: string;
    policy: SandboxPolicy;
    docker: Dockerode;
    releaseContainer?: (container: Container, clean: boolean) => Promise<void>;
  }) {
    this.id = input.id;
    this.container = input.container;
    this.containerId = input.container.id;
    this.image = input.image;
    this.workspacePath = input.workspacePath;
    this.containerWorkspacePath = input.containerWorkspacePath;
    this.policy = input.policy;
    this.docker = input.docker;
    this.releaseContainer = input.releaseContainer;
    this.createdAt = Date.now();
    this.lastUsedAt = this.createdAt;
  }

  async ensureRunning(): Promise<void> {
    try {
      const info = await this.container.inspect();
      if (!info.State?.Running) {
        await this.container.start();
      }
    } catch {
      // If inspect fails, caller should recreate container.
    }
  }

  async exec(command: string, options: SandboxExecOptions = {}): Promise<SandboxExecResult> {
    this.dirty = true;
    await this.ensureRunning();
    const startTime = Date.now();
    const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
    const timeoutMs = options.timeoutMs ?? this.policy.timeoutMs;
    let timedOut = false;

    const exec = await this.container.exec({
      Cmd: ["sh", "-lc", command],
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: Boolean(options.stdin),
      Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
      WorkingDir: options.cwd ?? this.containerWorkspacePath,
    });

    const stream = await exec.start({ hijack: true, stdin: Boolean(options.stdin) });
    if (options.stdin) {
      stream.write(options.stdin);
      stream.end();
    }

    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

    let stdout = "";
    let stderr = "";
    let truncated = false;

    stdoutStream.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length > maxOutputBytes) {
        truncated = true;
        const remaining = maxOutputBytes - stdout.length;
        if (remaining > 0) {
          stdout += chunk.subarray(0, remaining).toString();
        }
      } else {
        stdout += chunk.toString();
      }
    });

    stderrStream.on("data", (chunk: Buffer) => {
      if (stderr.length + chunk.length > maxOutputBytes) {
        truncated = true;
        const remaining = maxOutputBytes - stderr.length;
        if (remaining > 0) {
          stderr += chunk.subarray(0, remaining).toString();
        }
      } else {
        stderr += chunk.toString();
      }
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      void this.container.kill().catch(() => undefined);
    }, timeoutMs);

    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    }).finally(() => clearTimeout(timeout));

    const inspect = await exec.inspect().catch(() => null);
    const exitCode = inspect?.ExitCode ?? (timedOut ? -1 : 0);

    this.lastUsedAt = Date.now();

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startTime,
      timedOut,
      truncated,
    };
  }

  info(): SandboxInfo {
    return {
      id: this.id,
      containerId: this.containerId,
      image: this.image,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      workspacePath: this.workspacePath,
      containerWorkspacePath: this.containerWorkspacePath,
      policy: this.policy,
    };
  }

  async dispose(): Promise<void> {
    if (this.releaseContainer) {
      try {
        await this.releaseContainer(this.container, !this.dirty);
        return;
      } catch {
        // Fall through to container removal.
      }
    }
    try {
      await this.container.stop({ t: 2 });
    } catch {
      // Ignore stop errors
    }
    try {
      await this.container.remove({ force: true });
    } catch {
      // Ignore removal errors
    }
  }
}
