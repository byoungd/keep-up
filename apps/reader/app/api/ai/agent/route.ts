import * as path from "node:path";

import {
  type CoworkSession,
  type OrchestratorEvent,
  createAICoreAdapter,
  createCoworkOrchestrator,
  createCoworkSessionState,
} from "@keepup/agent-runtime";
import {
  PathValidator,
  createBashToolServer,
  createFileToolServer,
  createToolRegistry,
} from "@keepup/agent-runtime/tools";
import { normalizeRequestIdentifiers } from "@keepup/core";
import { getDefaultChatModelId } from "../modelResolver";
import { createAnthropicClient, createOpenAIProvider } from "../providerClients";
import { type ProviderResolutionError, resolveProviderTarget } from "../providerResolver";
import { createErrorResponse, createStreamResponse, handleUnknownError } from "../responseUtils";
import { buildInitialState, buildSystemPrompt, resolveWorkspaceRoot } from "./agentShared";
import { createPendingConfirmation } from "./confirmationStore";

export const runtime = "nodejs";

const DEFAULT_AGENT_ID = "reader-panel";
type AgentRequestBody = {
  prompt?: string;
  model?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  systemPrompt?: string;
  request_id?: string;
  client_request_id?: string;
  agent_id?: string;
  intent_id?: string;
};

function providerErrorResponse(error: ProviderResolutionError, requestId: string): Response {
  const code =
    error.code === "provider_not_configured" || error.code === "no_provider_configured"
      ? "config_error"
      : "invalid_model";
  return createErrorResponse(code, error.message, { requestId });
}

type AgentHistory = AgentRequestBody["messages"];

type StreamSenders = {
  send: (payload: object) => void;
  sendEvent: (event: object) => void;
  close: (metadata: { agentId: string; intentId?: string; requestId: string }) => void;
  fail: (error: unknown) => void;
};

function createStreamSenders(
  controller: ReadableStreamDefaultController<Uint8Array>,
  state: { closed: boolean }
): StreamSenders {
  const encoder = new TextEncoder();
  const send = (payload: object) => {
    if (state.closed) {
      return;
    }
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };
  const sendEvent = (event: object) => send({ event });
  const close = (metadata: { agentId: string; intentId?: string; requestId: string }) => {
    if (state.closed) {
      return;
    }
    send({
      metadata: {
        agent_id: metadata.agentId,
        intent_id: metadata.intentId,
        request_id: metadata.requestId,
      },
    });
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
    state.closed = true;
  };
  const fail = (error: unknown) => {
    if (state.closed) {
      return;
    }
    state.closed = true;
    controller.error(error);
  };
  return { send, sendEvent, close, fail };
}

function extractCompletionContent(event: OrchestratorEvent): string | null {
  if (event.type !== "complete") {
    return null;
  }
  if (typeof event.data === "object" && event.data && "content" in event.data) {
    return String((event.data as { content?: unknown }).content ?? "");
  }
  return "";
}

function shouldSkipEvent(event: OrchestratorEvent): boolean {
  return event.type === "confirmation:required" || event.type === "confirmation:received";
}

async function streamOrchestratorEvents(options: {
  orchestrator: ReturnType<typeof createCoworkOrchestrator>;
  prompt: string;
  send: (payload: object) => void;
  sendEvent: (event: object) => void;
}) {
  for await (const event of options.orchestrator.runStream(options.prompt)) {
    const completion = extractCompletionContent(event);
    if (completion) {
      options.send({ choices: [{ delta: { content: completion } }] });
      continue;
    }
    if (shouldSkipEvent(event)) {
      continue;
    }
    options.sendEvent(event);
  }
}

function registerConfirmationHandler(options: {
  orchestrator: ReturnType<typeof createCoworkOrchestrator>;
  requestId: string;
  sendEvent: (event: object) => void;
}) {
  options.orchestrator.setConfirmationHandler(async (confirmation) => {
    const { confirmationId, promise } = await createPendingConfirmation({
      requestId: options.requestId,
      metadata: {
        toolName: confirmation.toolName,
        description: confirmation.description,
        risk: confirmation.risk,
        reason: confirmation.reason,
        riskTags: confirmation.riskTags,
        arguments: confirmation.arguments,
      },
    });
    const snapshot = options.orchestrator.getState();
    options.sendEvent({
      type: "confirmation:required",
      timestamp: Date.now(),
      turn: snapshot.turn,
      data: { ...confirmation, confirmation_id: confirmationId },
    });
    promise.then((confirmed) => {
      options.sendEvent({
        type: "confirmation:received",
        timestamp: Date.now(),
        turn: options.orchestrator.getState().turn,
        data: { confirmed, confirmation_id: confirmationId },
      });
    });
    return promise;
  });
}

export async function POST(request: Request) {
  const fallbackRequestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const body = (await request.json()) as AgentRequestBody;
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
        "Cowork agent runtime does not support Gemini providers yet. Choose OpenAI or Claude.",
        { requestId }
      );
    }

    const provider =
      resolved.target.config.kind === "anthropic"
        ? createAnthropicClient(resolved.target.config)
        : createOpenAIProvider(resolved.target.config);
    // @ts-expect-error - provider types are compatible but not exported
    const llm = createAICoreAdapter(provider, { model: resolved.target.modelId });

    const registry = createToolRegistry();
    const workspaceRoot = resolveWorkspaceRoot();
    const outputRoot = path.join(workspaceRoot, ".keep-up", "outputs");
    const validator = new PathValidator({ allowedPaths: [workspaceRoot] });

    await registry.register(createFileToolServer({ validator }));
    await registry.register(createBashToolServer());

    const agentId = body.agent_id ?? DEFAULT_AGENT_ID;
    const session: CoworkSession = {
      sessionId: requestId,
      userId: agentId,
      deviceId: "reader",
      platform: "macos",
      mode: "cowork",
      grants: [
        {
          id: "workspace",
          rootPath: workspaceRoot,
          allowWrite: true,
          allowDelete: true,
          allowCreate: true,
          outputRoots: [outputRoot],
        },
      ],
      connectors: [],
      createdAt: Date.now(),
    };

    const systemPrompt = buildSystemPrompt(body.systemPrompt);
    const sessionState = createCoworkSessionState({
      initialState: buildInitialState(systemPrompt, body.messages as AgentHistory),
    });

    const orchestrator = createCoworkOrchestrator(llm, registry, {
      cowork: { session },
      components: { sessionState },
      requireConfirmation: true,
      maxTurns: 25,
    });

    const intentId = body.intent_id;
    const streamState = { closed: false };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const { send, sendEvent, close, fail } = createStreamSenders(controller, streamState);
        registerConfirmationHandler({ orchestrator, requestId, sendEvent });

        try {
          await streamOrchestratorEvents({ orchestrator, prompt, send, sendEvent });
          close({ agentId, intentId, requestId });
        } catch (error) {
          fail(error);
        }
      },
      cancel() {
        streamState.closed = true;
        orchestrator.stop();
      },
    });

    return createStreamResponse(stream, {
      requestId,
      headers: {
        "x-agent-id": agentId,
        ...(intentId ? { "x-intent-id": intentId } : {}),
      },
    });
  } catch (error) {
    return handleUnknownError(error, fallbackRequestId);
  }
}
