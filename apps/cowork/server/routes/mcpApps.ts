import { Hono } from "hono";
import { z } from "zod";
import { jsonError, readJsonBody } from "../http";
import type { McpServerManager } from "../services/mcpServerManager";

interface McpAppsRouteDeps {
  mcpServers: McpServerManager;
}

const toolCallSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

const tokenStoreUpdateSchema = z.object({
  type: z.enum(["gateway", "memory", "file"]).optional(),
  tokenKey: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  clear: z.boolean().optional(),
});

export function createMcpAppsRoutes(deps: McpAppsRouteDeps) {
  const app = new Hono();

  app.get("/mcp/config", async (c) => {
    try {
      const config = await deps.mcpServers.getConfig();
      return c.json({ ok: true, config });
    } catch (error) {
      return jsonError(
        c,
        500,
        "Failed to load MCP config",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.put("/mcp/config", async (c) => {
    const body = await readJsonBody(c);
    try {
      const config = await deps.mcpServers.updateConfig(body);
      return c.json({ ok: true, config });
    } catch (error) {
      return jsonError(
        c,
        400,
        "Invalid MCP config",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.get("/mcp/servers", (c) => {
    const servers = deps.mcpServers.listServers();
    return c.json({ ok: true, servers });
  });

  app.get("/mcp/servers/:server/tools", async (c) => {
    const serverName = c.req.param("server");
    try {
      const tools = await deps.mcpServers.listTools(serverName);
      return c.json({ ok: true, tools });
    } catch (error) {
      return jsonError(
        c,
        404,
        "Failed to load MCP tools",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.post("/mcp/servers/:server/tools/call", async (c) => {
    const serverName = c.req.param("server");
    const body = await readJsonBody(c);
    const parsed = toolCallSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid tool call payload");
    }
    const { name, arguments: args } = parsed.data;
    try {
      const result = await deps.mcpServers.callTool(serverName, name, args ?? {});
      return c.json({ ok: true, result });
    } catch (error) {
      return jsonError(
        c,
        500,
        "Failed to call MCP tool",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.post("/mcp/servers/:server/test", async (c) => {
    const serverName = c.req.param("server");
    try {
      const tools = await deps.mcpServers.listTools(serverName);
      const status =
        deps.mcpServers.listServers().find((server) => server.name === serverName)?.status ?? null;
      return c.json({
        ok: true,
        server: serverName,
        status,
        toolCount: tools.length,
        tools,
      });
    } catch (error) {
      return jsonError(
        c,
        500,
        "Failed to test MCP server",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.post("/mcp/servers/:server/token-store", async (c) => {
    const serverName = c.req.param("server");
    const body = await readJsonBody(c);
    const parsed = tokenStoreUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid token store payload");
    }
    try {
      const config = await deps.mcpServers.updateTokenStoreSelectors(serverName, parsed.data);
      return c.json({ ok: true, config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("not found") ? 404 : 400;
      return jsonError(c, status, "Failed to update MCP token store", message);
    }
  });

  app.get("/mcp/servers/:server/resources", async (c) => {
    const serverName = c.req.param("server");
    const cursor = c.req.query("cursor");
    try {
      const result = await deps.mcpServers.listResources(serverName, cursor);
      return c.json({ ok: true, result });
    } catch (error) {
      return jsonError(
        c,
        500,
        "Failed to list MCP resources",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.get("/mcp/servers/:server/resource-templates", async (c) => {
    const serverName = c.req.param("server");
    const cursor = c.req.query("cursor");
    try {
      const result = await deps.mcpServers.listResourceTemplates(serverName, cursor);
      return c.json({ ok: true, result });
    } catch (error) {
      return jsonError(
        c,
        500,
        "Failed to list MCP resource templates",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.get("/mcp/servers/:server/resource", async (c) => {
    const serverName = c.req.param("server");
    const uri = c.req.query("uri");
    if (!uri) {
      return jsonError(c, 400, "Missing resource uri");
    }
    try {
      const result = await deps.mcpServers.readResource(serverName, uri);
      return c.json({ ok: true, result });
    } catch (error) {
      return jsonError(
        c,
        500,
        "Failed to read MCP resource",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  return app;
}
