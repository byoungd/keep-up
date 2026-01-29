import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpAppsRoutes } from "../routes/mcpApps";
import type { McpServerManager } from "../services/mcpServerManager";

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => R : T[K];
};

const baseHealth = {
  status: "healthy" as const,
  failures: 0,
};

function createMockManager(): Mocked<McpServerManager> {
  return {
    getConfig: vi.fn().mockResolvedValue({ servers: [] }),
    updateConfig: vi.fn().mockResolvedValue({ servers: [] }),
    listServers: vi
      .fn()
      .mockReturnValue([
        { name: "alpha", description: "Alpha", status: "online", health: baseHealth },
      ]),
    listTools: vi.fn().mockResolvedValue([{ name: "tool-a" }]),
    callTool: vi.fn().mockResolvedValue({ ok: true }),
    updateTokenStoreSelectors: vi
      .fn()
      .mockResolvedValue({ name: "alpha", tokenStore: { type: "memory" } }),
    listResources: vi.fn().mockResolvedValue({ resources: [], nextCursor: null }),
    listResourceTemplates: vi.fn().mockResolvedValue({ templates: [], nextCursor: null }),
    readResource: vi.fn().mockResolvedValue({ uri: "file://demo", mimeType: "text/plain" }),
  } as unknown as Mocked<McpServerManager>;
}

describe("MCP apps routes", () => {
  let app: Hono;
  let mcpServers: Mocked<McpServerManager>;

  beforeEach(() => {
    mcpServers = createMockManager();
    app = createMcpAppsRoutes({ mcpServers: mcpServers as unknown as McpServerManager });
  });

  it("returns MCP config", async () => {
    const res = await app.request("/mcp/config");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; config: unknown };
    expect(data.ok).toBe(true);
    expect(mcpServers.getConfig).toHaveBeenCalled();
    expect(data.config).toEqual({ servers: [] });
  });

  it("handles MCP config fetch errors", async () => {
    mcpServers.getConfig.mockRejectedValueOnce(new Error("boom"));
    const res = await app.request("/mcp/config");
    expect(res.status).toBe(500);
  });

  it("updates MCP config", async () => {
    const res = await app.request("/mcp/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servers: [] }),
    });
    expect(res.status).toBe(200);
    expect(mcpServers.updateConfig).toHaveBeenCalledWith({ servers: [] });
  });

  it("rejects invalid MCP config updates", async () => {
    mcpServers.updateConfig.mockRejectedValueOnce(new Error("invalid"));
    const res = await app.request("/mcp/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servers: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("lists MCP servers", async () => {
    const res = await app.request("/mcp/servers");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; servers: Array<{ name: string }> };
    expect(data.ok).toBe(true);
    expect(data.servers[0]?.name).toBe("alpha");
  });

  it("lists MCP tools", async () => {
    const res = await app.request("/mcp/servers/alpha/tools");
    expect(res.status).toBe(200);
    expect(mcpServers.listTools).toHaveBeenCalledWith("alpha");
  });

  it("handles tool list errors", async () => {
    mcpServers.listTools.mockRejectedValueOnce(new Error("missing"));
    const res = await app.request("/mcp/servers/alpha/tools");
    expect(res.status).toBe(404);
  });

  it("rejects invalid tool calls", async () => {
    const res = await app.request("/mcp/servers/alpha/tools/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("calls MCP tools", async () => {
    const res = await app.request("/mcp/servers/alpha/tools/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "tool-a", arguments: { a: 1 } }),
    });
    expect(res.status).toBe(200);
    expect(mcpServers.callTool).toHaveBeenCalledWith("alpha", "tool-a", { a: 1 });
  });

  it("handles tool call errors", async () => {
    mcpServers.callTool.mockRejectedValueOnce(new Error("fail"));
    const res = await app.request("/mcp/servers/alpha/tools/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "tool-a" }),
    });
    expect(res.status).toBe(500);
  });

  it("tests MCP servers", async () => {
    const res = await app.request("/mcp/servers/alpha/test", { method: "POST" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; toolCount: number; status: string | null };
    expect(data.ok).toBe(true);
    expect(data.toolCount).toBe(1);
    expect(data.status).toBe("online");
  });

  it("handles MCP test errors", async () => {
    mcpServers.listTools.mockRejectedValueOnce(new Error("offline"));
    const res = await app.request("/mcp/servers/alpha/test", { method: "POST" });
    expect(res.status).toBe(500);
  });

  it("rejects invalid token store updates", async () => {
    const res = await app.request("/mcp/servers/alpha/token-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("bad"),
    });
    expect(res.status).toBe(400);
  });

  it("handles token store not found errors", async () => {
    mcpServers.updateTokenStoreSelectors.mockRejectedValueOnce(new Error("server not found"));
    const res = await app.request("/mcp/servers/alpha/token-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
    expect(res.status).toBe(404);
  });

  it("lists MCP resources", async () => {
    const res = await app.request("/mcp/servers/alpha/resources");
    expect(res.status).toBe(200);
    expect(mcpServers.listResources).toHaveBeenCalledWith("alpha", undefined);
  });

  it("handles MCP resource list errors", async () => {
    mcpServers.listResources.mockRejectedValueOnce(new Error("broken"));
    const res = await app.request("/mcp/servers/alpha/resources");
    expect(res.status).toBe(500);
  });

  it("lists MCP resource templates", async () => {
    const res = await app.request("/mcp/servers/alpha/resource-templates", {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(mcpServers.listResourceTemplates).toHaveBeenCalledWith("alpha", undefined);
  });

  it("handles MCP resource template errors", async () => {
    mcpServers.listResourceTemplates.mockRejectedValueOnce(new Error("broken"));
    const res = await app.request("/mcp/servers/alpha/resource-templates");
    expect(res.status).toBe(500);
  });

  it("requires resource uri", async () => {
    const res = await app.request("/mcp/servers/alpha/resource");
    expect(res.status).toBe(400);
  });

  it("reads MCP resources", async () => {
    const res = await app.request("/mcp/servers/alpha/resource?uri=file://demo");
    expect(res.status).toBe(200);
    expect(mcpServers.readResource).toHaveBeenCalledWith("alpha", "file://demo");
  });

  it("handles MCP resource read errors", async () => {
    mcpServers.readResource.mockRejectedValueOnce(new Error("bad"));
    const res = await app.request("/mcp/servers/alpha/resource?uri=file://demo");
    expect(res.status).toBe(500);
  });
});
