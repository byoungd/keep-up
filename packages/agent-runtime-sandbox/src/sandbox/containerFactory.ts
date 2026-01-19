/**
 * Docker Sandbox Container Factory
 *
 * Shared helpers for creating Docker containers used by sandbox tooling.
 */

import type Dockerode from "dockerode";
import type { Container, HostConfig } from "dockerode";
import type { SandboxPolicy } from "./types";

export interface SandboxContainerConfig {
  docker: Dockerode;
  image: string;
  workspacePath: string;
  containerWorkspacePath: string;
  policy: SandboxPolicy;
}

export async function createSandboxContainer(input: SandboxContainerConfig): Promise<Container> {
  const hostConfig = buildHostConfig(
    input.workspacePath,
    input.containerWorkspacePath,
    input.policy
  );
  const container = await input.docker.createContainer({
    Image: input.image,
    Cmd: ["sh", "-c", "tail -f /dev/null"],
    Tty: false,
    WorkingDir: input.containerWorkspacePath,
    HostConfig: hostConfig,
  });
  await container.start();
  return container;
}

export function buildHostConfig(
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
