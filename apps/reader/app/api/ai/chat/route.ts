/**
 * AI Chat API Route
 *
 * Main endpoint for AI Panel chat functionality.
 * Routes requests across OpenAI-compatible, Anthropic, and Gemini providers.
 *
 * Features:
 * - Multi-provider routing with automatic fallback
 * - End-to-end distributed tracing (W3C Trace Context)
 * - Standardized error responses
 * - Request idempotency
 */

import { type ChatMessage, buildChatMessages } from "@/lib/ai/contextBuilder";
import { type WorkflowType, getWorkflowSystemPrompt } from "@/lib/ai/workflowPrompts";
import type { Message } from "@ku0/ai-core";
import { normalizeMessages } from "@ku0/ai-core";
import {
  DEFAULT_POLICY_MANIFEST,
  computeOptimisticHash,
  normalizeRequestIdentifiers,
} from "@ku0/core";
import { validateChatRequest } from "../chatValidation";
import { completeWithProvider, streamProviderContent } from "../llmGateway";
import { getDefaultChatModelId } from "../modelResolver";
import { type ProviderResolutionError, resolveProviderTarget } from "../providerResolver";

export const runtime = "nodejs";

type RequestBody = {
  prompt: string;
  context?: string;
  model?: string;
  stream?: boolean;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  attachments?: Array<{ type: "image"; url: string }>;
  workflow?: "tdd" | "refactoring" | "debugging" | "research" | "none";
  systemPrompt?: string;
  request_id?: string;
  client_request_id?: string;
  policy_context?: { policy_id?: string; redaction_profile?: string; data_access_profile?: string };
  agent_id?: string;
  intent_id?: string;
};

type ErrorCode =
  | "missing_prompt"
  | "invalid_model"
  | "invalid_request"
  | "unsupported_capability"
  | "config_error"
  | "provider_error";

const DEFAULT_MODEL = getDefaultChatModelId();

