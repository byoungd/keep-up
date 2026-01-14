export interface DigestMapPromptInput {
  itemId: string;
  title: string;
  sourceText: string;
  sourceName?: string;
}

export interface DigestReducePromptInput {
  clusterId: string;
  summaries: Array<{
    itemId: string;
    title: string;
    summary: string;
    topics: string[];
    citations: Array<{ itemId: string; evidence: string }>;
  }>;
}

export interface VerifierPromptInput {
  claim: string;
  sources: Array<{ id: string; title?: string; content: string }>;
}

const JSON_ONLY_NOTICE = "Return JSON only. Do not include markdown, commentary, or extra keys.";

export function buildDigestMapPrompt(input: DigestMapPromptInput): string {
  const sourceName = input.sourceName ?? "Unknown";
  return [
    "Summarize the source text into a grounded, factual summary with citations.",
    "Output JSON with this exact schema:",
    `{"summary":"...","claims":["..."],"topics":["..."],"citations":[{"itemId":"${input.itemId}","evidence":"..."}]}`,
    "Rules:",
    "- Each claim must be supported by an evidence snippet copied from the source.",
    "- Citations must reference the provided itemId.",
    "- Claims should be short, factual sentences (max 3).",
    `- ${JSON_ONLY_NOTICE}`,
    "",
    `Item ID: ${input.itemId}`,
    `Title: ${input.title}`,
    `Source: ${sourceName}`,
    "Source Text:",
    "<<<",
    input.sourceText,
    ">>>",
  ].join("\n");
}

export function buildDigestReducePrompt(input: DigestReducePromptInput): string {
  const summaries = input.summaries
    .map((summary, index) => {
      const citations = summary.citations
        .map((citation) => `- [${citation.itemId}] ${citation.evidence}`)
        .join("\n");
      return [
        `Summary ${index + 1} (Item ${summary.itemId})`,
        `Title: ${summary.title}`,
        `Summary: ${summary.summary}`,
        `Topics: ${summary.topics.join(", ") || "None"}`,
        "Citations:",
        citations || "- None",
      ].join("\n");
    })
    .join("\n\n");

  return [
    "Synthesize the summaries into a single DigestCard focused on shared insights.",
    "Output JSON with this exact schema:",
    `{"title":"...","summary":"...","whyItMatters":["..."],"topics":["..."],"sourceItemIds":["..."],"citations":[{"itemId":"...","evidence":"..."}]}`,
    "Rules:",
    "- Preserve key facts and avoid speculation.",
    "- Every claim in the summary must be supported by a citation.",
    "- sourceItemIds must include all itemIds used in the card.",
    `- ${JSON_ONLY_NOTICE}`,
    "",
    `Cluster ID: ${input.clusterId}`,
    "Source Summaries:",
    "<<<",
    summaries,
    ">>>",
  ].join("\n");
}

export function buildVerifierPrompt(input: VerifierPromptInput): string {
  const sources = input.sources
    .map((source) => {
      return [
        `[SOURCE ${source.id}]`,
        source.title ? `Title: ${source.title}` : "Title: Unknown",
        "Content:",
        source.content,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "Verify the claim against the provided sources.",
    "Output JSON with this exact schema:",
    '{"verified":true,"evidence":"...","sourceItemId":"..."}',
    "Rules:",
    "- verified is true only if the claim is explicitly supported by a source.",
    "- evidence must be a verbatim snippet from the best matching source.",
    "- sourceItemId must match the source label that contains the evidence.",
    `- ${JSON_ONLY_NOTICE}`,
    "",
    `Claim: ${input.claim}`,
    "Sources:",
    "<<<",
    sources,
    ">>>",
  ].join("\n");
}
