export type NodePermissionStatus = {
  name: string;
  status: "granted" | "denied" | "prompt" | "unknown";
  details?: string;
};

export type NodeCapability = {
  command: string;
  description?: string;
  permissions?: string[];
};

export type NodeStatus = "online" | "offline";

export type NodeDescriptor = {
  id: string;
  name?: string;
  kind?: string;
  status: NodeStatus;
  capabilities: NodeCapability[];
  permissions?: NodePermissionStatus[];
  connectedAt?: number;
  lastSeenAt?: number;
};

export type NodeError = {
  message: string;
  code?: string;
};

export type NodeResponse = {
  success: boolean;
  result?: unknown;
  error?: NodeError;
};

export type NodeHelloMessage = {
  type: "node.hello";
  nodeId: string;
  name?: string;
  kind?: string;
  capabilities: NodeCapability[];
  permissions?: NodePermissionStatus[];
  token?: string;
};

export type NodeHeartbeatMessage = {
  type: "node.heartbeat";
  nodeId: string;
};

export type NodeInvokeMessage = {
  type: "node.invoke";
  requestId: string;
  command: string;
  args?: Record<string, unknown>;
};

export type NodeResultMessage = {
  type: "node.result";
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: NodeError;
};

export type NodeErrorMessage = {
  type: "node.error";
  code: string;
  message: string;
  requestId?: string;
};

export type NodeMessage =
  | NodeHelloMessage
  | NodeHeartbeatMessage
  | NodeInvokeMessage
  | NodeResultMessage
  | NodeErrorMessage;
