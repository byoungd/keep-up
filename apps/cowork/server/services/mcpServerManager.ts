import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { AuditLogger, MCPTool } from "@ku0/agent-runtime-core";
import {
  createMcpRemoteToolServer,
  type McpRemoteServerConfig,
  type McpRemoteToolServer,
  type McpTransportConfig,
} from "@ku0/agent-runtime-tools";
import { z } from "zod";
import type { Logger } from "../logger";

export type McpServerSummary = {
  name: string;
  description: string;
  status: McpRemoteToolServer["getStatus"] extends () => infer Status ? Status : unknown;
};

type LoggerLike = Pick<Logger, "info" | "warn" | "error">;

const fallbackLogger: LoggerLike = {
  info: (_message, _meta) => undefined,
  warn: (_message, _meta) => undefined,
  error: (_message, _error, _data) => undefined,
};

const transportSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("stdio"),
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      stderr: z.enum(["inherit", "pipe", "ignore"]).optional(),
      cwd: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("sse"),
      url: z.string().min(1),
      eventSourceInit: z.unknown().optional(),
      requestInit: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("streamableHttp"),
      url: z.string().min(1),
      requestInit: z.unknown().optional(),
      reconnectionOptions: z.unknown().optional(),
      sessionId: z.string().optional(),
    })
    .passthrough(),
]);

const tokenStoreSchema = z.union([
  z.object({ type: z.literal("memory") }),
  z.object({ type: z.literal("gateway") }),
  z.object({
    type: z.literal("file"),
    filePath: z.string().min(1),
    encryptionKey: z.string().min(1),
    keyEncoding: z.enum(["hex", "base64"]).optional(),
  }),
]);

const authSchema = z
  .object({
    client: z
      .object({
        clientId: z.string().min(1),
        clientSecret: z.string().optional(),
        redirectUrl: z.string().optional(),
        scopes: z.array(z.string()).optional(),
        grantType: z.enum(["client_credentials", "authorization_code"]).optional(),
        clientMetadata: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    tokenStore: tokenStoreSchema.optional(),
    scopes: z.array(z.string()).optional(),
    authorizationCode: z.string().optional(),
  })
  .passthrough()
  .optional();

const serverSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    transport: transportSchema.optional(),
    url: z.string().optional(),
    serverUrl: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    stderr: z.enum(["inherit", "pipe", "ignore"]).optional(),
    cwd: z.string().optional(),
    toolScopes: z
      .object({
        defaultScopes: z.array(z.string()).optional(),
        toolScopes: z.record(z.string(), z.array(z.string())).optional(),
      })
      .optional(),
    auth: authSchema,
  })
  .passthrough();

const configSchema = z.object({
  servers: z.array(serverSchema).default([]),
});

type RawServerConfig = z.infer<typeof serverSchema>;
type RawMcpConfig = z.infer<typeof configSchema>;

export class McpServerManager {
  private readonly servers = new Map<string, McpRemoteToolServer>();
  private readonly initialized = new Set<string>();
  private readonly initializing = new Map<string, Promise<void>>();
  private readonly configPath: string;
  private readonly stateDir: string;
  private readonly eventBus?: RuntimeEventBus;
  private readonly auditLogger?: AuditLogger;
  private readonly logger: LoggerLike;

  constructor(options: {
    stateDir: string;
    configPath?: string;
    eventBus?: RuntimeEventBus;
    auditLogger?: AuditLogger;
    logger?: LoggerLike;
  }) {
    this.stateDir = options.stateDir;
    const envPath = process.env.COWORK_MCP_SETTINGS_PATH;
    this.configPath =
      options.configPath ??
      (envPath ? resolve(envPath) : resolve(options.stateDir, "mcp-settings.json"));
    this.eventBus = options.eventBus;
    this.auditLogger = options.auditLogger;
    this.logger = options.logger ?? fallbackLogger;
  }

