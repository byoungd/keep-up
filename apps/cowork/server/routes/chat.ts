import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CoworkSession, CriticAgent, TokenUsageStats } from "@ku0/agent-runtime";
import {
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAIAdapter,
  getModelCapability,
  type LLMProvider,
  normalizeModelId,
  ProviderRouter,
  resolveProviderFromEnv,
} from "@ku0/ai-core";
import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { jsonError, readJsonBody } from "../http";
import type { ProviderKeyService } from "../services/providerKeyService";
import type { ChatMessageStoreLike, SessionStoreLike } from "../storage/contracts";
import { ensureStateDir } from "../storage/statePaths";
import type { CoworkChatAttachmentRef, CoworkChatMessage, CoworkSettings } from "../storage/types";
import { COWORK_EVENTS, type SessionEventHub } from "../streaming/eventHub";
import { calculateUsageCostUsd, mergeTokenUsage, normalizeTokenUsage } from "../utils/tokenUsage";

interface ChatRouteDeps {
  sessionStore: SessionStoreLike;
  chatMessageStore: ChatMessageStoreLike;
  getSettings: () => Promise<CoworkSettings>;
  providerKeys: ProviderKeyService;
  events: SessionEventHub;
  critic?: CriticAgent;
}

interface ChatRequestBody {
  content: string;
  clientRequestId?: string;
  messageId?: string;
  parentId?: string;
  attachments?: CoworkChatAttachmentRef[];
}

type ChatRouterInfo = {
  router: ProviderRouter;
  model: string;
  providerId: string;
  fallbackNotice?: string;
};

