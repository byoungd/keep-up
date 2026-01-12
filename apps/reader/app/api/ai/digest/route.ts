/**
 * Digest API Route
 *
 * Handles daily digest generation and retrieval.
 * Connects the DigestView UI to AI-powered digest generation.
 *
 * Track 2: Intelligence & Logic (AI) - P1
 */

import { type Message, type ProviderKind, normalizeMessages } from "@keepup/ai-core";
import { NextResponse } from "next/server";
import { completeWithProvider } from "../llmGateway";
import { getDefaultChatModelId } from "../modelResolver";
import { type ProviderTarget, resolveProviderTarget } from "../providerResolver";

export const runtime = "edge";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ContentItemInput {
  id: string;
  title: string;
  content: string;
  snippet?: string;
  sourceUrl?: string;
  sourceName?: string;
  topics?: string[];
  publishedAt?: string;
}

/** Provider configuration passed from client */
interface ProviderConfig {
  /** Provider ID */
  providerId: ProviderKind | "custom";
  /** API key */
  apiKey: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Model ID to use */
  model: string;
}

interface DigestRequest {
  userId: string;
  date?: string;
  regenerate?: boolean;
  model?: string;
  /** Content items to synthesize (from client-side DB) */
  contentItems?: ContentItemInput[];
  /** Maximum number of cards to generate */
  maxCards?: number;
  /** Provider configuration from client */
  provider?: ProviderConfig;
}

interface UICitation {
  id: string;
  url: string;
  title: string;
  sourceName: string;
}

interface UIDigestCard {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string[];
  citations: UICitation[];
  relatedTopics: string[];
  confidence: "high" | "medium" | "low";
}

interface DigestResponse {
  id: string;
  date: string;
  title: string;
  status: "pending" | "generating" | "ready" | "failed";
  cards: UIDigestCard[];
  sourceItemCount: number;
  generatedAt?: number;
  processingTimeMs?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Integration
// ─────────────────────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert content curator creating a daily digest for a busy professional.

Your task is to synthesize multiple content items into concise, insightful digest cards.

For each card, provide:
1. A clear, engaging headline (not just copying the source title)
2. A 2-3 sentence summary capturing the key insight
3. 1-2 "Why It Matters" points explaining the significance
4. Related topics for categorization

Output JSON array of cards with this structure:
{
  "cards": [
    {
      "title": "Engaging headline",
      "summary": "Concise summary of the key insight...",
      "whyItMatters": ["First significance point", "Second point if relevant"],
      "relatedTopics": ["Topic1", "Topic2"],
      "sourceIndices": [0, 2]  // indices of source items used
    }
  ]
}

Rules:
- Combine related items into single cards when appropriate
- Prioritize actionable insights over general news
- Be specific and avoid vague language
- Each card should stand alone as valuable content`;

interface LLMCard {
  title: string;
  summary: string;
  whyItMatters: string[];
  relatedTopics: string[];
  sourceIndices: number[];
}

interface LLMResponse {
  cards: LLMCard[];
}

function buildDigestMessages(userPrompt: string): Message[] {
  return normalizeMessages([
    { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ]);
}

async function generateCardsWithLLM(
  items: ContentItemInput[],
  maxCards: number,
  provider: ProviderConfig
): Promise<LLMCard[]> {
  const itemsContext = items
    .slice(0, 20) // Limit context size
    .map((item, index) => {
      return `[${index}] ${item.title}\n${item.snippet || item.content.slice(0, 300)}...\nSource: ${item.sourceName || "Unknown"}\nTopics: ${item.topics?.join(", ") || "General"}`;
    })
    .join("\n\n---\n\n");

  const userPrompt = `Create up to ${maxCards} digest cards from these ${items.length} content items:\n\n${itemsContext}`;

  const content =
    provider.providerId === "claude"
      ? await callAnthropicAPI(provider, userPrompt)
      : await callOpenAICompatibleAPI(provider, userPrompt);

  const parsed: LLMResponse = JSON.parse(content);
  return parsed.cards || [];
}

async function generateCardsWithProviderTarget(
  items: ContentItemInput[],
  maxCards: number,
  target: ProviderTarget
): Promise<LLMCard[]> {
  const itemsContext = items
    .slice(0, 20)
    .map((item, index) => {
      return `[${index}] ${item.title}\n${item.snippet || item.content.slice(0, 300)}...\nSource: ${item.sourceName || "Unknown"}\nTopics: ${item.topics?.join(", ") || "General"}`;
    })
    .join("\n\n---\n\n");

  const userPrompt = `Create up to ${maxCards} digest cards from these ${items.length} content items:\n\n${itemsContext}`;
  const messages = buildDigestMessages(userPrompt);

  const completion = await completeWithProvider(target, messages);
  const parsed = JSON.parse(completion || "{}");
  return parsed.cards || [];
}

/**
 * Call OpenAI-compatible API (OpenAI, DeepSeek, Moonshot, Custom)
 */
async function callOpenAICompatibleAPI(
  provider: ProviderConfig,
  userPrompt: string
): Promise<string> {
  const endpoint = `${provider.baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${provider.providerId} API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in LLM response");
  }

