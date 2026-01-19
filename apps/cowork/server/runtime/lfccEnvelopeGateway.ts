import type { AIEnvelopeGateway } from "@ku0/agent-runtime";

type AIEnvelopeRequest = Parameters<AIEnvelopeGateway["processRequest"]>[0];
type AIEnvelopeResponse = Awaited<ReturnType<AIEnvelopeGateway["processRequest"]>>;

const DEFAULT_HEADERS = { "Content-Type": "application/json" };

export function createAIEnvelopeGateway(
  logger?: Pick<Console, "warn" | "error">
): AIEnvelopeGateway | undefined {
  const endpoint = process.env.COWORK_LFCC_ENVELOPE_URL;
  if (!endpoint) {
    logger?.warn?.("LFCC AI envelope gateway disabled: missing COWORK_LFCC_ENVELOPE_URL.");
    return undefined;
  }
  const apiKey = process.env.COWORK_LFCC_ENVELOPE_API_KEY;
  return new RemoteAIEnvelopeGateway(endpoint, apiKey);
}

class RemoteAIEnvelopeGateway implements AIEnvelopeGateway {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;

  constructor(endpoint: string, apiKey?: string) {
    this.endpoint = endpoint;
    this.headers = {
      ...DEFAULT_HEADERS,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
  }

  async processRequest(request: AIEnvelopeRequest): Promise<AIEnvelopeResponse> {
    const requestId = extractRequestId(request);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(request),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reach AI envelope gateway";
      return buildGatewayError(requestId, message);
    }

    const payload = await parseJson(response);
    if (isRecord(payload) && typeof payload.status === "number") {
      return payload as AIEnvelopeResponse;
    }

    return buildGatewayError(
      requestId,
      `Invalid AI envelope gateway response (${response.status})`
    );
  }
}

function extractRequestId(request: AIEnvelopeRequest): string | undefined {
  if (!isRecord(request)) {
    return undefined;
  }
  const requestId = request.request_id;
  if (typeof requestId === "string") {
    return requestId;
  }
  const clientRequestId = request.client_request_id;
  return typeof clientRequestId === "string" ? clientRequestId : undefined;
}

function buildGatewayError(requestId: string | undefined, message: string): AIEnvelopeResponse {
  return {
    status: 503,
    code: "AI_ENVELOPE_GATEWAY_UNAVAILABLE",
    message,
    request_id: requestId,
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
