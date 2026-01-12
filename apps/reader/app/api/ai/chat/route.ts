/**
 * AI Chat API Route
 *
 * Main endpoint for AI Panel chat functionality.
 * Routes requests across OpenAI-compatible, Anthropic, and Gemini providers.
 */

import { type ChatMessage, buildChatMessages } from "@/lib/ai/contextBuilder";
import type { ModelCapability } from "@/lib/ai/models";
import { type WorkflowType, getWorkflowSystemPrompt } from "@/lib/ai/workflowPrompts";
import type { Message } from "@keepup/ai-core";
import { normalizeMessages } from "@keepup/ai-core";
import { computeOptimisticHash } from "@keepup/core";
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
};

type ErrorCode =
  | "missing_prompt"
  | "invalid_model"
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

function validateRequest(
  prompt: string | undefined,
  capability: ModelCapability | undefined,
  attachments: RequestBody["attachments"] | undefined,
  requestId: string
): Response | null {
  if (!prompt) {
    return errorResponse("missing_prompt", "prompt is required", requestId, 400);
  }

  if (!capability) {
    return errorResponse("invalid_model", "model not allowed", requestId, 400);
  }

  if (attachments && attachments.length > 0 && !capability.supports.vision) {
    return errorResponse(
      "unsupported_capability",
      "selected model does not support image attachments",
      requestId,
      422
    );
  }

  return null;
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
    } = body ?? {};
    const requestId = request_id ?? client_request_id ?? fallbackRequestId;

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

    const error = validateRequest(prompt, resolved.target.capability, attachments, requestId);
    if (error) {
      return error;
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
          policyContext: policy_context,
        }
      );
    }

    const content = await completeWithProvider(resolved.target, providerMessages);

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "x-request-id": requestId,
    };
    if (policy_context?.policy_id) {
      headers["x-policy-id"] = policy_context.policy_id;
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
