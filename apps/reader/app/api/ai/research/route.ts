/**
 * Research API Route
 *
 * Handles RAG-based research queries for "Ask KU0" feature.
 * Answers questions ONLY using the context of imported items.
 *
 * Track 2: Intelligence & Logic (AI) - P1
 */

import type { Message } from "@keepup/ai-core";
import { DEFAULT_POLICY_MANIFEST, normalizeRequestIdentifiers } from "@keepup/core";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { toModelMessages } from "../messageUtils";
import { getDefaultResearchModelId } from "../modelResolver";
import {
  createAnthropicClient,
  createGoogleClient,
  createOpenAIProvider,
} from "../providerClients";
import { type ProviderTarget, resolveProviderTarget } from "../providerResolver";

export const runtime = "nodejs";

const IDEMPOTENCY_WINDOW_MS = 60_000;
const RESEARCH_CACHE_KEY = "__research_cache";

type ResearchCache = Map<
  string,
  { body: string; storedAt: number; headers: Record<string, string> }
>;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Content item from client-side DB for RAG context */
interface ContentItemInput {
  id: string;
  title: string;
  content: string;
  sourceUrl?: string;
  sourceName?: string;
}

interface ResearchRequest {
  query: string;
  userId: string;
  docIds?: string[];
  model?: string;
  request_id?: string;
  client_request_id?: string;
  policy_context?: { policy_id?: string; redaction_profile?: string; data_access_profile?: string };
  agent_id?: string;
  intent_id?: string;
  /** Content items from client-side DB (primary data source) */
  contentItems?: ContentItemInput[];
}

interface Citation {
  index: number;
  docId: string;
  title?: string;
  excerpt: string;
  location?: {
    section?: string;
  };
  confidence: number;
}

