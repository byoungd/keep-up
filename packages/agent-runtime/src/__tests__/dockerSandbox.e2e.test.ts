import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxToolServer } from "@ku0/agent-runtime-tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RuntimeAssetManager } from "../assets";
import { DockerSandboxManager } from "../sandbox";
import type { ToolContext } from "../types";

const dockerSocketCandidates = [
  join(homedir(), "Library/Containers/com.docker.docker/Data/docker.raw.sock"),
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

function createContext(sessionId = "session-docker-e2e"): ToolContext {
  return {
    sessionId,
    security: {
      sandbox: {
        type: "docker",
        networkAccess: "none",
        fsIsolation: "workspace",
      },
      permissions: {
        bash: "sandbox",
        file: "workspace",
        code: "sandbox",
        network: "none",
        lfcc: "read",
      },
      limits: {
        maxExecutionTimeMs: 30_000,
        maxMemoryBytes: 256 * 1024 * 1024,
        maxOutputBytes: 1024 * 1024,
        maxConcurrentCalls: 3,
      },
    },
  };
}

describeIf("DockerSandboxManager (e2e)", () => {
  let workspaceDir = "";
  let assetCacheDir = "";
  let manager: DockerSandboxManager;
  let assetManager: RuntimeAssetManager;
  let server: SandboxToolServer;

  beforeAll(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "cowork-docker-e2e-"));
    assetCacheDir = await mkdtemp(join(tmpdir(), "cowork-docker-assets-"));
    assetManager = new RuntimeAssetManager({
      cacheDir: assetCacheDir,
      docker: { pullOnDemand: true },
    });
    manager = new DockerSandboxManager({
      workspacePath: workspaceDir,
      image: "node:20-alpine",
      assetManager,
    });
    server = new SandboxToolServer({ manager });
  });

  afterAll(async () => {
    if (manager) {
      await manager.dispose();
    }
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
    if (assetCacheDir) {
      await rm(assetCacheDir, { recursive: true, force: true });
    }
  });

  it("executes a command inside the sandbox container", async () => {
    const available = await manager.isAvailable();
    if (!available) {
      throw new Error("Docker engine not reachable for sandbox E2E test");
    }

    const context = createContext();
    const createResult = await server.callTool(
      {
        name: "create",
        arguments: { sessionId: context.sessionId, workspacePath: workspaceDir },
      },
      context
    );
    expect(createResult.success).toBe(true);

    const execResult = await server.callTool(
      {
        name: "exec",
        arguments: { sessionId: context.sessionId, command: "echo sandbox-ok" },
      },
      context
    );
    expect(execResult.success).toBe(true);
    const output = execResult.content[0];
    expect(output?.type).toBe("text");
    expect(output?.text).toContain("sandbox-ok");

    const destroyResult = await server.callTool(
      { name: "destroy", arguments: { sessionId: context.sessionId } },
      context
    );
    expect(destroyResult.success).toBe(true);
  }, 30_000);
});