export function createChatRoutes(deps: ChatRouteDeps) {
  const app = new Hono();
  const attachmentsRoot = "attachments";
  const maxAttachmentBytes = 10 * 1024 * 1024;

  // POST /sessions/:sessionId/chat - Send chat message
  app.post("/sessions/:sessionId/chat", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = (await readJsonBody(c)) as ChatRequestBody | null;

    if (!body || typeof body.content !== "string") {
      return jsonError(c, 400, "Invalid chat payload");
    }

    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const settings = await deps.getSettings();
    const routerInfo = await createChatRouter(settings, deps.providerKeys);
    if (!routerInfo) {
      return jsonError(c, 503, "No AI provider configured");
    }

    const requestId = resolveRequestId(body);
    const userMessageId = resolveUserMessageId(body, requestId);
    const assistantMessageId = resolveAssistantMessageId(requestId);
    const model = routerInfo.model;

    setChatResponseHeaders(c, {
      requestId,
      assistantMessageId,
      model,
      providerId: routerInfo.providerId,
      fallbackNotice: routerInfo.fallbackNotice,
    });

    if (requestId) {
      const cached = await deps.chatMessageStore.getByClientRequestId(requestId, "assistant");
      if (cached) {
        await ensureUserMessage(deps.chatMessageStore, sessionId, userMessageId, body, requestId);
        return streamText(c, async (stream) => {
          if (cached.content) {
            await stream.write(cached.content);
          }
        });
      }
    }

    await ensureUserMessage(deps.chatMessageStore, sessionId, userMessageId, body, requestId);
    void maybeCaptureFeedback({
      critic: deps.critic,
      session,
      settings,
      body,
    });
    await deps.chatMessageStore.create({
      messageId: assistantMessageId,
      sessionId,
      role: "assistant",
      content: "",
      createdAt: Date.now() + 1,
      status: "streaming",
      modelId: model,
      providerId: routerInfo.providerId,
      fallbackNotice: routerInfo.fallbackNotice,
      parentId: body.parentId,
      clientRequestId: requestId ?? undefined,
      metadata: requestId ? { requestId } : {},
    });

    return streamText(c, async (stream) => {
      await executeAIStream(stream, {
        routerInfo,
        sessionId,
        assistantMessageId,
        userContent: body.content,
        chatMessageStore: deps.chatMessageStore,
      });
    });
  });

  async function executeAIStream(
    stream: { write: (s: string) => Promise<unknown> },
    opts: {
      routerInfo: ChatRouterInfo;
      sessionId: string;
      assistantMessageId: string;
      userContent: string;
      chatMessageStore: ChatMessageStoreLike;
    }
  ) {
    const { routerInfo, sessionId, assistantMessageId, userContent, chatMessageStore } = opts;
    const model = routerInfo.model;
    const startTime = Date.now();
    const state: StreamState = { fullContent: "", firstChunkAt: null, usage: null };

    try {
      await streamAssistantResponse(stream, routerInfo, userContent, state);
      const usageStats = state.usage ? normalizeTokenUsage(state.usage, model) : null;
      const costUsd = usageStats ? calculateUsageCostUsd(usageStats, model) : null;

      await persistAssistantMessage(chatMessageStore, assistantMessageId, {
        content: state.fullContent,
        usageStats,
        costUsd,
        modelId: model,
        providerId: routerInfo.providerId,
        startTime,
        firstChunkAt: state.firstChunkAt,
      });

      if (usageStats) {
        await publishUsageEvents(sessionId, assistantMessageId, usageStats, {
          modelId: model,
          providerId: routerInfo.providerId,
          costUsd,
        });
      }
    } catch (error) {
      await handleStreamFailure(stream, chatMessageStore, assistantMessageId, {
        error,
        content: state.fullContent,
      });
    }
  }

  type StreamState = {
    fullContent: string;
    firstChunkAt: number | null;
    usage: TokenUsageStats | null;
  };

  async function streamAssistantResponse(
    stream: { write: (s: string) => Promise<unknown> },
    routerInfo: ChatRouterInfo,
    userContent: string,
    state: StreamState
  ): Promise<void> {
    const response = routerInfo.router.stream({
      model: routerInfo.model,
      messages: [
        { role: "system", content: "You are a helpful AI assistant." },
        { role: "user", content: userContent },
      ],
    });

    for await (const chunk of response) {
      if (chunk.type === "content" && chunk.content) {
        if (!state.firstChunkAt) {
          state.firstChunkAt = Date.now();
        }
        state.fullContent += chunk.content;
        await stream.write(chunk.content);
        continue;
      }
      if (chunk.type === "usage" && chunk.usage) {
        state.usage = chunk.usage;
      }
    }
  }

  async function persistAssistantMessage(
    chatMessageStore: ChatMessageStoreLike,
    assistantMessageId: string,
    data: {
      content: string;
      usageStats: TokenUsageStats | null;
      costUsd: number | null;
      modelId: string;
      providerId?: string;
      startTime: number;
      firstChunkAt: number | null;
    }
  ): Promise<void> {
    const usageMetadata = data.usageStats
      ? {
          usage: {
            ...data.usageStats,
            costUsd: data.costUsd,
            modelId: data.modelId,
            providerId: data.providerId,
          },
        }
      : {};
    const telemetry = {
      ttfbMs: data.firstChunkAt ? data.firstChunkAt - data.startTime : null,
      ttftMs: data.firstChunkAt ? data.firstChunkAt - data.startTime : null,
      durationMs: Date.now() - data.startTime,
    };

    await chatMessageStore.update(assistantMessageId, (message) => ({
      ...message,
      content: data.content,
      status: data.content ? "done" : "error",
      updatedAt: Date.now(),
      metadata: {
        ...message.metadata,
        ...usageMetadata,
        telemetry,
      },
    }));
  }

  async function handleStreamFailure(
    stream: { write: (s: string) => Promise<unknown> },
    chatMessageStore: ChatMessageStoreLike,
    assistantMessageId: string,
    data: { error: unknown; content: string }
  ): Promise<void> {
    const message = data.error instanceof Error ? data.error.message : "Chat failed";
    await stream.write(`\n\nError: ${message}`);
    await chatMessageStore.update(assistantMessageId, (prev) => ({
      ...prev,
      content: `${data.content}\n\nError: ${message}`.trim(),
      status: "error",
      updatedAt: Date.now(),
    }));
  }

  async function publishUsageEvents(
    sessionId: string,
    messageId: string,
    usage: TokenUsageStats,
    meta: { modelId?: string; providerId?: string; costUsd: number | null }
  ) {
    const updated = await deps.sessionStore.update(sessionId, (session) => ({
      ...session,
      usage: mergeTokenUsage(session.usage, usage),
    }));

    if (updated?.usage) {
      deps.events.publish(sessionId, COWORK_EVENTS.SESSION_USAGE_UPDATED, {
        inputTokens: updated.usage.inputTokens,
        outputTokens: updated.usage.outputTokens,
        totalTokens: updated.usage.totalTokens,
      });
    }

    deps.events.publish(sessionId, COWORK_EVENTS.TOKEN_USAGE, {
      messageId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      costUsd: meta.costUsd,
      modelId: meta.modelId,
      providerId: meta.providerId,
      contextWindow: usage.contextWindow,
      utilization: usage.utilization,
    });
  }

  function setChatResponseHeaders(
    c: import("hono").Context,
    meta: {
      requestId: string | null;
      assistantMessageId: string;
      model: string;
      providerId: string;
      fallbackNotice?: string;
    }
  ) {
    if (meta.requestId) {
      c.header("X-Cowork-Request-Id", meta.requestId);
    }
    c.header("X-Cowork-Message-Id", meta.assistantMessageId);
    c.header("X-Cowork-Model", meta.model);
    c.header("X-Cowork-Provider", meta.providerId);
    if (meta.fallbackNotice) {
      c.header("X-Cowork-Fallback", meta.fallbackNotice);
    }
  }

  app.patch("/sessions/:sessionId/messages/:messageId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const messageId = c.req.param("messageId");
    const body = (await readJsonBody(c)) as { content?: string } | null;

    if (!body || typeof body.content !== "string") {
      return jsonError(c, 400, "Invalid message update payload");
    }

    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const newContent = body.content;
    const updated = await deps.chatMessageStore.update(messageId, (message) => ({
      ...message,
      content: newContent,
      updatedAt: Date.now(),
      status: message.status === "error" ? "done" : message.status,
    }));

    if (!updated || updated.sessionId !== sessionId) {
      return jsonError(c, 404, "Message not found");
    }

    return c.json({ ok: true, message: toResponseMessage(updated) });
  });

  // GET /sessions/:sessionId/chat - Get chat history (placeholder)
  app.get("/sessions/:sessionId/chat", async (c) => {
    const sessionId = c.req.param("sessionId");

    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const messages = await deps.chatMessageStore.getBySession(sessionId);
    return c.json({
      ok: true,
      messages: messages.map(toResponseMessage),
    });
  });

  app.post("/sessions/:sessionId/attachments", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!isFileLike(file)) {
      return jsonError(c, 400, "Invalid attachment payload");
    }

    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFileName(file.name || "attachment");
    const stateDir = await ensureStateDir();
    const sessionDir = join(stateDir, attachmentsRoot, sessionId);
    await mkdir(sessionDir, { recursive: true });

    const storedName = `${attachmentId}-${safeName}`;
    const filePath = join(sessionDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > maxAttachmentBytes) {
      return jsonError(c, 413, "Attachment too large");
    }
    await writeFile(filePath, buffer);

    const attachment: CoworkChatAttachmentRef = {
      id: attachmentId,
      kind: file.type?.startsWith("image/") ? "image" : "file",
      name: safeName,
      sizeBytes: buffer.length,
      mimeType: file.type || "application/octet-stream",
      storageUri: `/api/sessions/${sessionId}/attachments/${attachmentId}/${encodeURIComponent(
        safeName
      )}`,
    };

    return c.json({ ok: true, attachment }, 201);
  });

  app.get("/sessions/:sessionId/attachments/:attachmentId/:fileName", async (c) => {
    const sessionId = c.req.param("sessionId");
    const attachmentId = c.req.param("attachmentId");
    const fileName = c.req.param("fileName");
    const safeName = sanitizeFileName(fileName);
    if (safeName !== fileName) {
      return jsonError(c, 400, "Invalid attachment name");
    }

    try {
      const stateDir = await ensureStateDir();
      const filePath = join(stateDir, attachmentsRoot, sessionId, `${attachmentId}-${safeName}`);
      const data = await readFile(filePath);
      return c.body(data, 200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      });
    } catch {
      return jsonError(c, 404, "Attachment not found");
    }
  });

  return app;
}

