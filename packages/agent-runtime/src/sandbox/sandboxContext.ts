/**
 * Sandbox Context Types
 *
 * Defines the contract for sandbox execution contexts.
 */

import type { SandboxPolicy } from "./sandboxManager";

export interface SandboxExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
  maxOutputBytes?: number;
}

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export interface SandboxInfo {
  id: string;
  containerId: string;
  image: string;
  createdAt: number;
  lastUsedAt: number;
  workspacePath: string;
  containerWorkspacePath: string;
  policy: SandboxPolicy;
  status?: string;
}

export interface SandboxContext {
  id: string;
  containerId: string;
  image: string;
  workspacePath: string;
  containerWorkspacePath: string;
  policy: SandboxPolicy;
  createdAt: number;
  lastUsedAt: number;
  exec(command: string, options?: SandboxExecOptions): Promise<SandboxExecResult>;
  info(): SandboxInfo;
  dispose(): Promise<void>;
}
