/**
 * MCP Remote Tool Server
 *
 * Bridges an external MCP server using the official SDK client + transport.
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import {
  type AuditLogger,
  COWORK_POLICY_ACTIONS,
  type MCPTool,
  type MCPToolCall,
  type MCPToolResult,
  type MCPToolServer,
  type ToolContext,
} from "@ku0/agent-runtime-core";
import {
  type OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult, Tool as SdkTool } from "@modelcontextprotocol/sdk/types.js";
import {
  createMcpOAuthClientProvider,
  type McpOAuthClientConfig,
  McpOAuthSession,
  type McpOAuthSessionConfig,
  type McpOAuthTokenStore,
  type McpOAuthTokenStoreConfig,
} from "./oauth";
import { fromSdkResult, fromSdkTool, normalizeSdkTool, type ToolScopeConfig } from "./sdkAdapter";
import { createMcpTransport, type McpTransportConfig } from "./transport";

export type McpConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface McpConnectionStatus {
  state: McpConnectionState;
  transport: McpTransportConfig["type"];
  serverUrl?: string;
  lastError?: string;
  authRequired?: boolean;
}

export interface McpRemoteServerConfig {
  name: string;
  description: string;
  /**
   * @deprecated Use transport instead.
   */
  serverUrl?: string;
  transport?: McpTransportConfig;
  clientInfo?: {
    name: string;
    version: string;
  };
  auth?: {
    provider?: OAuthClientProvider;
    client?: McpOAuthClientConfig;
    tokenStore?: McpOAuthTokenStore | McpOAuthTokenStoreConfig;
    scopes?: string[];
    authorizationCode?: string;
  };
  toolScopes?: ToolScopeConfig;
  eventBus?: RuntimeEventBus;
  auditLogger?: AuditLogger;
  onStatusChange?: (status: McpConnectionStatus) => void;
}

export interface McpStatusEventPayload {
  server: string;
  status: McpConnectionStatus;
  previous?: McpConnectionStatus;
}

export class McpRemoteToolServer implements MCPToolServer {
  readonly name: string;
  readonly description: string;

  private readonly client: Client;
  private readonly transport: Transport;
  private readonly transportType: McpTransportConfig["type"];
  private readonly serverUrl?: URL;
  private readonly authSession?: McpOAuthSession;
  private readonly toolScopes?: ToolScopeConfig;
  private readonly authScopes?: string[];
  private readonly eventBus?: RuntimeEventBus;
  private readonly auditLogger?: AuditLogger;
  private readonly onStatusChange?: (status: McpConnectionStatus) => void;
  private tools: MCPTool[] = [];
  private connected = false;
  private connecting?: Promise<void>;
  private status: McpConnectionStatus;

  constructor(config: McpRemoteServerConfig) {
    this.name = config.name;
    this.description = config.description;
    this.toolScopes = config.toolScopes;
    this.authScopes = config.auth?.scopes ?? config.auth?.client?.scopes;
    this.eventBus = config.eventBus;
    this.auditLogger = config.auditLogger;
    this.onStatusChange = config.onStatusChange;

    const clientInfo = config.clientInfo ?? { name: "keepup-agent-runtime", version: "1.0.0" };
    this.client = new Client(clientInfo);

    const transportConfig = this.resolveTransportConfig(config);
    const authConfig = config.auth;
    const authProvider = resolveAuthProvider(authConfig);
    const transportInstance = createMcpTransport(transportConfig, authProvider);
    this.transport = transportInstance.transport;
    this.transportType = transportInstance.type;
    this.serverUrl = transportInstance.serverUrl;

    this.transport.onerror = (error) => {
      this.updateStatus({ state: "error", lastError: error.message });
    };
    this.transport.onclose = () => {
      this.connected = false;
      this.updateStatus({ state: "disconnected" });
    };

    this.status = {
      state: "disconnected",
      transport: this.transportType,
      serverUrl: this.serverUrl?.toString(),
    };

    if (authProvider && this.serverUrl) {
      const sessionConfig: McpOAuthSessionConfig = {
        provider: authProvider,
        serverUrl: this.serverUrl,
        authorizationCode: authConfig?.authorizationCode,
      };
      this.authSession = new McpOAuthSession(sessionConfig);
    }
  }

  async initialize(): Promise<void> {
    await this.ensureConnected();
    await this.refreshTools();
  }

  listTools(): MCPTool[] {
    return [...this.tools];
  }

