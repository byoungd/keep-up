export type NodePermissionStatus = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

export interface NodeCapability {
  command: string;
  description?: string;
  permissions?: string[];
}

export interface NodeDescriptor {
  nodeId: string;
  label?: string;
  platform?: string;
  capabilities: NodeCapability[];
  permissions?: Record<string, NodePermissionStatus>;
  metadata?: Record<string, string>;
}

export interface NodeInvoke {
  nodeId: string;
  command: string;
  args?: Record<string, unknown>;
  requestId?: string;
}

export interface NodeResponse {
  requestId: string;
  nodeId: string;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type GatewayNodeInboundMessage =
  | {
      type: "hello";
      node: NodeDescriptor;
    }
  | {
      type: "describe";
      node: NodeDescriptor;
    }
  | {
      type: "heartbeat";
      nodeId: string;
    }
  | {
      type: "response";
      response: NodeResponse;
    }
  | {
      type: "ping";
      nonce?: string;
    };

export type GatewayNodeOutboundMessage =
  | {
      type: "welcome";
      nodeId: string;
      serverTime: number;
    }
  | {
      type: "invoke";
      requestId: string;
      command: string;
      args?: Record<string, unknown>;
    }
  | {
      type: "error";
      code: "INVALID_MESSAGE" | "UNSUPPORTED" | "UNAUTHORIZED" | "TIMEOUT";
      message: string;
    }
  | {
      type: "pong";
      nonce?: string;
      serverTime: number;
    };

export interface GatewayNodeConnection {
  id: string;
  send: (message: GatewayNodeOutboundMessage) => void;
  close?: (code?: number, reason?: string) => void;
}
