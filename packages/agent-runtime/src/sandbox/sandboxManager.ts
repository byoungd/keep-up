/**
 * Docker Sandbox Manager
 *
 * Creates and manages Docker-based sandboxes for tool execution.
 */

import { PassThrough } from "node:stream";
import Dockerode, { type Container, type HostConfig } from "dockerode";
import type { RuntimeAssetManager } from "../assets";
import type {
  SandboxContext,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxInfo,
} from "./sandboxContext";

export interface SandboxPolicy {
  network: "none" | "allowlist" | "full";
  allowedHosts?: string[];
  filesystem: "read-only" | "workspace-only" | "full";
  maxMemoryMB: number;
  maxCpuPercent: number;
  timeoutMs: number;
}

export interface SandboxSessionConfig {
  newContainer?: boolean;
  policy?: SandboxPolicy;
  workspacePath?: string;
  image?: string;
}

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

export class DockerSandboxManager implements SandboxManager {
  private readonly docker: Dockerode;
  private readonly contexts = new Map<string, DockerSandboxContext>();
  private readonly image: string;
  private readonly workspacePath: string;
  private readonly containerWorkspacePath: string;
  private readonly defaultPolicy: SandboxPolicy;
  private readonly assetManager?: RuntimeAssetManager;

  constructor(options: DockerSandboxManagerOptions = {}) {
    this.assetManager = options.assetManager;
    this.docker = options.docker ?? options.assetManager?.getDockerClient() ?? new Dockerode();
    this.image = options.image ?? DEFAULT_IMAGE;
    this.workspacePath = options.workspacePath ?? process.cwd();
    this.containerWorkspacePath = options.containerWorkspacePath ?? DEFAULT_CONTAINER_WORKSPACE;
    this.defaultPolicy = options.defaultPolicy ?? DEFAULT_POLICY;
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
    const container = await this.createContainer({
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
  }

  private async createContainer(input: {
    image: string;
    workspacePath: string;
    policy: SandboxPolicy;
  }): Promise<Container> {
    const hostConfig = buildHostConfig(
      input.workspacePath,
      this.containerWorkspacePath,
      input.policy
    );
    const container = await this.docker.createContainer({
      Image: input.image,
      Cmd: ["sh", "-c", "tail -f /dev/null"],
      Tty: false,
      WorkingDir: this.containerWorkspacePath,
      HostConfig: hostConfig,
    });
    await container.start();
    return container;
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

  constructor(input: {
    id: string;
    container: Container;
    image: string;
    workspacePath: string;
    containerWorkspacePath: string;
    policy: SandboxPolicy;
    docker: Dockerode;
  }) {
    this.id = input.id;
    this.container = input.container;
    this.containerId = input.container.id;
    this.image = input.image;
    this.workspacePath = input.workspacePath;
    this.containerWorkspacePath = input.containerWorkspacePath;
    this.policy = input.policy;
    this.docker = input.docker;
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

function buildHostConfig(
  workspacePath: string,
  containerWorkspacePath: string,
  policy: SandboxPolicy
): HostConfig {
  const bindMode = policy.filesystem === "read-only" ? "ro" : "rw";
  const binds = [`${workspacePath}:${containerWorkspacePath}:${bindMode}`];
  const readonlyRoot = policy.filesystem !== "full";

  return {
    AutoRemove: false,
    // Docker does not enforce domain allowlists; keep network isolated when requested.
    NetworkMode: policy.network === "none" ? "none" : "bridge",
    Binds: binds,
    ReadonlyRootfs: readonlyRoot,
    Tmpfs: readonlyRoot ? { "/tmp": "rw", "/var/tmp": "rw" } : undefined,
    Memory: policy.maxMemoryMB * 1024 * 1024,
    NanoCpus: Math.round((policy.maxCpuPercent / 100) * 1e9),
  };
}
