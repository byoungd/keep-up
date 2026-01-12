/**
 * Research API Route
 *
 * Handles RAG-based research queries for "Ask KU0" feature.
 * Answers questions ONLY using the context of imported items.
 *
 * Track 2: Intelligence & Logic (AI) - P1
 */

import type { Message } from "@keepup/ai-core";
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ResearchRequest {
  query: string;
  userId: string;
  docIds?: string[];
  model?: string;
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
// Mock Content Store (TODO: Replace with real implementation)
// ─────────────────────────────────────────────────────────────────────────────

interface StoredContent {
  id: string;
  title: string;
  content: string;
  source: string;
}

/**
 * Get content items for RAG context.
 * TODO: Replace with real database query to IndexedDB/SQLite.
 */
async function getContentForQuery(_userId: string, _docIds?: string[]): Promise<StoredContent[]> {
  return [];
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
      maxTokens: 1024,
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

// ─────────────────────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const startTime = Date.now();

  try {
    const body = (await req.json()) as ResearchRequest;

    // Validate request
    if (!body.query?.trim()) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "query is required" } },
        { status: 400 }
      );
    }

    if (!body.userId?.trim()) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "userId is required" } },
        { status: 400 }
      );
    }

    // Get content for RAG
    const contentItems = await getContentForQuery(body.userId, body.docIds);

    // Handle empty content case
    if (contentItems.length === 0) {
      return NextResponse.json({
        answer:
          "I couldn't find any imported content to search. Please add some content to your library first, then ask me questions about it.",
        citations: [],
        processingTimeMs: Date.now() - startTime,
      } satisfies ResearchResponse);
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
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Research API] Error:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "An error occurred",
        },
      },
      { status: 500 }
    );
  }
}
