import type { RuntimeEvent, RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { Logger } from "@ku0/agent-runtime-telemetry/logging";

export type GatewayControlInboundMessage =
  | {
      type: "hello";
      clientId?: string;
      subscriptions?: string[];
      userAgent?: string;
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
        meta?: {
          source?: string;
          correlationId?: string;
          priority?: "critical" | "high" | "normal" | "low";
        };
      };
    }
  | {
      type: "ping";
      nonce?: string;
    };

export type GatewayControlOutboundMessage =
  | {
      type: "welcome";
      clientId: string;
      serverTime: number;
      subscriptions: string[];
    }
  | {
      type: "event";
      event: RuntimeEvent;
    }
  | {
      type: "error";
      code: "INVALID_MESSAGE" | "UNSUPPORTED" | "UNAUTHORIZED";
      message: string;
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

export interface GatewayWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface GatewayControlClient {
  id: string;
  userAgent?: string;
  subscriptions: Set<string>;
}

export interface GatewayControlServerConfig {
  eventBus: RuntimeEventBus;
  logger?: Logger;
  maxSubscriptions?: number;
  allowPublish?: boolean;
  source?: string;
}

export interface GatewayConnectionHandle {
  clientId: string;
  onMessage: (data: string) => void;
  onClose: () => void;
}
