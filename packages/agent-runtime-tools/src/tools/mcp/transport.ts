/**
 * MCP Transport Factory
 *
 * Creates MCP SDK transports with consistent configuration handling.
 */

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  SSEClientTransport,
  type SSEClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/sse.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike, Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type McpTransportConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      stderr?: StdioServerParameters["stderr"];
      cwd?: string;
    }
  | {
      type: "sse";
      url: string;
      eventSourceInit?: SSEClientTransportOptions["eventSourceInit"];
      requestInit?: SSEClientTransportOptions["requestInit"];
      fetch?: FetchLike;
    }
  | {
      type: "streamableHttp";
      url: string;
      requestInit?: StreamableHTTPClientTransportOptions["requestInit"];
      fetch?: FetchLike;
      reconnectionOptions?: StreamableHTTPClientTransportOptions["reconnectionOptions"];
      sessionId?: string;
    };

export interface McpTransportInstance {
  transport: Transport;
  type: McpTransportConfig["type"];
  serverUrl?: URL;
}

export function createMcpTransport(
  config: McpTransportConfig,
  authProvider?: OAuthClientProvider
): McpTransportInstance {
  switch (config.type) {
    case "stdio": {
      if (!config.command) {
        throw new Error("MCP stdio transport requires a command.");
      }
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env ?? getDefaultEnvironment(),
        stderr: config.stderr,
        cwd: config.cwd,
      });
      return { transport, type: "stdio" };
    }
    case "sse": {
      if (!config.url) {
        throw new Error("MCP SSE transport requires a URL.");
      }
      const url = new URL(config.url);
      const transport = new SSEClientTransport(url, {
        authProvider,
        eventSourceInit: config.eventSourceInit,
        requestInit: config.requestInit,
        fetch: config.fetch,
      });
      return { transport, type: "sse", serverUrl: url };
    }
    case "streamableHttp": {
      if (!config.url) {
        throw new Error("MCP Streamable HTTP transport requires a URL.");
      }
      const url = new URL(config.url);
      const transport = new StreamableHTTPClientTransport(url, {
        authProvider,
        requestInit: config.requestInit,
        fetch: config.fetch,
        reconnectionOptions: config.reconnectionOptions,
        sessionId: config.sessionId,
      });
      return { transport, type: "streamableHttp", serverUrl: url };
    }
    default: {
      const _exhaustiveCheck: never = config;
      return _exhaustiveCheck;
    }
  }
}

export function resolveMcpTransportUrl(config: McpTransportConfig): URL | undefined {
  if (config.type === "stdio") {
    return undefined;
  }
  return new URL(config.url);
}