interface ResearchResponse {
  answer: string;
  citations: Citation[];
  processingTimeMs: number;
  request_id?: string;
  agent_id?: string;
  intent_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const RAG_SYSTEM_PROMPT = `You are KU0, an AI research assistant for the Keep Up app.
Your role is to answer questions based ONLY on the provided context from the user's imported content.

STRICT RULES:
1. Only use information from the provided context. Do NOT use external knowledge.
2. Always cite your sources using [1], [2], etc. format.
3. If the context doesn't contain enough information, say "I couldn't find relevant information in your imported content."
4. Be concise but thorough. Focus on accuracy over speculation.
5. If asked about something not in the context, politely explain you can only answer based on imported content.

Format your response clearly with inline citations.`;

// ─────────────────────────────────────────────────────────────────────────────
// Content Processing
// ─────────────────────────────────────────────────────────────────────────────

interface StoredContent {
  id: string;
  title: string;
  content: string;
  source: string;
}

/**
 * Transform client-provided content items to internal format.
 * Content is provided by the client from their local DB (IndexedDB/SQLite).
 */
function transformContentItems(items: ContentItemInput[]): StoredContent[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    source: item.sourceName ?? item.sourceUrl ?? "Imported content",
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build context string from content items with citation markers.
 */
function buildContext(items: StoredContent[]): { context: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const contextParts: string[] = [];

  for (const [index, item] of items.entries()) {
    const citationIndex = index + 1;

    citations.push({
      index: citationIndex,
      docId: item.id,
      title: item.title,
      excerpt: item.content.slice(0, 200) + (item.content.length > 200 ? "..." : ""),
      location: { section: item.source },
      confidence: 0.9, // Placeholder confidence
    });

    contextParts.push(`[Source ${citationIndex}] ${item.title}\n${item.content}\n`);
  }

  return {
    context: contextParts.join("\n---\n"),
    citations,
  };
}

/**
 * Generate answer using LLM with RAG context.
 */
function buildResearchMessages(query: string, context: string): Message[] {
  return [
    { role: "system", content: RAG_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context from imported content:\n\n${context}\n\n---\n\nQuestion: ${query}`,
    },
  ];
}

async function completeWithProvider(target: ProviderTarget, messages: Message[]): Promise<string> {
  if (target.config.kind === "anthropic") {
    const provider = createAnthropicClient(target.config);
    const completion = await provider.complete({
      messages,
      model: target.modelId,
      maxTokens: 1024,
    });
    return completion.content;
  }

  const modelMessages = toModelMessages(messages);

  if (target.config.kind === "gemini") {
    const google = createGoogleClient(target.config);
    const result = await generateText({
      model: google(target.modelId),
      messages: modelMessages,
      maxOutputTokens: 1024,
    });
    return result.text;
  }

  const openai = createOpenAIProvider(target.config);
  const completion = await openai.complete({
    messages,
    model: target.modelId,
    maxTokens: 1024,
  });
  return completion.content;
}

async function generateAnswer(
  query: string,
  context: string,
  requestedModel?: string | null
): Promise<string> {
  const resolved = resolveProviderTarget({
    requestedModel,
    defaultModelId: getDefaultResearchModelId(),
  });

  if (resolved.error) {
    throw new Error(resolved.error.message);
  }

  if (!resolved.target) {
    throw new Error("No AI provider configured");
  }

  const messages = buildResearchMessages(query, context);
  return completeWithProvider(resolved.target, messages);
}

const getResearchCache = (): ResearchCache => {
  const globalCache = globalThis as unknown as {
    [RESEARCH_CACHE_KEY]?: ResearchCache;
  };
  if (!globalCache[RESEARCH_CACHE_KEY]) {
    globalCache[RESEARCH_CACHE_KEY] = new Map();
  }
  return globalCache[RESEARCH_CACHE_KEY] as ResearchCache;
};

const buildResponseHeaders = (
  requestId: string,
  policyContext: ResearchRequest["policy_context"],
  agentId?: string,
  intentId?: string
): Record<string, string> => ({
  "Content-Type": "application/json",
  "x-request-id": requestId,
  ...(policyContext?.policy_id ? { "x-policy-id": policyContext.policy_id } : {}),
  ...(agentId ? { "x-agent-id": agentId } : {}),
  ...(intentId ? { "x-intent-id": intentId } : {}),
});

const createCachedResponse = (
  cache: ResearchCache,
  requestId: string,
  responseBody: ResearchResponse,
  headers: Record<string, string>
): Response => {
  const serialized = JSON.stringify(responseBody);
  cache.set(requestId, { body: serialized, storedAt: Date.now(), headers });
  return new Response(serialized, { status: 200, headers });
};

const getCachedResponse = (cache: ResearchCache, requestId: string): Response | null => {
  const cached = cache.get(requestId);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.storedAt > IDEMPOTENCY_WINDOW_MS) {
    cache.delete(requestId);
    return null;
  }
  return new Response(cached.body, { status: 200, headers: cached.headers });
};

const validateResearchRequest = (
  body: ResearchRequest,
  requestId: string,
  policyContext: ResearchRequest["policy_context"]
): Response | null => {
  if (policyContext?.policy_id !== DEFAULT_POLICY_MANIFEST.policy_id) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "policy_context.policy_id is not supported",
          request_id: requestId,
        },
      },
      { status: 400, headers: { "x-request-id": requestId } }
    );
  }

  if (!body.query?.trim()) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "query is required", request_id: requestId } },
      { status: 400 }
    );
  }

  if (!body.userId?.trim()) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "userId is required", request_id: requestId } },
      { status: 400 }
    );
  }

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const startTime = Date.now();
  const cache = getResearchCache();

  try {
    const body = (await req.json()) as ResearchRequest;
    const { request_id: requestId } = normalizeRequestIdentifiers({
      request_id: body.request_id,
      client_request_id: body.client_request_id,
    });
    const policyContext = body.policy_context ?? { policy_id: DEFAULT_POLICY_MANIFEST.policy_id };
    const agentId = body.agent_id;
    const intentId = body.intent_id;

    const validationError = validateResearchRequest(body, requestId, policyContext);
    if (validationError) {
      return validationError;
    }

    const cachedResponse = getCachedResponse(cache, requestId);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Transform client-provided content items for RAG
    // Content is provided by the client from their local DB (IndexedDB/SQLite)
    const contentItems = body.contentItems ? transformContentItems(body.contentItems) : [];

    // Handle empty content case
    if (contentItems.length === 0) {
      const responseBody: ResearchResponse = {
        answer:
          "I couldn't find any imported content to search. Please add some content to your library first, then ask me questions about it.",
        citations: [],
        processingTimeMs: Date.now() - startTime,
        request_id: requestId,
        agent_id: agentId,
        intent_id: intentId,
      };
      const headers = buildResponseHeaders(requestId, policyContext, agentId, intentId);
      return createCachedResponse(cache, requestId, responseBody, headers);
    }

    // Build context with citations
    const { context, citations } = buildContext(contentItems);

    // Generate answer
    const answer = await generateAnswer(body.query, context, body.model);

    // Extract which citations were actually used in the answer
    const usedCitations = citations.filter(
      (c) => answer.includes(`[${c.index}]`) || answer.includes(`[Source ${c.index}]`)
    );

    const response: ResearchResponse = {
      answer,
      citations: usedCitations.length > 0 ? usedCitations : citations.slice(0, 3),
      processingTimeMs: Date.now() - startTime,
      request_id: requestId,
      agent_id: agentId,
      intent_id: intentId,
    };

    const headers = buildResponseHeaders(requestId, policyContext, agentId, intentId);
    return createCachedResponse(cache, requestId, response, headers);
  } catch (error) {
    console.error("[Research API] Error:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "An error occurred",
          request_id: crypto.randomUUID(),
        },
      },
      { status: 500 }
    );
  }
}