  async callTool(call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    await this.ensureConnected();
    const toolName = call.name.includes(":") ? call.name.split(":")[1] : call.name;
    const requiredScopes = this.resolveRequiredScopes(toolName);

    try {
      await this.ensureScopes(requiredScopes);
    } catch (error) {
      return this.createScopeDeniedResult(toolName, requiredScopes, error);
    }

    try {
      const result = (await this.client.callTool({
        name: toolName,
        arguments: call.arguments,
      })) as CallToolResult;
      return fromSdkResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [{ type: "text", text: message }],
        error: {
          code: "EXECUTION_FAILED",
          message,
          details: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  async dispose(): Promise<void> {
    await this.transport.close();
    this.connected = false;
    this.updateStatus({ state: "disconnected" });
  }

  getStatus(): McpConnectionStatus {
    return { ...this.status };
  }

  private resolveTransportConfig(config: McpRemoteServerConfig): McpTransportConfig {
    if (config.transport) {
      return config.transport;
    }
    if (config.serverUrl) {
      return { type: "streamableHttp", url: config.serverUrl };
    }
    throw new Error("MCP remote server requires a transport or serverUrl.");
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.updateStatus({ state: "connecting", authRequired: false, lastError: undefined });
    this.connecting = this.client
      .connect(this.transport)
      .then(() => {
        this.connected = true;
        this.updateStatus({ state: "connected", authRequired: false, lastError: undefined });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.updateStatus({ state: "error", lastError: message });
        throw error;
      })
      .finally(() => {
        this.connecting = undefined;
      });

    await this.connecting;
  }

  private async refreshTools(): Promise<void> {
    const response = await this.client.listTools();
    const sdkTools = response.tools ?? [];
    const normalized = sdkTools
      .map((tool: SdkTool) => normalizeSdkTool(tool))
      .filter((tool): tool is SdkTool => tool !== null);

    this.tools = normalized
      .map((tool) => this.decorateTool(fromSdkTool(tool, this.toolScopes)))
      .filter(hasValidPolicyAction);
  }

  private decorateTool(tool: MCPTool): MCPTool {
    const annotations = tool.annotations ?? {};
    const category = annotations.category ?? "external";

    return {
      ...tool,
      annotations: {
        ...annotations,
        category,
      },
      metadata: {
        ...tool.metadata,
        mcpServer: this.name,
        mcpTransport: this.transportType,
      },
    };
  }

  private resolveRequiredScopes(toolName: string): string[] {
    const tool = this.tools.find((entry) => entry.name === toolName);
    return (
      tool?.annotations?.requiredScopes ??
      this.toolScopes?.toolScopes?.[toolName] ??
      this.toolScopes?.defaultScopes ??
      this.authScopes ??
      []
    );
  }

  private async ensureScopes(requiredScopes: string[]): Promise<void> {
    if (!requiredScopes || requiredScopes.length === 0) {
      return;
    }
    if (!this.authSession) {
      throw new UnauthorizedError("OAuth provider is not configured for this MCP server.");
    }
    await this.authSession.ensureAuthorized(requiredScopes);
  }

  private createScopeDeniedResult(
    toolName: string,
    requiredScopes: string[],
    error: unknown
  ): MCPToolResult {
    const message = error instanceof Error ? error.message : String(error);
    const authRequired = error instanceof UnauthorizedError;
    if (authRequired) {
      this.updateStatus({ authRequired: true, lastError: message, state: this.status.state });
    }

    return {
      success: false,
      content: [{ type: "text", text: message }],
      error: {
        code: "PERMISSION_DENIED",
        message,
        details: {
          toolName,
          requiredScopes,
          authRequired,
        },
      },
    };
  }

  private updateStatus(update: Partial<McpConnectionStatus>): void {
    const previous = this.status;
    const next: McpConnectionStatus = {
      ...previous,
      ...update,
      transport: this.transportType,
      serverUrl: this.serverUrl?.toString(),
    };
    this.status = next;
    this.onStatusChange?.(this.status);
    if (!this.isSameStatus(previous, next)) {
      this.emitStatusEvent(previous, next);
    }
  }

  private isSameStatus(
    previous: McpConnectionStatus | undefined,
    next: McpConnectionStatus
  ): boolean {
    if (!previous) {
      return false;
    }
    return (
      previous.state === next.state &&
      previous.lastError === next.lastError &&
      previous.authRequired === next.authRequired &&
      previous.serverUrl === next.serverUrl &&
      previous.transport === next.transport
    );
  }

  private emitStatusEvent(
    previous: McpConnectionStatus | undefined,
    next: McpConnectionStatus
  ): void {
    const payload: McpStatusEventPayload = {
      server: this.name,
      status: next,
      previous,
    };

    this.eventBus?.emitRaw("mcp:status", payload, {
      source: `mcp:${this.name}`,
    });

    this.auditLogger?.log({
      timestamp: Date.now(),
      toolName: `mcp:${this.name}`,
      action: next.state === "error" ? "error" : "result",
      sandboxed: false,
      input: previous ? { previous } : undefined,
      output: { status: next },
      error: next.state === "error" ? next.lastError : undefined,
      reason: next.authRequired ? "auth_required" : undefined,
    });
  }
}

function hasValidPolicyAction(tool: MCPTool): boolean {
  const policyAction = tool.annotations?.policyAction;
  return typeof policyAction === "string" && COWORK_POLICY_ACTIONS.includes(policyAction);
}

function resolveAuthProvider(auth: McpRemoteServerConfig["auth"]): OAuthClientProvider | undefined {
  if (!auth) {
    return undefined;
  }
  if (auth.provider) {
    return auth.provider;
  }
  if (!auth.client) {
    return undefined;
  }
  return createMcpOAuthClientProvider(auth.client, auth.tokenStore);
}

export function createMcpRemoteToolServer(config: McpRemoteServerConfig): McpRemoteToolServer {
  return new McpRemoteToolServer(config);
}