function maybeCaptureFeedback(params: {
  critic?: CriticAgent;
  session: CoworkSession;
  settings: CoworkSettings;
  body: ChatRequestBody;
}): void {
  if (!params.critic) {
    return;
  }
  if (!params.body.parentId) {
    return;
  }
  const projectId = params.session.projectId ?? params.session.grants[0]?.rootPath;
  void params.critic.ingestFeedback({
    feedback: params.body.content,
    projectId,
    profile: params.settings.memoryProfile ?? "default",
    metadata: {
      parentId: params.body.parentId,
      sessionId: params.session.sessionId,
      messageId: params.body.messageId,
    },
  });
}

function toResponseMessage(message: CoworkChatMessage) {
  return {
    id: message.messageId,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    status: message.status,
    modelId: message.modelId,
    providerId: message.providerId,
    fallbackNotice: message.fallbackNotice,
    parentId: message.parentId,
    attachments: message.attachments ?? [],
    metadata: message.metadata ?? {},
  };
}

function resolveRequestId(body: ChatRequestBody): string | null {
  if (typeof body.clientRequestId === "string" && body.clientRequestId.trim()) {
    return body.clientRequestId.trim();
  }
  const legacy = (body as { client_request_id?: string }).client_request_id;
  if (typeof legacy === "string" && legacy.trim()) {
    return legacy.trim();
  }
  return null;
}

function resolveUserMessageId(body: ChatRequestBody, requestId: string | null): string {
  if (typeof body.messageId === "string" && body.messageId.trim()) {
    return body.messageId.trim();
  }
  if (requestId) {
    return `user-${requestId}`;
  }
  return crypto.randomUUID();
}

function resolveAssistantMessageId(requestId: string | null): string {
  if (requestId) {
    return `assistant-${requestId}`;
  }
  return crypto.randomUUID();
}

