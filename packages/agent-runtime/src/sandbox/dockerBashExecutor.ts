/**
 * Docker Bash Executor
 *
 * Runs bash commands inside a Docker sandbox.
 */

import { relative, resolve } from "node:path";
import type { BashExecuteOptions, BashExecuteResult, IBashExecutor } from "../tools/core/bash";
import type { SandboxManager } from "./sandboxManager";

export interface DockerBashExecutorOptions {
  sessionId: string;
  workspacePath?: string;
  containerWorkspacePath?: string;
}

export class DockerBashExecutor implements IBashExecutor {
  private readonly sessionId: string;
  private readonly workspacePath?: string;
  private readonly containerWorkspacePath: string;

  constructor(
    private readonly manager: SandboxManager,
    options: DockerBashExecutorOptions
  ) {
    this.sessionId = options.sessionId;
    this.workspacePath = options.workspacePath ? resolve(options.workspacePath) : undefined;
    this.containerWorkspacePath = options.containerWorkspacePath ?? "/workspace";
  }

  async execute(command: string, options: BashExecuteOptions): Promise<BashExecuteResult> {
    const sandbox = await this.manager.getSandbox(this.sessionId);
    const mappedCommand = this.mapCommand(command);
    const cwd = this.mapPath(options.cwd) ?? this.containerWorkspacePath;

    const result = await sandbox.exec(mappedCommand, {
      cwd,
      env: options.env,
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut,
      truncated: result.truncated,
      durationMs: result.durationMs,
    };
  }

  private mapPath(path?: string): string | undefined {
    if (!path) {
      return undefined;
    }
    if (!this.workspacePath) {
      return path;
    }
    const normalized = resolve(path);
    if (!normalized.startsWith(this.workspacePath)) {
      return path;
    }
    const rel = relative(this.workspacePath, normalized);
    if (!rel) {
      return this.containerWorkspacePath;
    }
    return `${this.containerWorkspacePath}/${rel.split("\\").join("/")}`;
  }

  private mapCommand(command: string): string {
    if (!this.workspacePath) {
      return command;
    }
    const variants = new Set([this.workspacePath, this.workspacePath.split("\\").join("/")]);
    let mapped = command;
    for (const variant of variants) {
      mapped = mapped.split(variant).join(this.containerWorkspacePath);
    }
    return mapped;
  }
}

export function createDockerBashExecutor(
  manager: SandboxManager,
  options: DockerBashExecutorOptions
): DockerBashExecutor {
  return new DockerBashExecutor(manager, options);
}
