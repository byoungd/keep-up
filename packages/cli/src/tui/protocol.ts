export const PROTOCOL_VERSION = 1 as const;

export const HOST_OPS = [
  "client.hello",
  "session.list",
  "session.create",
  "runtime.init",
  "agent.prompt",
  "agent.interrupt",
  "client.shutdown",
] as const;

export type OpName = (typeof HOST_OPS)[number];

export type OpMessage = {
  type: "op";
  id: string;
  op: OpName;
  payload?: Record<string, unknown>;
};

export type ResultMessage = {
  type: "result";
  id: string;
  op: OpName;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { message: string; code?: string };
};

export type EventMessage = {
  type: "event";
  event: string;
  requestId?: string;
  payload?: Record<string, unknown>;
};

export type HostMessage = OpMessage | ResultMessage | EventMessage;

export type HostCapabilities = {
  protocolVersion: number;
  ops: OpName[];
  features: string[];
};

export const HOST_FEATURES = ["sessions", "interrupt", "runtime:init", "events", "stream"] as const;

export function buildHostCapabilities(): HostCapabilities {
  return {
    protocolVersion: PROTOCOL_VERSION,
    ops: [...HOST_OPS],
    features: [...HOST_FEATURES],
  };
}
