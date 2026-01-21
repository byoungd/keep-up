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

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function parseHttpUrl(value: string, label: string): URL {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} requires a URL.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${label} requires a valid URL.`);
  }

  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new Error(`${label} requires an http(s) URL.`);
  }

  return url;
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
        env: config.env,
        stderr: config.stderr,
        cwd: config.cwd,
      });
      return { transport, type: "stdio" };
    }
    case "sse": {
      const url = parseHttpUrl(config.url, "MCP SSE transport");
      const transport = new SSEClientTransport(url, {
        authProvider,
        eventSourceInit: config.eventSourceInit,
        requestInit: config.requestInit,
        fetch: config.fetch,
      });
      return { transport, type: "sse", serverUrl: url };
    }
    case "streamableHttp": {
      const url = parseHttpUrl(config.url, "MCP Streamable HTTP transport");
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
  return parseHttpUrl(
    config.url,
    config.type === "sse" ? "MCP SSE transport" : "MCP Streamable HTTP transport"
  );
}
