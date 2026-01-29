import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { fetchCoworkJson } from "../utils/coworkGateway";
import { readStdin, writeStderr, writeStdout } from "../utils/terminal";

type McpServerStatus = {
  state?: string;
  transport?: string;
  serverUrl?: string;
  authRequired?: boolean;
  lastError?: string;
};

type McpServerSummary = {
  name: string;
  description?: string;
  status?: McpServerStatus;
};

export function mcpCommand(): Command {
  return new Command("mcp")
    .description("Manage MCP servers via Cowork gateway")
    .addCommand(listCommand())
    .addCommand(configCommand())
    .addCommand(testCommand());
}

function listCommand(): Command {
  return new Command("list")
    .description("List MCP servers")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<{ servers?: McpServerSummary[] }>("/api/mcp/servers", {
        baseUrl: options.baseUrl,
      });
      const servers = data.servers ?? [];
      if (servers.length === 0) {
        writeStdout("No MCP servers configured.");
        return;
      }
      writeStdout("NAME\tSTATUS\tTRANSPORT\tURL\tAUTH");
      for (const server of servers) {
        const status = server.status?.state ?? "unknown";
        const transport = server.status?.transport ?? "—";
        const url = server.status?.serverUrl ?? "—";
        const auth = server.status?.authRequired ? "required" : "ok";
        writeStdout(`${server.name}\t${status}\t${transport}\t${url}\t${auth}`);
      }
    });
}

function configCommand(): Command {
  return new Command("config")
    .description("Get or set MCP server config")
    .addCommand(configGetCommand())
    .addCommand(configSetCommand())
    .addCommand(configTokenStoreCommand());
}

function configGetCommand(): Command {
  return new Command("get")
    .description("Print MCP config JSON")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<{ config?: unknown }>("/api/mcp/config", {
        baseUrl: options.baseUrl,
      });
      writeStdout(JSON.stringify(data.config ?? {}, null, 2));
    });
}

function configSetCommand(): Command {
  return new Command("set")
    .description("Update MCP config JSON")
    .option("--base-url <url>", "Cowork API base URL")
    .option("--file <path>", "Path to MCP config JSON")
    .option("--json <payload>", "MCP config JSON string")
    .action(async (options: { baseUrl?: string; file?: string; json?: string }) => {
      const payload = await resolveConfigPayload(options);
      if (!payload) {
        writeStderr("Provide --file, --json, or pipe JSON to stdin.");
        process.exit(1);
      }
      const data = await fetchCoworkJson<{ config?: unknown }>("/api/mcp/config", {
        baseUrl: options.baseUrl,
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      writeStdout(JSON.stringify(data.config ?? {}, null, 2));
    });
}

type TokenStoreUpdateOptions = {
  baseUrl?: string;
  type?: string;
  tokenKey?: string;
  accountId?: string;
  workspaceId?: string;
  clear?: boolean;
};

function configTokenStoreCommand(): Command {
  return new Command("token-store")
    .description("Update MCP token store selectors for a server")
    .argument("<name>", "MCP server name")
    .option("--base-url <url>", "Cowork API base URL")
    .option("--type <type>", "Token store type (gateway, memory, file)")
    .option("--token-key <key>", "Explicit token store key")
    .option("--account-id <id>", "Account identifier")
    .option("--workspace-id <id>", "Workspace identifier")
    .option("--clear", "Clear existing token selectors")
    .action(async (name: string, options: TokenStoreUpdateOptions) => {
      const payload = buildTokenStoreUpdatePayload(options);
      if (!payload) {
        writeStderr("Provide --type, --token-key, --account-id, --workspace-id, or --clear.");
        process.exit(1);
      }
      const data = await fetchCoworkJson<{ config?: unknown }>(
        `/api/mcp/servers/${encodeURIComponent(name)}/token-store`,
        {
          baseUrl: options.baseUrl,
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
        }
      );
      writeStdout(JSON.stringify(data.config ?? {}, null, 2));
    });
}

async function resolveConfigPayload(options: {
  file?: string;
  json?: string;
}): Promise<unknown | null> {
  if (options.json) {
    return parseJson(options.json);
  }
  if (options.file) {
    const content = await readFile(options.file, "utf8");
    return parseJson(content);
  }
  const stdin = await readStdin();
  if (!stdin.trim()) {
    return null;
  }
  return parseJson(stdin);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message}`);
  }
}

function buildTokenStoreUpdatePayload(
  options: TokenStoreUpdateOptions
): Record<string, unknown> | null {
  const type = options.type ? normalizeTokenStoreType(options.type) : undefined;
  const payload: Record<string, unknown> = {};

  if (type) {
    payload.type = type;
  }
  if (options.tokenKey) {
    payload.tokenKey = options.tokenKey;
  }
  if (options.accountId) {
    payload.accountId = options.accountId;
  }
  if (options.workspaceId) {
    payload.workspaceId = options.workspaceId;
  }
  if (options.clear) {
    payload.clear = true;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

function normalizeTokenStoreType(value: string): "gateway" | "memory" | "file" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "gateway" || normalized === "memory" || normalized === "file") {
    return normalized;
  }
  throw new Error(`Unsupported token store type: ${value}`);
}

function testCommand(): Command {
  return new Command("test")
    .description("Test MCP server connectivity")
    .argument("<name>", "MCP server name")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (name: string, options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<{
        status?: McpServerStatus;
        toolCount?: number;
        tools?: Array<{ name: string }>;
      }>(`/api/mcp/servers/${encodeURIComponent(name)}/test`, {
        baseUrl: options.baseUrl,
        method: "POST",
      });
      const status = data.status?.state ?? "unknown";
      const toolCount = typeof data.toolCount === "number" ? data.toolCount : 0;
      writeStdout(`Server ${name}: ${status} (${toolCount} tools)`);
      if (Array.isArray(data.tools) && data.tools.length > 0) {
        const toolNames = data.tools.map((tool) => tool.name).join(", ");
        writeStdout(`Tools: ${toolNames}`);
      }
    });
}