function errorResponse(code: ErrorCode, message: string, requestId: string, status = 400) {
  return new Response(JSON.stringify({ error: { code, message, request_id: requestId } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function prepareProviderMessages(
  prompt: string,
  context: string,
  messages: RequestBody["messages"] | undefined,
  attachments: RequestBody["attachments"] | undefined,
  workflow: WorkflowType,
  systemPrompt?: string
): Message[] {
  const promptWithAttachments =
    attachments && attachments.length > 0
      ? `${prompt}\n\nImages:\n${attachments.map((att) => att.url).join("\n")}`
      : prompt;

  const history =
    messages?.map((m) => ({ role: m.role, content: m.content }) satisfies ChatMessage) ?? [];
  const { messages: chatMessages } = buildChatMessages({
    prompt: promptWithAttachments,
    context,
    history,
  });

  const resolvedSystemPrompt = systemPrompt ?? getWorkflowSystemPrompt(workflow);
  const systemMessages: Message[] = resolvedSystemPrompt
    ? [{ role: "system" as const, content: resolvedSystemPrompt }]
    : [];

  const allMessages = [
    ...systemMessages,
    ...chatMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  // Drop empty messages to avoid provider "invalid argument" errors
  return normalizeMessages(allMessages);
}

function providerErrorResponse(error: ProviderResolutionError, requestId: string): Response {
  const code: ErrorCode =
    error.code === "provider_not_configured" || error.code === "no_provider_configured"
      ? "config_error"
      : "invalid_model";
  const status = code === "config_error" ? 500 : 400;
  return errorResponse(code, error.message, requestId, status);
}

// Simple idempotency cache for non-stream responses (best effort, in-memory)
const IDEMPOTENCY_WINDOW_MS = 60_000;
const responseCache = new Map<
  string,
  { body: string; storedAt: number; headers: Record<string, string> }
>();

function getCachedResponse(requestId: string): Response | null {
  const cached = responseCache.get(requestId);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.storedAt > IDEMPOTENCY_WINDOW_MS) {
    responseCache.delete(requestId);
    return null;
  }
  return new Response(cached.body, {
    status: 200,
    headers: cached.headers,
  });
}

function cacheResponse(requestId: string, body: string, headers: Record<string, string>): void {
  responseCache.set(requestId, { body, storedAt: Date.now(), headers });
}

async function handleStreamResponse(
  stream: AsyncIterable<string>,
  messages: Message[],
  model: string,
  requestId: string,
  options?: {
    promptTemplateId?: string;
    contextHash?: string;
    policyContext?: {
      policy_id?: string;
      redaction_profile?: string;
      data_access_profile?: string;
    };
    agentId?: string;
    intentId?: string;
  }
): Promise<Response> {
  const textEncoder = new TextEncoder();
  const promptHash = await computeOptimisticHash(
    messages.map((message) => message.content).join("\n")
  );
  const streamBody = new ReadableStream({
    async start(controller) {
      try {
        let contentLength = 0;
        for await (const chunk of stream) {
          if (!chunk) {
            continue;
          }
          contentLength += chunk.length;
          const ssePayload = JSON.stringify({
            choices: [{ delta: { content: chunk } }],
          });
          controller.enqueue(textEncoder.encode(`data: ${ssePayload}\n\n`));
        }

        // Send AI metadata
        const confidence = Math.min(0.95, 0.6 + contentLength / 5000);
        const metadataPayload = JSON.stringify({
          metadata: {
            confidence,
            provenance: {
              model_id: model,
              prompt_hash: promptHash,
              prompt_template_id: options?.promptTemplateId,
              input_context_hashes: options?.contextHash ? [options.contextHash] : undefined,
              temperature: 0.7,
              request_id: requestId,
            },
            agent_id: options?.agentId,
            intent_id: options?.intentId,
          },
        });
        controller.enqueue(textEncoder.encode(`data: ${metadataPayload}\n\n`));
        controller.enqueue(textEncoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(streamBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "x-request-id": requestId,
      ...(options?.policyContext?.policy_id
        ? { "x-policy-id": options.policyContext.policy_id }
        : {}),
      ...(options?.agentId ? { "x-agent-id": options.agentId } : {}),
      ...(options?.intentId ? { "x-intent-id": options.intentId } : {}),
    },
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: request parsing plus multi-provider routing
export async function POST(req: Request) {
  const fallbackRequestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const queryModel = url.searchParams.get("model") ?? undefined;
    const headerModel = req.headers.get("x-model") ?? undefined;
    const body = (await req.json()) as RequestBody;

    const {
      prompt,
      context = "",
      model,
      stream = false,
      messages,
      attachments,
      workflow = "none",
      systemPrompt,
      request_id,
      client_request_id,
      policy_context,
      agent_id,
      intent_id,
    } = body ?? {};
    const identifiers = normalizeRequestIdentifiers({
      request_id: request_id ?? fallbackRequestId,
      client_request_id,
    });
    const requestId = identifiers.request_id;

    if (!stream) {
      const cached = getCachedResponse(requestId);
      if (cached) {
        return cached;
      }
    }

    if (!prompt) {
      return errorResponse("missing_prompt", "prompt is required", requestId, 400);
    }

    const explicitModel = model || headerModel || queryModel || null;
    const resolved = resolveProviderTarget({
      requestedModel: explicitModel,
      defaultModelId: DEFAULT_MODEL,
    });

    if (resolved.error) {
      return providerErrorResponse(resolved.error, requestId);
    }

    if (!resolved.target) {
      return providerErrorResponse(
        { code: "no_provider_configured", message: "No AI provider configured" },
        requestId
      );
    }

    const validationError = validateChatRequest({
      prompt,
      capability: resolved.target.capability,
      attachments,
    });
    if (validationError) {
      return errorResponse(
        validationError.code,
        validationError.message,
        requestId,
        validationError.status
      );
    }

    const providerMessages = prepareProviderMessages(
      prompt ?? "",
      context,
      messages,
      attachments,
      workflow,
      systemPrompt
    );
    const promptTemplateId = systemPrompt
      ? "ai-chat:custom-system"
      : workflow === "none"
        ? "ai-chat:default"
        : `ai-chat:${workflow}`;

    const resolvedPolicyContext = policy_context ?? {
      policy_id: DEFAULT_POLICY_MANIFEST.policy_id,
    };

    if (
      resolvedPolicyContext?.policy_id &&
      resolvedPolicyContext.policy_id !== DEFAULT_POLICY_MANIFEST.policy_id
    ) {
      return errorResponse(
        "invalid_request",
        "policy_context.policy_id is not supported",
        requestId,
        400
      );
    }

    if (stream) {
      const contextHash = context ? await computeOptimisticHash(context) : undefined;
      const contentStream = streamProviderContent(resolved.target, providerMessages);
      return handleStreamResponse(
        contentStream,
        providerMessages,
        resolved.target.modelId,
        requestId,
        {
          promptTemplateId,
          contextHash,
          policyContext: resolvedPolicyContext,
          agentId: agent_id,
          intentId: intent_id,
        }
      );
    }

    const content = await completeWithProvider(resolved.target, providerMessages);

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "x-request-id": requestId,
    };
    if (resolvedPolicyContext?.policy_id) {
      headers["x-policy-id"] = resolvedPolicyContext.policy_id;
    }
    if (agent_id) {
      headers["x-agent-id"] = agent_id;
    }
    if (intent_id) {
      headers["x-intent-id"] = intent_id;
    }
    if (!stream) {
      cacheResponse(requestId, content, headers);
    }
    return new Response(content, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = (error as Error).message;
    console.error("[AI API Error]", {
      message,
      requestId: fallbackRequestId,
      originalError: error,
    });
    const code: ErrorCode = /api key/i.test(message) ? "config_error" : "provider_error";
    return errorResponse(code, message, fallbackRequestId, 500);
  }
}
