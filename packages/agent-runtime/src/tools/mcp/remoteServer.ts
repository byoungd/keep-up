/**
 * MCP Remote Tool Server
 *
 * Bridges an external MCP server using the official SDK client + transport.
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport";
import type { CallToolResult, Tool as SdkTool } from "@modelcontextprotocol/sdk/types";
import type { MCPTool, MCPToolCall, MCPToolResult, MCPToolServer, ToolContext } from "../../types";
import { McpOAuthSession, type McpOAuthSessionConfig } from "./oauth";
import { fromSdkResult, fromSdkTool, type ToolScopeConfig } from "./sdkAdapter";

export interface McpRemoteServerConfig {
  name: string;
  description: string;
  serverUrl: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  auth?: {
    provider: OAuthClientProvider;
    scopes?: string[];
    authorizationCode?: string;
  };
  toolScopes?: ToolScopeConfig;
  transport?: {
    requestInit?: RequestInit;
    fetch?: FetchLike;
    reconnectionOptions?: StreamableHTTPClientTransportOptions["reconnectionOptions"];
    sessionId?: string;
  };
}

export class McpRemoteToolServer implements MCPToolServer {
  readonly name: string;
  readonly description: string;

  private readonly client: Client;
  private readonly transport: StreamableHTTPClientTransport;
  private readonly authSession?: McpOAuthSession;
  private readonly toolScopes?: ToolScopeConfig;
  private tools: MCPTool[] = [];
  private connected = false;

  constructor(config: McpRemoteServerConfig) {
    this.name = config.name;
    this.description = config.description;
    this.toolScopes = config.toolScopes;

    const clientInfo = config.clientInfo ?? { name: "keepup-agent-runtime", version: "1.0.0" };
    this.client = new Client(clientInfo);

    this.transport = new StreamableHTTPClientTransport(new URL(config.serverUrl), {
      authProvider: config.auth?.provider,
      requestInit: config.transport?.requestInit,
      fetch: config.transport?.fetch,
      reconnectionOptions: config.transport?.reconnectionOptions,
      sessionId: config.transport?.sessionId,
    });

    if (config.auth?.provider) {
      const sessionConfig: McpOAuthSessionConfig = {
        provider: config.auth.provider,
        serverUrl: config.serverUrl,
        authorizationCode: config.auth.authorizationCode,
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
    await this.ensureScopes(toolName);

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
    if (this.connected) {
      await this.transport.close();
      this.connected = false;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }
    await this.client.connect(this.transport);
    this.connected = true;
  }

  private async refreshTools(): Promise<void> {
    const response = await this.client.listTools();
    const sdkTools = response.tools ?? [];
    this.tools = sdkTools.map((tool: SdkTool) => fromSdkTool(tool, this.toolScopes));
  }

  private async ensureScopes(toolName: string): Promise<void> {
    const tool = this.tools.find((entry) => entry.name === toolName);
    const scopes =
      tool?.annotations?.requiredScopes ??
      this.toolScopes?.toolScopes?.[toolName] ??
      this.toolScopes?.defaultScopes ??
      [];
    await this.authSession?.ensureAuthorized(scopes);
  }
}

export function createMcpRemoteToolServer(config: McpRemoteServerConfig): McpRemoteToolServer {
  return new McpRemoteToolServer(config);
}
