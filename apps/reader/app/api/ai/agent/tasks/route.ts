import { normalizeRequestIdentifiers } from "@keepup/core";
import { getDefaultChatModelId } from "../../modelResolver";
import { type ProviderResolutionError, resolveProviderTarget } from "../../providerResolver";
import {
  createErrorResponse,
  createSuccessResponse,
  handleUnknownError,
} from "../../responseUtils";
import { buildSystemPrompt } from "../agentShared";
import { enqueueBackgroundTask } from "../taskRuntime";

export const runtime = "nodejs";

type TaskRequestBody = {
  prompt?: string;
  model?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  systemPrompt?: string;
  request_id?: string;
  client_request_id?: string;
  agent_id?: string;
  name?: string;
};

function providerErrorResponse(error: ProviderResolutionError, requestId: string): Response {
  const code =
    error.code === "provider_not_configured" || error.code === "no_provider_configured"
      ? "config_error"
      : "invalid_model";
  return createErrorResponse(code, error.message, { requestId });
}

function inferTaskName(prompt: string, fallback = "Background task"): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.length <= 48) {
    return trimmed;
  }
  return `${trimmed.slice(0, 45)}...`;
}

function normalizeHistory(history?: TaskRequestBody["messages"]) {
  if (!history) {
    return undefined;
  }
  const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of history) {
    const content = message.content?.trim();
    if (!content) {
      continue;
    }
    normalized.push({ role: message.role, content });
  }
  return normalized.length > 0 ? normalized : undefined;
}

export async function POST(request: Request) {
  const fallbackRequestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const body = (await request.json()) as TaskRequestBody;
    const identifiers = normalizeRequestIdentifiers({
      request_id: body.request_id ?? fallbackRequestId,
      client_request_id: body.client_request_id,
    });
    const requestId = identifiers.request_id;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return createErrorResponse("missing_prompt", "prompt is required", { requestId });
    }

    const resolved = resolveProviderTarget({
      requestedModel: body.model ?? null,
      defaultModelId: getDefaultChatModelId(),
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

    if (resolved.target.config.kind === "gemini") {
      return createErrorResponse(
        "unsupported_capability",
        "Cowork background tasks do not support Gemini providers yet. Choose OpenAI or Claude.",
        { requestId }
      );
    }

    const systemPrompt = buildSystemPrompt(body.systemPrompt);
    const history = normalizeHistory(body.messages);

    const taskName = body.name?.trim() || inferTaskName(prompt);
    const taskId = await enqueueBackgroundTask({
      prompt,
      modelId: resolved.target.modelId,
      provider: resolved.target.config,
      systemPrompt,
      history,
      agentId: body.agent_id ?? "reader-panel",
      requestId,
      name: taskName,
    });

    return createSuccessResponse(
      {
        task_id: taskId,
        request_id: requestId,
      },
      { requestId }
    );
  } catch (error) {
    return handleUnknownError(error, fallbackRequestId);
  }
}
