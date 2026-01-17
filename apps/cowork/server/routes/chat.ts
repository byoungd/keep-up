import {
  AnthropicProvider,
  GeminiProvider,
  getModelCapability,
  type LLMProvider,
  normalizeModelId,
  OpenAIProvider,
  ProviderRouter,
  resolveProviderFromEnv,
} from "@ku0/ai-core";
import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { jsonError, readJsonBody } from "../http";
import type { SessionStoreLike } from "../storage/contracts";
import type { CoworkSettings } from "../storage/types";

interface ChatRouteDeps {
  sessionStore: SessionStoreLike;
  getSettings: () => Promise<CoworkSettings>;
}

interface ChatRequestBody {
  content: string;
}

type ChatRouterInfo = {
  router: ProviderRouter;
  model: string;
  providerId: string;
  fallbackNotice?: string;
};

export function createChatRoutes(deps: ChatRouteDeps) {
  const app = new Hono();

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
    const routerInfo = createChatRouter(settings);

    if (!routerInfo) {
      return jsonError(c, 503, "No AI provider configured");
    }

    const userContent = body.content;
    const model = routerInfo.model;
    c.header("X-Cowork-Model", model);
    c.header("X-Cowork-Provider", routerInfo.providerId);
    if (routerInfo.fallbackNotice) {
      c.header("X-Cowork-Fallback", routerInfo.fallbackNotice);
    }

    // Stream response inline
    return streamText(c, async (stream) => {
      try {
        const response = routerInfo.router.stream({
          model,
          messages: [
            { role: "system", content: "You are a helpful AI assistant." },
            { role: "user", content: userContent },
          ],
        });

        for await (const chunk of response) {
          if (chunk.type === "content" && chunk.content) {
            await stream.write(chunk.content);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chat failed";
        await stream.write(`\n\nError: ${message}`);
      }
    });
  });

  // GET /sessions/:sessionId/chat - Get chat history (placeholder)
  app.get("/sessions/:sessionId/chat", async (c) => {
    const sessionId = c.req.param("sessionId");

    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    // TODO: Implement chat history storage
    return c.json({ ok: true, messages: [] });
  });

  return app;
}

type ChatProviderId = "openai" | "anthropic" | "gemini";
type ChatProviderEntry = { name: ChatProviderId; provider: LLMProvider };

function createChatRouter(settings: CoworkSettings): ChatRouterInfo | null {
  const providers = buildChatProviders(settings);

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

function buildChatProviders(settings: CoworkSettings): ChatProviderEntry[] {
  const openaiEnv = resolveProviderFromEnv("openai");
  const claudeEnv = resolveProviderFromEnv("claude");
  const geminiEnv = resolveProviderFromEnv("gemini");
  const openAiKey = settings.openAiKey?.trim() || openaiEnv?.apiKeys[0];
  const anthropicKey = settings.anthropicKey?.trim() || claudeEnv?.apiKeys[0];
  const geminiKey = settings.geminiKey?.trim() || geminiEnv?.apiKeys[0];
  const geminiBaseUrl =
    geminiEnv?.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
  const providers: ChatProviderEntry[] = [];

  addChatProvider(providers, "openai", openAiKey, (key) => {
    return new OpenAIProvider({ apiKey: key, baseUrl: openaiEnv?.baseUrl });
  });
  addChatProvider(providers, "anthropic", anthropicKey, (key) => {
    return new AnthropicProvider({ apiKey: key, baseUrl: claudeEnv?.baseUrl });
  });
  addChatProvider(providers, "gemini", geminiKey, (key) => {
    return new GeminiProvider({ apiKey: key, baseUrl: geminiBaseUrl });
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
