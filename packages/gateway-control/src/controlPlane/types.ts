import type { RuntimeEvent, RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { Logger } from "@ku0/agent-runtime-telemetry/logging";

export type GatewayControlInboundMessage =
  | {
      type: "hello";
      clientId?: string;
      subscriptions?: string[];
      userAgent?: string;
      token?: string;
    }
  | {
      type: "auth";
      token: string;
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
    }
  | {
      type: "session.list";
      requestId?: string;
    }
  | {
      type: "session.get";
      sessionId: string;
      requestId?: string;
    }
  | {
      type: "session.create";
      session: GatewayControlSessionCreateInput;
      requestId?: string;
    }
  | {
      type: "session.update";
      sessionId: string;
      updates: GatewayControlSessionUpdateInput;
      requestId?: string;
    }
  | {
      type: "session.end";
      sessionId: string;
      requestId?: string;
    };

export type GatewayControlOutboundMessage =
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
      code: "INVALID_MESSAGE" | "UNSUPPORTED" | "UNAUTHORIZED" | "NOT_FOUND" | "FAILED";
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
    }
  | {
      type: "session.list";
      sessions: GatewayControlSessionSummary[];
      requestId?: string;
    }
  | {
      type: "session.get";
      session?: GatewayControlSessionSummary;
      requestId?: string;
    }
  | {
      type: "session.created";
      session: GatewayControlSessionSummary;
      requestId?: string;
    }
  | {
      type: "session.updated";
      session?: GatewayControlSessionSummary;
      requestId?: string;
    }
  | {
      type: "session.ended";
      sessionId: string;
      ok: boolean;
      requestId?: string;
    };

export interface GatewayWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface GatewayControlClient {
  id: string;
  userAgent?: string;
  subscriptions: Set<string>;
  authenticated: boolean;
}

export type GatewayControlAuthMode = "none" | "token";

export interface GatewayControlAuthConfig {
  mode: GatewayControlAuthMode;
  token?: string;
}

export interface GatewayControlStats {
  connectedClients: number;
  totalConnections: number;
  totalSubscriptions: number;
  messagesIn: number;
  messagesOut: number;
  lastMessageAt?: number;
}

export interface GatewayControlSessionSummary {
  sessionId: string;
  userId?: string;
  deviceId?: string;
  title?: string;
  projectId?: string;
  workspaceId?: string;
  isolationLevel?: "main" | "sandbox" | "restricted";
  sandboxMode?: "none" | "workspace-write" | "docker";
  toolAllowlist?: string[];
  toolDenylist?: string[];
  createdAt?: number;
  updatedAt?: number;
  endedAt?: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface GatewayControlSessionCreateInput {
  sessionId?: string;
  userId?: string;
  deviceId?: string;
  title?: string;
  projectId?: string;
  workspaceId?: string;
  isolationLevel?: "main" | "sandbox" | "restricted";
  sandboxMode?: "none" | "workspace-write" | "docker";
  toolAllowlist?: string[];
  toolDenylist?: string[];
  expiresAt?: number;
  grants?: unknown[];
  connectors?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface GatewayControlSessionUpdateInput {
  title?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  isolationLevel?: "main" | "sandbox" | "restricted";
  sandboxMode?: "none" | "workspace-write" | "docker" | null;
  toolAllowlist?: string[] | null;
  toolDenylist?: string[] | null;
  endedAt?: number | null;
  expiresAt?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface GatewayControlSessionManager {
  list: () => Promise<GatewayControlSessionSummary[]>;
  get: (sessionId: string) => Promise<GatewayControlSessionSummary | null>;
  create: (input: GatewayControlSessionCreateInput) => Promise<GatewayControlSessionSummary>;
  update?: (
    sessionId: string,
    updates: GatewayControlSessionUpdateInput
  ) => Promise<GatewayControlSessionSummary | null>;
  end?: (sessionId: string) => Promise<boolean>;
}

export interface GatewayControlServerConfig {
  eventBus: RuntimeEventBus;
  logger?: Logger;
  maxSubscriptions?: number;
  allowPublish?: boolean;
  source?: string;
  auth?: GatewayControlAuthConfig;
  sessionManager?: GatewayControlSessionManager;
}

export interface GatewayConnectionHandle {
  clientId: string;
  onMessage: (data: string) => void;
  onClose: () => void;
}
