import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServerManager } from "../services/mcpServerManager";

const mcpToolsMock = vi.hoisted(() => ({
  createMcpRemoteToolServer: vi.fn(),
}));

vi.mock("@ku0/agent-runtime-tools", () => ({
  createMcpRemoteToolServer: mcpToolsMock.createMcpRemoteToolServer,
}));

async function createManagerWithConfig(config: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "cowork-mcp-"));
  const configPath = join(dir, "mcp-settings.json");
  await writeFile(configPath, JSON.stringify(config), "utf-8");
  const manager = new McpServerManager({ stateDir: dir, configPath });
  return { dir, manager };
}

describe("McpServerManager health", () => {
  beforeEach(() => {
    mcpToolsMock.createMcpRemoteToolServer.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it("backs off after failures and retries after cooldown", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-28T00:00:00Z");
    vi.setSystemTime(now);

    const server = {
      name: "test",
      description: "Test server",
      getStatus: vi.fn(() => ({ state: "disconnected" })),
      initialize: vi
        .fn()
        .mockRejectedValueOnce(new Error("init failed"))
        .mockResolvedValueOnce(undefined),
      listToolsRaw: vi.fn().mockResolvedValue([]),
      callToolRaw: vi.fn(),
      listResources: vi.fn(),
      listResourceTemplates: vi.fn(),
      readResource: vi.fn(),
    };

    mcpToolsMock.createMcpRemoteToolServer.mockReturnValue(server);

    const { dir, manager } = await createManagerWithConfig({
      servers: [
        {
          name: "test",
          description: "Test server",
          transport: { type: "stdio", command: "echo" },
        },
      ],
    });

    try {
      await manager.initialize();
      await expect(manager.listTools("test")).rejects.toBeDefined();

      const healthAfterFailure = manager.listServers()[0]?.health;
      expect(healthAfterFailure?.status).toBe("cooldown");
      expect(healthAfterFailure?.nextRetryAt).toBeTruthy();

      const callCount = server.initialize.mock.calls.length;
      await expect(manager.listTools("test")).rejects.toThrow(/cooling down/);
      expect(server.initialize).toHaveBeenCalledTimes(callCount);

      vi.setSystemTime(new Date((healthAfterFailure?.nextRetryAt ?? Date.now()) + 1));
      await expect(manager.listTools("test")).resolves.toEqual([]);
      expect(server.initialize).toHaveBeenCalledTimes(callCount + 1);

      const healthAfterSuccess = manager.listServers()[0]?.health;
      expect(healthAfterSuccess?.status).toBe("healthy");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
