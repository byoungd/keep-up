import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));

export interface NativeSandboxBinding {
  createSandbox(config: NativeSandboxConfig): NativeSandbox;
}

export interface NativeSandboxConfig {
  networkAccess: string;
  allowedHosts?: string[];
  fsIsolation: string;
  workingDirectory?: string;
}

export interface NativeExecOptions {
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
  maxOutputBytes?: number;
  env?: EnvVar[];
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface NativeExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export interface Decision {
  decision: string;
  reason?: string;
}

export interface NativeSandbox {
  evaluateFileAction(path: string, intent: string): Decision;
  execute(cmd: string, args: string[], options?: NativeExecOptions): Promise<NativeExecResult>;
  read(path: string): Buffer;
  write(path: string, data: Buffer): void;
  list(path: string): string[];
}

let cached: NativeSandboxBinding | null = null;

export function getNativeBinding(): NativeSandboxBinding {
  if (cached) {
    return cached;
  }

  const explicit = process.env.SANDBOX_RS_BINDING_PATH;
  if (explicit) {
    cached = require(explicit) as NativeSandboxBinding;
    return cached;
  }

  const candidates = [
    join(currentDir, "sandbox-rs.node"),
    join(currentDir, "sandbox_rs.node"),
    join(currentDir, "..", "sandbox-rs.node"),
    join(currentDir, "..", "sandbox_rs.node"),
    join(currentDir, "..", "target", "debug", "sandbox_rs.node"),
    join(currentDir, "..", "target", "release", "sandbox_rs.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cached = require(candidate) as NativeSandboxBinding;
      return cached;
    }
  }

  throw new Error(
    "Sandbox native binding not found. Build with `cargo build` or set SANDBOX_RS_BINDING_PATH."
  );
}
