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

export function createMcpAppsRoutes(deps: McpAppsRouteDeps) {
  const app = new Hono();

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
