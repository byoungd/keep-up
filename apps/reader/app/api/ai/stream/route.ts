import type { Message } from "@keepup/ai-core";
import { computeOptimisticHash } from "@keepup/core";
import { streamText } from "ai";
import { toModelMessages } from "../messageUtils";
import { getDefaultStreamModelId } from "../modelResolver";
import {
  createAnthropicClient,
  createGoogleClient,
  createOpenAIProvider,
} from "../providerClients";
import {
  type ProviderResolutionError,
  type ProviderTarget,
  resolveProviderTarget,
} from "../providerResolver";

export const runtime = "nodejs";

const STREAM_SYSTEM_PROMPT = `You are a professional writing assistant. Your task is to help improve, fix, translate, or explain text.
Be concise and direct. Only output the improved/fixed/translated text without any preamble or explanation unless the task is "Explain".`;

function buildStreamMessages(prompt: string, context: string): Message[] {
  return [
    { role: "system", content: STREAM_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context (selected text): "${context}"\n\nTask: ${prompt}`,
    },
  ];
}

async function streamAnthropic(target: ProviderTarget, messages: Message[]): Promise<Response> {
  const provider = createAnthropicClient(target.config);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of provider.stream({ messages, model: target.modelId })) {
          if (chunk.type === "content" && chunk.content) {
            controller.enqueue(encoder.encode(chunk.content));
          }
          if (chunk.type === "error") {
            throw new Error(chunk.error);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function streamWithProvider(target: ProviderTarget, messages: Message[]): Promise<Response> {
  if (target.config.kind === "anthropic") {
    return streamAnthropic(target, messages);
  }

  const modelMessages = toModelMessages(messages);

  if (target.config.kind === "gemini") {
    const google = createGoogleClient(target.config);
    const result = await streamText({
      model: google(target.modelId),
      messages: modelMessages,
    });
    return result.toTextStreamResponse({
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const openai = createOpenAIProvider(target.config);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of openai.stream({ messages, model: target.modelId })) {
          if (chunk.type === "content" && chunk.content) {
            controller.enqueue(encoder.encode(chunk.content));
          }
          if (chunk.type === "error") {
            throw new Error(chunk.error);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

type ParsedPayload = {
  prompt: string;
  context: string;
  model: string | null;
  docFrontier: string;
  parsedFrontier: unknown;
  preconditions: unknown[];
  selectionAnchors: unknown[];
  hashes: string[];
  requestId: string;
  clientRequestId: string | null;
};

type ParseResult = { payload: ParsedPayload } | { error: Response };

const getPayloadString = (payload: Record<string, unknown>, key: string): string | null =>
  typeof payload[key] === "string" ? (payload[key] as string) : null;

const getPayloadArray = (payload: Record<string, unknown>, key: string): unknown[] | null =>
  Array.isArray(payload[key]) ? (payload[key] as unknown[]) : null;

const buildRequestIdFields = (
  requestId: string | null,
  clientRequestId: string | null
): Record<string, unknown> => ({
  ...(requestId ? { request_id: requestId } : {}),
  ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
});

const invalidRequest = (
  message: string,
  requestId: string | null,
  clientRequestId: string | null
): Response =>
  jsonErrorResponse(
    400,
    "INVALID_REQUEST",
    message,
    buildRequestIdFields(requestId, clientRequestId)
  );

const extractPreconditionHashes = (preconditions: unknown[]): string[] =>
  preconditions
    .map((entry) =>
      typeof entry === "object" && entry && "if_match_context_hash" in entry
        ? (entry as { if_match_context_hash?: unknown }).if_match_context_hash
        : null
    )
    .filter((value): value is string => typeof value === "string");

const parseFrontier = (
  docFrontier: string,
  requestId: string | null,
  clientRequestId: string | null
): { parsedFrontier?: unknown; error?: Response } => {
  try {
    return { parsedFrontier: JSON.parse(docFrontier) };
  } catch {
    return {
      error: jsonErrorResponse(400, "INVALID_REQUEST", "doc_frontier must be valid JSON", {
        ...buildRequestIdFields(requestId, clientRequestId),
      }),
    };
  }
};

async function parseRequestPayload(req: Request): Promise<ParseResult> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: jsonErrorResponse(400, "INVALID_JSON", "Request body must be valid JSON") };
  }

  if (!body || typeof body !== "object") {
    return { error: jsonErrorResponse(400, "INVALID_REQUEST", "Request body must be an object") };
  }

  const payload = body as Record<string, unknown>;
  const clientRequestId = getPayloadString(payload, "client_request_id");
  const requestId = getPayloadString(payload, "request_id") ?? clientRequestId;
  const prompt = getPayloadString(payload, "prompt");
  const context = getPayloadString(payload, "context");
  const model = getPayloadString(payload, "model");

  if (!prompt || !context) {
    return { error: invalidRequest("prompt and context are required", requestId, clientRequestId) };
  }

  if (!requestId) {
    return { error: invalidRequest("request_id is required", requestId, clientRequestId) };
  }

  const docFrontier = getPayloadString(payload, "doc_frontier");
  if (!docFrontier) {
    return { error: invalidRequest("doc_frontier is required", requestId, clientRequestId) };
  }

  const frontierResult = parseFrontier(docFrontier, requestId, clientRequestId);
  if (frontierResult.error) {
    return { error: frontierResult.error };
  }

  const preconditions = getPayloadArray(payload, "preconditions");
  if (!preconditions || preconditions.length === 0) {
    return { error: invalidRequest("preconditions are required", requestId, clientRequestId) };
  }

  const hashes = extractPreconditionHashes(preconditions);
  if (hashes.length !== preconditions.length) {
    return {
      error: invalidRequest("preconditions must include hashes", requestId, clientRequestId),
    };
  }

  const selectionAnchors = getPayloadArray(payload, "selection_anchors");
  if (!selectionAnchors || selectionAnchors.length === 0) {
    return { error: invalidRequest("selection_anchors are required", requestId, clientRequestId) };
  }

  return {
    payload: {
      prompt,
      context,
      model,
      docFrontier,
      parsedFrontier: frontierResult.parsedFrontier,
      preconditions,
      selectionAnchors,
      hashes,
      requestId,
      clientRequestId,
    },
  };
}

function providerErrorResponse(
  error: ProviderResolutionError,
  requestId: string | null,
  clientRequestId: string | null
): Response {
  if (error.code === "provider_not_configured" || error.code === "no_provider_configured") {
    return jsonErrorResponse(500, "CONFIG_ERROR", error.message, {
      ...buildRequestIdFields(requestId, clientRequestId),
    });
  }

  return invalidRequest(error.message, requestId, clientRequestId);
}

export async function POST(req: Request) {
  const parsed = await parseRequestPayload(req);
  if ("error" in parsed) {
    return parsed.error;
  }

  const { prompt, context, hashes, parsedFrontier, requestId, clientRequestId, model } =
    parsed.payload;
  const contextHash = await computeOptimisticHash(context);

  if (hashes.some((hash) => hash !== contextHash)) {
    console.warn("[AI API] Context hash mismatch", {
      request_id: requestId,
      client_request_id: clientRequestId,
      expected: contextHash,
    });
    return jsonErrorResponse(409, "CONFLICT", "Context hash mismatch", {
      ...buildRequestIdFields(requestId, clientRequestId),
      current_frontier: parsedFrontier,
      current_hash: contextHash,
    });
  }

  const resolved = resolveProviderTarget({
    requestedModel: model,
    defaultModelId: getDefaultStreamModelId(),
  });

  if (resolved.error) {
    return providerErrorResponse(resolved.error, requestId, clientRequestId);
  }

  if (!resolved.target) {
    return providerErrorResponse(
      { code: "no_provider_configured", message: "No AI provider configured" },
      requestId,
      clientRequestId
    );
  }

  const messages = buildStreamMessages(prompt, context);

  try {
    return await streamWithProvider(resolved.target, messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stream request failed";
    return jsonErrorResponse(500, "PROVIDER_ERROR", message, {
      ...buildRequestIdFields(requestId, clientRequestId),
    });
  }
}

function jsonErrorResponse(
  status: 400 | 409 | 500,
  code: string,
  message: string,
  extra: Record<string, unknown> = {}
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        ...extra,
      },
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
