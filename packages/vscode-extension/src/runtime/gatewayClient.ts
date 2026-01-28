import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "@ku0/agent-runtime";
import WebSocket from "ws";

export interface GatewayConfig {
  url: string;
  sessionId?: string;
  source?: string;
  subscriptions: string[];
  token?: string;
  userAgent?: string;
  clientId?: string;
}

export interface GatewayClientHandlers {
  onEvent?: (event: RuntimeEvent) => void;
  onError?: (message: string) => void;
  onStatus?: (message: string) => void;
}

interface GatewayPublishMeta {
  source?: string;
  correlationId?: string;
  priority?: "critical" | "high" | "normal" | "low";
}

type GatewayOutboundMessage =
  | {
      type: "hello";
      clientId?: string;
      subscriptions?: string[];
      userAgent?: string;
      token?: string;
    }
  | {
      type: "subscribe";
      patterns: string[];
    }
  | {
      type: "publish";
      event: {
        type: string;
        payload: unknown;
        meta?: GatewayPublishMeta;
      };
    }
  | {
      type: "ping";
      nonce?: string;
    };

type GatewayInboundMessage =
  | {
      type: "welcome";
      clientId: string;
      serverTime: number;
      subscriptions: string[];
      authRequired?: boolean;
      authenticated?: boolean;
    }
  | {
      type: "event";
      event: RuntimeEvent;
    }
  | {
      type: "auth_ok";
      clientId: string;
      serverTime: number;
    }
  | {
      type: "error";
      code: string;
      message: string;
      requestId?: string;
    }
  | {
      type: "pong";
      nonce?: string;
      serverTime: number;
    }
  | {
      type: "subscribed";
      patterns: string[];
    };

const DEFAULT_SUBSCRIPTIONS = [
  "stream:event",
  "agent:*",
  "artifact:emitted",
  "tool:*",
  "plan:*",
  "execution:*",
  "task:*",
  "context:file-stale",
];

export type GatewayConfigOverrides = Partial<GatewayConfig> & { enabled?: boolean };

export function resolveGatewayConfig(overrides: GatewayConfigOverrides = {}): GatewayConfig | null {
  const enabled = overrides.enabled ?? resolveGatewayEnabled();
  if (!enabled) {
    return null;
  }

  const url = resolveGatewayUrl(overrides);
  const subscriptions = resolveGatewaySubscriptions(overrides);

  return {
    url,
    sessionId: overrides.sessionId ?? process.env.KEEPUP_SESSION ?? process.env.COWORK_SESSION_ID,
    source: overrides.source ?? process.env.KEEPUP_GATEWAY_SOURCE ?? "vscode-extension",
    subscriptions,
    token: resolveGatewayToken(overrides),
    userAgent: overrides.userAgent ?? "keepup-vscode",
    clientId: overrides.clientId,
  };
}

function resolveGatewayEnabled(): boolean {
  const mode = process.env.KEEPUP_GATEWAY_MODE;
  return (
    mode === "gateway" || mode === "true" || mode === "1" || Boolean(process.env.KEEPUP_GATEWAY_URL)
  );
}

function resolveGatewayUrl(overrides: GatewayConfigOverrides): string {
  const overrideUrl = overrides.url?.trim();
  if (overrideUrl) {
    return overrideUrl;
  }
  const port = Number.parseInt(process.env.KEEPUP_GATEWAY_PORT ?? "", 10);
  const host = process.env.KEEPUP_GATEWAY_HOST ?? "127.0.0.1";
  return process.env.KEEPUP_GATEWAY_URL ?? `ws://${host}:${Number.isFinite(port) ? port : 18800}`;
}

function resolveGatewaySubscriptions(overrides: GatewayConfigOverrides): string[] {
  return overrides.subscriptions && overrides.subscriptions.length > 0
    ? overrides.subscriptions
    : DEFAULT_SUBSCRIPTIONS;
}

function resolveGatewayToken(overrides: GatewayConfigOverrides): string | undefined {
  return overrides.token ?? process.env.KEEPUP_GATEWAY_TOKEN;
}

export class GatewayClient {
  private socket?: WebSocket;
  private connectPromise?: Promise<void>;
  private disposed = false;
  private readonly pending: GatewayOutboundMessage[] = [];
  private readonly clientId: string;

  constructor(
    private readonly config: GatewayConfig,
    private readonly handlers: GatewayClientHandlers
  ) {
    this.clientId = config.clientId ?? `vscode-${randomUUID()}`;
  }

  async connect(): Promise<void> {
    if (this.disposed) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.config.url);
      this.socket = socket;

      socket.on("open", () => {
        const hello: GatewayOutboundMessage = {
          type: "hello",
          clientId: this.clientId,
          userAgent: this.config.userAgent,
          subscriptions: this.config.subscriptions,
          token: this.config.token,
        };
        socket.send(JSON.stringify(hello));
        for (const message of this.pending) {
          socket.send(JSON.stringify(message));
        }
        this.pending.length = 0;
        this.handlers.onStatus?.(`Gateway connected (${this.config.url})`);
        resolve();
      });

      socket.on("message", (data: unknown) => {
        this.handleMessage(data);
      });

      socket.on("error", (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.handlers.onError?.(`Gateway error: ${message}`);
        reject(error instanceof Error ? error : new Error(message));
      });

      socket.on("close", (code: number, reason: Buffer) => {
        const reasonText = reason ? reason.toString() : "";
        this.handlers.onStatus?.(
          `Gateway disconnected (${code}${reasonText ? `: ${reasonText}` : ""})`
        );
        this.socket = undefined;
        this.connectPromise = undefined;
      });
    });

    return this.connectPromise;
  }

  async publish(event: {
    type: string;
    payload: unknown;
    meta?: GatewayPublishMeta;
  }): Promise<void> {
    const message: GatewayOutboundMessage = { type: "publish", event };
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pending.push(message);
      await this.connect();
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.disposed = true;
    this.socket?.close();
    this.socket = undefined;
    this.connectPromise = undefined;
    this.pending.length = 0;
  }

  private handleMessage(data: unknown): void {
    const parsed = this.parseInboundMessage(data);
    if (!parsed) {
      return;
    }
    this.dispatchInboundMessage(parsed);
  }

  private parseInboundMessage(data: unknown): GatewayInboundMessage | null {
    try {
      const text = formatGatewayPayload(data);
      const parsed = JSON.parse(text) as GatewayInboundMessage;
      if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
        return null;
      }
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.handlers.onError?.(`Gateway message parse error: ${message}`);
      return null;
    }
  }

  private dispatchInboundMessage(parsed: GatewayInboundMessage): void {
    switch (parsed.type) {
      case "welcome":
        if (parsed.authRequired && !parsed.authenticated) {
          this.handlers.onStatus?.("Gateway auth required");
        }
        this.handlers.onStatus?.(`Gateway ready (${parsed.clientId})`);
        break;
      case "auth_ok":
        this.handlers.onStatus?.(`Gateway authenticated (${parsed.clientId})`);
        break;
      case "event":
        if (parsed.event) {
          this.handlers.onEvent?.(parsed.event);
        }
        break;
      case "error":
        this.handlers.onError?.(
          parsed.requestId
            ? `[${parsed.code}] ${parsed.message} (${parsed.requestId})`
            : `[${parsed.code}] ${parsed.message}`
        );
        break;
      case "subscribed":
        this.handlers.onStatus?.(`Subscribed: ${parsed.patterns.join(", ")}`);
        break;
      default:
        break;
    }
  }
}

function formatGatewayPayload(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Buffer) {
    return data.toString();
  }
  return String(data);
}
