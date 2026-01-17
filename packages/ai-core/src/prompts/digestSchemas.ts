/**
 * Digest Schemas
 *
 * Zod schemas for structured LLM outputs in digest operations.
 * Use with Vercel AI SDK's `generateObject` for type-safe extraction.
 *
 * @module prompts/digestSchemas
 */

import { z } from "zod";

// ============================================================================
// Citation Schema (shared)
// ============================================================================

export const CitationSchema = z.object({
  itemId: z.string().describe("ID of the source item"),
  evidence: z.string().describe("Verbatim evidence snippet from the source"),
});

export type Citation = z.infer<typeof CitationSchema>;

// ============================================================================
// Digest Map Output
// ============================================================================

export const DigestMapOutputSchema = z.object({
  summary: z.string().describe("Grounded, factual summary of the source"),
  claims: z.array(z.string()).max(3).describe("Short, factual claim sentences (max 3)"),
  topics: z.array(z.string()).describe("Key topics mentioned"),
  citations: z.array(CitationSchema).describe("Citations with evidence supporting each claim"),
});

export type DigestMapOutput = z.infer<typeof DigestMapOutputSchema>;

// ============================================================================
// Digest Reduce Output
// ============================================================================

export const DigestReduceOutputSchema = z.object({
  title: z.string().describe("Title for the synthesized digest card"),
  summary: z.string().describe("Combined summary of shared insights"),
  whyItMatters: z.array(z.string()).describe("Key reasons why this information matters"),
  topics: z.array(z.string()).describe("Consolidated topics"),
  sourceItemIds: z.array(z.string()).describe("All source item IDs used in this card"),
  citations: z.array(CitationSchema).describe("Citations supporting claims in the summary"),
});

export type DigestReduceOutput = z.infer<typeof DigestReduceOutputSchema>;

// ============================================================================
// Verifier Output
// ============================================================================

export const VerifierOutputSchema = z.object({
  verified: z.boolean().describe("True only if the claim is explicitly supported by a source"),
  evidence: z.string().describe("Verbatim snippet from the matching source"),
  sourceItemId: z.string().describe("ID of the source containing the evidence"),
});

export type VerifierOutput = z.infer<typeof VerifierOutputSchema>;

// ============================================================================
// Prompt Templates (for use with generateObject)
// ============================================================================

export interface DigestMapInput {
  itemId: string;
  title: string;
  sourceText: string;
  sourceName?: string;
}

export interface DigestReduceInput {
  clusterId: string;
  summaries: Array<{
    itemId: string;
    title: string;
    summary: string;
    topics: string[];
    citations: Citation[];
  }>;
}

export interface VerifierInput {
  claim: string;
  sources: Array<{ id: string; title?: string; content: string }>;
}

/**
 * Build prompt for digest map operation.
 * Use with generateObject and DigestMapOutputSchema.
 */
export function buildDigestMapSystemPrompt(): string {
  return "You are a summarization expert. Extract grounded, factual summaries with citations from source texts. Each claim must be supported by verbatim evidence.";
}

export function buildDigestMapUserPrompt(input: DigestMapInput): string {
  return [
    `Summarize the following source text.`,
    ``,
    `Item ID: ${input.itemId}`,
    `Title: ${input.title}`,
    `Source: ${input.sourceName ?? "Unknown"}`,
    ``,
    `Source Text:`,
    input.sourceText,
  ].join("\n");
}

/**
 * Build prompt for digest reduce operation.
 * Use with generateObject and DigestReduceOutputSchema.
 */
export function buildDigestReduceSystemPrompt(): string {
  return "You are a synthesis expert. Combine multiple summaries into a cohesive digest card, preserving key facts and avoiding speculation. Every claim must be grounded in citations.";
}

export function buildDigestReduceUserPrompt(input: DigestReduceInput): string {
  const summariesText = input.summaries
    .map((s, i) => {
      const citationsText = s.citations.map((c) => `  - [${c.itemId}] ${c.evidence}`).join("\n");
      return [
        `Summary ${i + 1} (Item ${s.itemId})`,
        `Title: ${s.title}`,
        `Summary: ${s.summary}`,
        `Topics: ${s.topics.join(", ") || "None"}`,
        `Citations:`,
        citationsText || "  - None",
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Synthesize these summaries into a single digest card.`,
    ``,
    `Cluster ID: ${input.clusterId}`,
    ``,
    summariesText,
  ].join("\n");
}

/**
 * Build prompt for claim verification.
 * Use with generateObject and VerifierOutputSchema.
 */
export function buildVerifierSystemPrompt(): string {
  return "You are a fact-checker. Verify claims against provided sources. Only mark as verified if the claim is explicitly supported by verbatim evidence.";
}

export function buildVerifierUserPrompt(input: VerifierInput): string {
  const sourcesText = input.sources
    .map((s) => {
      return [
        `[SOURCE ${s.id}]`,
        s.title ? `Title: ${s.title}` : "Title: Unknown",
        `Content: ${s.content}`,
      ].join("\n");
    })
    .join("\n\n");

  return [`Verify this claim: "${input.claim}"`, ``, `Sources:`, sourcesText].join("\n");
}
