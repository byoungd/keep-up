import type { IncomingMessage } from "node:http";
import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { NodeRegistry } from "./registry";

export interface GatewayNodeServerConfig {
  port: number;
  registry: NodeRegistry;
  logger?: Logger;
}

export interface GatewayNodeServerHandle {
  close: () => Promise<void>;
  wss: WebSocketServer;
}

export function startGatewayNodeServer(config: GatewayNodeServerConfig): GatewayNodeServerHandle {
  const logger = config.logger ?? createSubsystemLogger("gateway", "nodes-ws");
  const wss = new WebSocketServer({ port: config.port });

  const pruneTimer = setInterval(() => {
    config.registry.pruneStale();
  }, 5_000);

  wss.on("connection", (socket: WebSocket, request) => {
    const incoming = request as IncomingMessage;
    const handle = config.registry.handleConnection({
      send: (data) => socket.send(data),
      close: (code, reason) => socket.close(code, reason),
    });

    socket.on("message", (data: RawData) => {
      const payload = typeof data === "string" ? data : data.toString();
      handle.onMessage(payload);
    });

    socket.on("close", () => {
      handle.onClose();
    });

    logger.info("Gateway node connected", {
      userAgent: incoming.headers["user-agent"],
    });
  });

  wss.on("listening", () => {
    logger.info("Gateway node WS server listening", { port: config.port });
  });

  wss.on("error", (error: Error) => {
    logger.error("Gateway node WS server error", error);
  });

  return {
    wss,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(pruneTimer);
        wss.close((err?: Error) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      }),
  };
}
