import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import Dockerode from "dockerode";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RuntimeAssetManager } from "../../assets/runtimeAssetManager";
import { ContainerPool } from "../containerPool";
import type { SandboxPolicy } from "../types";

const dockerSocketCandidates = [
  "/var/run/docker.sock",
  join(homedir(), ".docker/run/docker.sock"),
  join(homedir(), "Library/Containers/com.docker.docker/Data/docker-cli.sock"),
];
const resolvedDockerSocket = dockerSocketCandidates.find((candidate) => existsSync(candidate));
if (!process.env.DOCKER_HOST && resolvedDockerSocket) {
  process.env.DOCKER_HOST = `unix://${resolvedDockerSocket}`;
}
const hasDockerSocket = Boolean(resolvedDockerSocket) || Boolean(process.env.DOCKER_HOST);
const describeIf = hasDockerSocket ? describe : describe.skip;

const DEFAULT_POLICY: SandboxPolicy = {
  network: "none",
  filesystem: "workspace-only",
  maxMemoryMB: 256,
  maxCpuPercent: 50,
  timeoutMs: 30_000,
};

describeIf("ContainerPool (e2e)", () => {
  let workspaceDir = "";
  let assetCacheDir = "";
  let docker: Dockerode;
  let assetManager: RuntimeAssetManager;

  beforeAll(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "cowork-container-pool-"));
    assetCacheDir = await mkdtemp(join(tmpdir(), "cowork-container-assets-"));
    assetManager = new RuntimeAssetManager({
      cacheDir: assetCacheDir,
      docker: { pullOnDemand: true },
    });
    docker = new Dockerode();

    const status = await assetManager.ensureDockerImage("node:20-alpine");
    if (!status.available) {
      throw new Error(status.reason ?? "Docker engine unavailable for container pool test");
    }
    if (!status.imagePresent) {
      throw new Error(
        status.reason ?? "Docker image node:20-alpine unavailable for container pool test"
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
    if (assetCacheDir) {
      await rm(assetCacheDir, { recursive: true, force: true });
    }
  });

  it("reuses a container after release", async () => {
    const pool = new ContainerPool(docker, {
      minSize: 0,
      maxSize: 1,
      image: "node:20-alpine",
      workspacePath: workspaceDir,
      containerWorkspacePath: "/workspace",
      policy: DEFAULT_POLICY,
      resetCommand: "true",
      idleTimeoutMs: 0,
      healthCheckIntervalMs: 0,
    });

    try {
      const first = await pool.acquire();
      await pool.release(first, false);

      const second = await pool.acquire();
      expect(second.id).toBe(first.id);

      await pool.release(second, true);
    } finally {
      await pool.dispose();
    }
  }, 30_000);

  it("replaces a container when reset fails", async () => {
    const pool = new ContainerPool(docker, {
      minSize: 0,
      maxSize: 1,
      image: "node:20-alpine",
      workspacePath: workspaceDir,
      containerWorkspacePath: "/workspace",
      policy: DEFAULT_POLICY,
      resetCommand: "false",
      idleTimeoutMs: 0,
      healthCheckIntervalMs: 0,
    });

    try {
      const first = await pool.acquire();
      await pool.release(first, false);

      const second = await pool.acquire();
      expect(second.id).not.toBe(first.id);

      await pool.release(second, true);
    } finally {
      await pool.dispose();
    }
  }, 30_000);
});
