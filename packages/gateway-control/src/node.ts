import type { IncomingMessage } from "node:http";
import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import { WebSocketServer } from "ws";
import type { GatewayControlServer } from "./controlPlane/server";

export interface GatewayNodeServerConfig {
  port: number;
  server: GatewayControlServer;
  logger?: Logger;
}

export interface GatewayNodeServerHandle {
  close: () => Promise<void>;
  wss: WebSocketServer;
}

export function startGatewayControlNodeServer(
  config: GatewayNodeServerConfig
): GatewayNodeServerHandle {
  const logger = config.logger ?? createSubsystemLogger("gateway", "ws");
  const wss = new WebSocketServer({ port: config.port });

  wss.on("connection", (socket, request) => {
    const { clientId, subscriptions } = parseQuery(request);
    const handle = config.server.handleConnection(socket, {
      clientId,
      subscriptions,
      userAgent: request.headers["user-agent"],
    });

    socket.on("message", (data) => {
      const payload = typeof data === "string" ? data : data.toString();
      handle.onMessage(payload);
    });

    socket.on("close", () => {
      handle.onClose();
    });
  });

  wss.on("listening", () => {
    logger.info("Gateway control WS server listening", { port: config.port });
  });

  wss.on("error", (error) => {
    logger.error("Gateway control WS server error", error);
  });

  return {
    wss,
    close: () =>
      new Promise((resolve, reject) => {
        wss.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      }),
  };
}

function parseQuery(request: IncomingMessage): {
  clientId?: string;
  subscriptions?: string[];
} {
  const url = request.url;
  if (!url) {
    return {};
  }

  try {
    const parsed = new URL(url, "http://localhost");
    const clientId = parsed.searchParams.get("clientId") ?? undefined;
    const subscriptionsParam = parsed.searchParams.get("subscriptions");
    const subscriptions = subscriptionsParam
      ? subscriptionsParam
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined;
    return { clientId, subscriptions };
  } catch {
    return {};
  }
}