  async initialize(): Promise<void> {
    let config: RawMcpConfig = { servers: [] };
    try {
      config = await this.loadConfig();
    } catch (error) {
      this.logger.error(
        `Failed to load MCP config from ${this.configPath}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
    this.servers.clear();
    this.initialized.clear();
    this.initializing.clear();

    for (const serverConfig of config.servers) {
      try {
        const normalized = this.normalizeServerConfig(serverConfig);
        const server = createMcpRemoteToolServer({
          ...normalized,
          eventBus: this.eventBus,
          auditLogger: this.auditLogger,
        });
        this.servers.set(normalized.name, server);
        void this.ensureInitialized(server).catch(() => undefined);
      } catch (error) {
        this.logger.warn(
          `Failed to register MCP server ${serverConfig.name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  async getConfig(): Promise<RawMcpConfig> {
    const config = await this.loadConfig();
    return sanitizeConfig(config);
  }

  async updateConfig(payload: unknown): Promise<RawMcpConfig> {
    const parsed = configSchema.parse(payload);
    await this.saveConfig(parsed);
    await this.initialize();
    return sanitizeConfig(parsed);
  }

  async reload(): Promise<RawMcpConfig> {
    await this.initialize();
    return this.getConfig();
  }

  listServerInstances(): McpRemoteToolServer[] {
    return Array.from(this.servers.values());
  }

  listServers(): McpServerSummary[] {
    return Array.from(this.servers.values()).map((server) => ({
      name: server.name,
      description: server.description,
      status: server.getStatus(),
    }));
  }

  async listTools(serverName: string): Promise<MCPTool[]> {
    const server = this.getServerOrThrow(serverName);
    await this.ensureInitialized(server);
    return server.listToolsRaw();
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.getServerOrThrow(serverName);
    await this.ensureInitialized(server);
    return server.callToolRaw({ name: toolName, arguments: args });
  }

  async listResources(serverName: string, cursor?: string): Promise<unknown> {
    const server = this.getServerOrThrow(serverName);
    await this.ensureInitialized(server);
    return server.listResources(cursor ? { cursor } : undefined);
  }

  async listResourceTemplates(serverName: string, cursor?: string): Promise<unknown> {
    const server = this.getServerOrThrow(serverName);
    await this.ensureInitialized(server);
    return server.listResourceTemplates(cursor ? { cursor } : undefined);
  }

  async readResource(serverName: string, uri: string): Promise<unknown> {
    const server = this.getServerOrThrow(serverName);
    await this.ensureInitialized(server);
    return server.readResource(uri);
  }

  private getServerOrThrow(serverName: string): McpRemoteToolServer {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server "${serverName}" not found`);
    }
    return server;
  }

  private async ensureInitialized(server: McpRemoteToolServer): Promise<void> {
    if (this.initialized.has(server.name)) {
      return;
    }
    const existing = this.initializing.get(server.name);
    if (existing) {
      await existing;
      return;
    }

    const initPromise = server
      .initialize()
      .then(() => {
        this.initialized.add(server.name);
      })
      .catch((error) => {
        this.logger.error(
          `Failed to initialize MCP server ${server.name}`,
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      })
      .finally(() => {
        this.initializing.delete(server.name);
      });

    this.initializing.set(server.name, initPromise);
    await initPromise;
  }

  private async loadConfig(): Promise<RawMcpConfig> {
    try {
      const raw = await readFile(this.configPath, "utf-8");
      if (!raw.trim()) {
        return { servers: [] };
      }
      const parsed = JSON.parse(raw) as unknown;
      return configSchema.parse(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { servers: [] };
      }
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid MCP config: ${error.message}`);
      }
      throw error;
    }
  }

  private async saveConfig(config: RawMcpConfig): Promise<void> {
    const dir = dirname(this.configPath);
    await mkdir(dir, { recursive: true });
    const tempPath = `${this.configPath}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    await rename(tempPath, this.configPath);
  }

  private normalizeServerConfig(server: RawServerConfig): McpRemoteServerConfig {
    const transport = resolveTransport(server);
    // biome-ignore lint/suspicious/noExplicitAny: workaround for type mismatch
    const auth: any = server.auth ? { ...server.auth } : undefined;
    if (auth) {
      auth.tokenStore = this.resolveTokenStore(server.name, auth.tokenStore);
    }
    return {
      name: server.name,
      description: server.description ?? server.name,
      transport,
      toolScopes: server.toolScopes,
      auth,
    };
  }

  private resolveTokenStore(
    serverName: string,
    tokenStore: unknown
    // biome-ignore lint/suspicious/noExplicitAny: workaround for type mismatch
  ): any {
    if (!tokenStore || (isRecord(tokenStore) && tokenStore.type === "gateway")) {
      const key = process.env.COWORK_MCP_TOKEN_KEY;
      if (!key) {
        if (tokenStore && this.logger) {
          this.logger.warn(
            `MCP token store for ${serverName} requires COWORK_MCP_TOKEN_KEY; falling back to memory.`
          );
        }
        return tokenStore && isRecord(tokenStore) ? { type: "memory" } : tokenStore;
      }
      const keyEncoding = process.env.COWORK_MCP_TOKEN_KEY_ENCODING as "hex" | "base64" | undefined;
      return {
        type: "file",
        filePath: join(this.stateDir, "mcp-tokens", `${serverName}.json`),
        encryptionKey: key,
        keyEncoding,
      };
    }
    return tokenStore;
  }
}

function sanitizeConfig(config: RawMcpConfig): RawMcpConfig {
  return {
    servers: config.servers.map((server) => {
      if (!server.auth) {
        return { ...server };
      }
      const auth = { ...server.auth } as RawServerConfig["auth"];
      if (auth?.client && typeof auth.client === "object") {
        auth.client = { ...auth.client, clientSecret: undefined };
      }
      if (auth && "authorizationCode" in auth) {
        auth.authorizationCode = undefined;
      }
      if (auth && "tokenStore" in auth && isRecord(auth.tokenStore)) {
        if (auth.tokenStore.type === "file") {
          auth.tokenStore = {
            type: "file",
            filePath: auth.tokenStore.filePath,
            encryptionKey: "***",
          };
        }
      }
      return { ...server, auth };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveTransport(server: RawServerConfig): McpTransportConfig {
  if (server.transport) {
    return server.transport as McpTransportConfig;
  }
  if (server.url) {
    return { type: "streamableHttp", url: server.url };
  }
  if (server.serverUrl) {
    return { type: "streamableHttp", url: server.serverUrl };
  }
  if (server.command) {
    return {
      type: "stdio",
      command: server.command,
      args: server.args,
      env: server.env,
      stderr: server.stderr,
      cwd: server.cwd,
    };
  }
  throw new Error(`MCP server "${server.name}" is missing transport configuration.`);
}