async function ensureUserMessage(
  chatStore: ChatMessageStoreLike,
  sessionId: string,
  messageId: string,
  body: ChatRequestBody,
  requestId: string | null
): Promise<CoworkChatMessage> {
  const existing = await chatStore.getById(messageId);
  if (existing) {
    return existing;
  }

  const createdAt = Date.now();
  const message: CoworkChatMessage = {
    messageId,
    sessionId,
    role: "user",
    content: body.content,
    createdAt,
    status: "done",
    parentId: body.parentId,
    clientRequestId: requestId ?? undefined,
    attachments: body.attachments ?? [],
    metadata: requestId ? { requestId } : undefined,
  };
  await chatStore.create(message);
  return message;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type FileLike = {
  name?: string;
  size?: number;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof (value as FileLike).arrayBuffer === "function"
  );
}

type ChatProviderId = "openai" | "anthropic" | "gemini";
type ChatProviderEntry = { name: ChatProviderId; provider: LLMProvider };

async function createChatRouter(
  settings: CoworkSettings,
  providerKeys: ProviderKeyService
): Promise<ChatRouterInfo | null> {
  const providers = await buildChatProviders(providerKeys);

  if (providers.length === 0) {
    return null;
  }

  const requestedModel = normalizeModelId(settings.defaultModel ?? undefined);
  const { primary, fallbackOrder, fallbackNotice } = selectChatRouting(providers, requestedModel);
  const router = new ProviderRouter({
    primaryProvider: primary,
    fallbackOrder,
    enableFallback: true,
  });

  for (const entry of providers) {
    router.registerProvider(entry.provider);
  }

  return {
    router,
    model:
      requestedModel ??
      providers.find((entry) => entry.name === primary)?.provider.defaultModel ??
      "",
    providerId: primary,
    fallbackNotice,
  };
}

async function buildChatProviders(providerKeys: ProviderKeyService): Promise<ChatProviderEntry[]> {
  const openaiEnv = resolveProviderFromEnv("openai");
  const claudeEnv = resolveProviderFromEnv("claude");
  const geminiEnv = resolveProviderFromEnv("gemini");
  const [openAiKey, anthropicKey, geminiKey] = await Promise.all([
    providerKeys.getResolvedKey("openai").then((k) => k ?? undefined),
    providerKeys.getResolvedKey("anthropic").then((k) => k ?? undefined),
    providerKeys.getResolvedKey("gemini").then((k) => k ?? undefined),
  ]);
  const geminiBaseUrl =
    geminiEnv?.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
  const providers: ChatProviderEntry[] = [];

  addChatProvider(providers, "openai", openAiKey, (key) => {
    return createOpenAIAdapter({ apiKey: key, baseUrl: openaiEnv?.baseUrl });
  });
  addChatProvider(providers, "anthropic", anthropicKey, (key) => {
    return createAnthropicAdapter({ apiKey: key, baseUrl: claudeEnv?.baseUrl });
  });
  addChatProvider(providers, "gemini", geminiKey, (key) => {
    return createGoogleAdapter({ apiKey: key, baseUrl: geminiBaseUrl });
  });

  return providers;
}

function addChatProvider(
  providers: ChatProviderEntry[],
  name: ChatProviderId,
  apiKey: string | undefined,
  createProvider: (key: string) => LLMProvider
): void {
  if (!apiKey) {
    return;
  }
  providers.push({ name, provider: createProvider(apiKey) });
}

function selectChatRouting(
  providers: ChatProviderEntry[],
  requestedModel: string | undefined
): {
  primary: ChatProviderId;
  fallbackOrder: ChatProviderId[];
  fallbackNotice?: string;
} {
  const preferred = resolvePreferredProvider(requestedModel);
  const providerNames = providers.map((entry) => entry.name);
  const primary =
    preferred && providerNames.includes(preferred) ? preferred : (providerNames[0] ?? "openai");
  const fallbackOrder = providerNames.filter((name) => name !== primary);
  const fallbackNotice =
    requestedModel && preferred && preferred !== primary
      ? `Requested provider ${preferred} unavailable. Using ${primary} instead.`
      : undefined;

  return { primary, fallbackOrder, fallbackNotice };
}

function resolvePreferredProvider(
  model: string | undefined
): "openai" | "anthropic" | "gemini" | undefined {
  if (!model) {
    return undefined;
  }
  const capability = getModelCapability(model);
  if (capability?.provider === "openai") {
    return "openai";
  }
  if (capability?.provider === "gemini") {
    return "gemini";
  }
  if (capability?.provider === "claude") {
    return "anthropic";
  }
  const lower = model.toLowerCase();
  if (lower.includes("claude")) {
    return "anthropic";
  }
  if (lower.includes("gemini")) {
    return "gemini";
  }
  if (
    lower.includes("gpt") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("o4")
  ) {
    return "openai";
  }
  return undefined;
}
