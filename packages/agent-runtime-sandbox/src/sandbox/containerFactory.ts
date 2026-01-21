/**
 * Docker Sandbox Container Factory
 *
 * Shared helpers for creating Docker containers used by sandbox tooling.
 */

import type Dockerode from "dockerode";
import type { Container, HostConfig } from "dockerode";
import { applyNetworkAllowlist, normalizeAllowedHosts } from "./networkAllowlist";
import type { SandboxPolicy } from "./types";

export interface SandboxContainerConfig {
  docker: Dockerode;
  image: string;
  workspacePath: string;
  containerWorkspacePath: string;
  policy: SandboxPolicy;
}

export async function createSandboxContainer(input: SandboxContainerConfig): Promise<Container> {
  const allowlistHosts = normalizeAllowedHosts(input.policy.allowedHosts);
  const hostConfig = buildHostConfig(
    input.workspacePath,
    input.containerWorkspacePath,
    input.policy,
    allowlistHosts
  );
  const container = await input.docker.createContainer({
    Image: input.image,
    Cmd: ["sh", "-c", "tail -f /dev/null"],
    Tty: false,
    WorkingDir: input.containerWorkspacePath,
    HostConfig: hostConfig,
  });
  await container.start();
  if (shouldApplyAllowlist(input.policy, allowlistHosts)) {
    try {
      await applyNetworkAllowlist({
        docker: input.docker,
        container,
        hosts: allowlistHosts,
      });
    } catch (error) {
      await container.remove({ force: true }).catch(() => undefined);
      throw error;
    }
  }
  return container;
}

export function buildHostConfig(
  workspacePath: string,
  containerWorkspacePath: string,
  policy: SandboxPolicy,
  allowlistHosts: string[] = []
): HostConfig {
  const allowlistEnabled = shouldApplyAllowlist(policy, allowlistHosts);
  const bindMode = policy.filesystem === "read-only" ? "ro" : "rw";
  const binds = [`${workspacePath}:${containerWorkspacePath}:${bindMode}`];
  const readonlyRoot = policy.filesystem !== "full";

  return {
    AutoRemove: false,
    // Docker does not enforce domain allowlists; keep network isolated when requested.
    NetworkMode:
      policy.network === "none" || (policy.network === "allowlist" && !allowlistEnabled)
        ? "none"
        : "bridge",
    Binds: binds,
    ReadonlyRootfs: readonlyRoot,
    Tmpfs: readonlyRoot ? { "/tmp": "rw", "/var/tmp": "rw" } : undefined,
    Memory: policy.maxMemoryMB * 1024 * 1024,
    NanoCpus: Math.round((policy.maxCpuPercent / 100) * 1e9),
    CapAdd: allowlistEnabled ? ["NET_ADMIN", "NET_RAW"] : undefined,
    SecurityOpt: ["no-new-privileges"],
  };
}

function shouldApplyAllowlist(policy: SandboxPolicy, allowlistHosts: string[]): boolean {
  return policy.network === "allowlist" && allowlistHosts.length > 0;
}