  return content;
}

/**
 * Call Anthropic API (Claude models)
 */
async function callAnthropicAPI(provider: ProviderConfig, userPrompt: string): Promise<string> {
  const endpoint = `${provider.baseUrl}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 2000,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error("No content in Anthropic response");
  }

  return content;
}

/**
 * Convert LLM cards to UI format with citations
 */
function convertToUICards(
  llmCards: LLMCard[],
  sourceItems: ContentItemInput[],
  digestId: string
): UIDigestCard[] {
  return llmCards.map((card, index) => {
    // Build citations from source indices
    const citations: UICitation[] = card.sourceIndices
      .filter((idx) => idx >= 0 && idx < sourceItems.length)
      .map((idx) => {
        const item = sourceItems[idx];
        return {
          id: `${digestId}-cite-${index}-${idx}`,
          url: item.sourceUrl || "",
          title: item.title,
          sourceName: item.sourceName || "Source",
        };
      });

    // Determine confidence based on citation count
    const confidence: "high" | "medium" | "low" =
      citations.length >= 2 ? "high" : citations.length === 1 ? "medium" : "low";

    return {
      id: `${digestId}-card-${index}`,
      title: card.title,
      summary: card.summary,
      whyItMatters: card.whyItMatters,
      citations,
      relatedTopics: card.relatedTopics,
      confidence,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback (No API Key)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate basic cards without LLM when no API key is available
 */
function generateFallbackCards(
  items: ContentItemInput[],
  maxCards: number,
  digestId: string
): UIDigestCard[] {
  return items.slice(0, maxCards).map((item, index) => ({
    id: `${digestId}-card-${index}`,
    title: item.title,
    summary: item.snippet || `${item.content.slice(0, 200)}...`,
    whyItMatters: [],
    citations: item.sourceUrl
      ? [
          {
            id: `${digestId}-cite-${index}`,
            url: item.sourceUrl,
            title: item.title,
            sourceName: item.sourceName || "Source",
          },
        ]
      : [],
    relatedTopics: item.topics || [],
    confidence: "low" as const,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/ai/digest?userId=xxx&date=YYYY-MM-DD
 * Retrieve an existing digest for a user and date.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

  if (!userId) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "userId is required" } },
      { status: 400 }
    );
  }

  // Return empty digest - client should POST with content items to generate
  const digestId = `digest-${userId}-${date}`;
  const response: DigestResponse = {
    id: digestId,
    date,
    title: `Your Daily Digest - ${new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
    status: "pending",
    cards: [],
    sourceItemCount: 0,
  };

  return NextResponse.json(response);
}

/**
 * POST /api/ai/digest
 * Generate a new digest from provided content items.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: digest flow includes validation, routing, summarization, and formatting
export async function POST(req: Request): Promise<Response> {
  const startTime = Date.now();

  try {
    const body = (await req.json()) as DigestRequest;

    if (!body.userId?.trim()) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "userId is required" } },
        { status: 400 }
      );
    }

    const date = body.date || new Date().toISOString().split("T")[0];
    const digestId = `digest-${body.userId}-${date}`;
    const maxCards = body.maxCards || 5;
    const contentItems = body.contentItems || [];

    // If no content items, return empty digest
    if (contentItems.length === 0) {
      return NextResponse.json({
        id: digestId,
        date,
        title: `Your Daily Digest - ${new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
        status: "ready",
        cards: [],
        sourceItemCount: 0,
        generatedAt: Date.now(),
        processingTimeMs: Date.now() - startTime,
      } satisfies DigestResponse);
    }

    // Get provider config from request or fall back to env
    const provider = body.provider;
    let cards: UIDigestCard[];

    if (provider?.apiKey) {
      try {
        const llmCards = await generateCardsWithLLM(contentItems, maxCards, provider);
        cards = convertToUICards(llmCards, contentItems, digestId);
      } catch (llmError) {
        console.error("[Digest API] LLM generation failed, using fallback:", llmError);
        cards = generateFallbackCards(contentItems, maxCards, digestId);
      }
    } else {
      const resolved = resolveProviderTarget({
        requestedModel: body.model ?? null,
        defaultModelId: getDefaultChatModelId(),
      });

      if (resolved.error || !resolved.target) {
        console.warn(
          "[Digest API] No provider configured, using fallback generation",
          resolved.error
        );
        cards = generateFallbackCards(contentItems, maxCards, digestId);
      } else {
        try {
          const llmCards = await generateCardsWithProviderTarget(
            contentItems,
            maxCards,
            resolved.target
          );
          cards = convertToUICards(llmCards, contentItems, digestId);
        } catch (llmError) {
          console.error("[Digest API] LLM generation failed, using fallback:", llmError);
          cards = generateFallbackCards(contentItems, maxCards, digestId);
        }
      }
    }

    const response: DigestResponse = {
      id: digestId,
      date,
      title: `Your Daily Digest - ${new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
      status: "ready",
      cards,
      sourceItemCount: contentItems.length,
      generatedAt: Date.now(),
      processingTimeMs: Date.now() - startTime,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Digest API] Error:", error);

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
