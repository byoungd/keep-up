import type { SandboxConfig as RuntimeSandboxConfig } from "@ku0/agent-runtime-core";
import {
  type Decision,
  type EnvVar,
  getNativeBinding,
  type NativeExecOptions,
  type NativeExecResult,
  type NativeSandbox,
  type NativeSandboxConfig,
} from "./native";

export type ActionIntent = "read" | "write" | "create" | "delete" | "rename" | "move";

export type SandboxConfig = Pick<
  RuntimeSandboxConfig,
  "networkAccess" | "allowedHosts" | "fsIsolation" | "workingDirectory"
>;

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
  maxOutputBytes?: number;
  env?: EnvVar[] | Record<string, string>;
}

export interface ExecResult extends NativeExecResult {}

export interface SandboxPolicy {
  evaluateFileAction(path: string, intent: ActionIntent): Decision;
  execute(cmd: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  read(path: string): Buffer;
  write(path: string, data: Buffer): void;
  list(path: string): string[];
}

export function createSandbox(config: SandboxConfig | RuntimeSandboxConfig): SandboxPolicy {
  const native = getNativeBinding();
  const sandbox = native.createSandbox(normalizeConfig(config));
  return wrapSandbox(sandbox);
}

function normalizeConfig(config: SandboxConfig | RuntimeSandboxConfig): NativeSandboxConfig {
  return {
    networkAccess: config.networkAccess,
    allowedHosts: config.allowedHosts,
    fsIsolation: config.fsIsolation,
    workingDirectory: config.workingDirectory,
  };
}

function wrapSandbox(sandbox: NativeSandbox): SandboxPolicy {
  return {
    evaluateFileAction: (path, intent) => sandbox.evaluateFileAction(path, intent),
    execute: (cmd, args, options) => sandbox.execute(cmd, args, normalizeExecOptions(options)),
    read: (path) => sandbox.read(path),
    write: (path, data) => sandbox.write(path, data),
    list: (path) => sandbox.list(path),
  };
}

function normalizeExecOptions(options?: ExecOptions): NativeExecOptions | undefined {
  if (!options) {
    return undefined;
  }
  const { env, ...rest } = options;
  if (!env) {
    return rest;
  }
  if (Array.isArray(env)) {
    return { ...rest, env };
  }

  const envArray: EnvVar[] = [];
  for (const [key, value] of Object.entries(env)) {
    envArray.push({ key, value });
  }
  return { ...rest, env: envArray };
}
