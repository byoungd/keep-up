export type GatewayRequestId = string | number;

export interface GatewayRequestEnvelope {
  id: GatewayRequestId;
  method: string;
  params?: unknown;
}

export interface GatewayError {
  code: string;
  message: string;
  data?: unknown;
}

export interface GatewayResponseEnvelope {
  id: GatewayRequestId;
  result?: unknown;
  error?: GatewayError;
}

export interface GatewayEventEnvelope {
  event: string;
  payload: unknown;
  timestamp: number;
}

export type GatewayMessage =
  | GatewayRequestEnvelope
  | GatewayResponseEnvelope
  | GatewayEventEnvelope;

export function isGatewayRequest(message: unknown): message is GatewayRequestEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<GatewayRequestEnvelope>;
  return (
    (typeof candidate.id === "string" || typeof candidate.id === "number") &&
    typeof candidate.method === "string"
  );
}

export function isGatewayEvent(message: unknown): message is GatewayEventEnvelope {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<GatewayEventEnvelope>;
  return (
    typeof candidate.event === "string" &&
    "payload" in candidate &&
    typeof candidate.timestamp === "number"
  );
}

export function createGatewayEvent(
  event: string,
  payload: unknown,
  timestamp: number = Date.now()
): GatewayEventEnvelope {
  return { event, payload, timestamp };
}
