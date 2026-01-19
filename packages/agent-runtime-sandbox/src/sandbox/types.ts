/**
 * Sandbox Types
 *
 * Shared sandbox configuration interfaces.
 */

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

export interface DockerSandboxPoolOptions {
  enabled?: boolean;
  minSize?: number;
  maxSize?: number;
  idleTimeoutMs?: number;
  healthCheckIntervalMs?: number;
  resetCommand?: string;
  resetTimeoutMs?: number;
}
