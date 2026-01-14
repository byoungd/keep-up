import { buildDigestMapPrompt, buildDigestReducePrompt } from "@keepup/ai-core";
import type { IAgentManager } from "../agents/types";
import { VerifierAgent } from "../agents/verifier";
import type { MCPToolResult } from "../types";
import { parseJsonFromText } from "../utils/llmJson";
import { PipelineExecutor, createPipeline } from "./pipelineBuilder";
import type { Pipeline, PipelineContext } from "./pipelineBuilder";

export interface DigestSourceItem {
  id: string;
  title: string;
  content: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
}

export interface DigestCitation {
  itemId: string;
  evidence: string;
}

export interface DigestSummary {
  itemId: string;
  title: string;
  summary: string;
  claims: string[];
  topics: string[];
  citations: DigestCitation[];
}

export interface DigestCardDraft {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string[];
  topics: string[];
  citations: DigestCitation[];
  sourceItemIds: string[];
}

export interface DigestCard extends DigestCardDraft {
  verified: boolean;
  verification: Array<{
    claim: string;
    verified: boolean;
    evidence: string;
    sourceItemId?: string;
    reason?: string;
  }>;
}

export interface DigestMapFailure {
  itemId: string;
  reason: string;
}

export interface DigestReduceFailure {
  clusterId: string;
  reason: string;
}

export interface DigestSynthesisInput {
  items?: DigestSourceItem[];
  timeWindow?: string;
  limit?: number;
  includeRead?: boolean;
}

export interface DigestSynthesisOutput {
  cards: DigestCard[];
  rejectedCards: DigestCard[];
  summaries: DigestSummary[];
  rejectedSummaries: DigestMapFailure[];
  rejectedClusters: DigestReduceFailure[];
}

export interface DigestSynthesisConfig {
  maxSourceChars: number;
  strictCitations: boolean;
  maxClaimsPerCard: number;
}

export interface DigestSynthesisDependencies {
  agentManager: IAgentManager;
  verifier?: VerifierAgent;
  config?: Partial<DigestSynthesisConfig>;
}

const DEFAULT_CONFIG: DigestSynthesisConfig = {
  maxSourceChars: 4000,
  strictCitations: true,
  maxClaimsPerCard: 3,
};

interface DigestMapOutput {
  summaries: DigestSummary[];
  rejectedSummaries: DigestMapFailure[];
  items: DigestSourceItem[];
}

interface DigestReduceOutput {
  cards: DigestCardDraft[];
  summaries: DigestSummary[];
  rejectedSummaries: DigestMapFailure[];
  rejectedClusters: DigestReduceFailure[];
  items: DigestSourceItem[];
}

interface DigestCluster {
  id: string;
  summaries: DigestSummary[];
  topics: string[];
}

export function createDigestSynthesisPipeline(): Pipeline {
  return createPipeline("Digest Synthesis")
    .id("digest_synthesis")
    .description("Map-reduce digest synthesis with claim verification")
    .transform("Resolve items", resolveItems)
    .transform("Map summaries", mapSummaries)
    .transform("Reduce clusters", reduceClusters)
    .transform("Verify cards", verifyCards)
    .build();
}

export async function runDigestSynthesis(
  input: DigestSynthesisInput,
  dependencies: DigestSynthesisDependencies,
  context: {
    executeTool: PipelineContext["executeTool"];
    onProgress?: PipelineContext["onProgress"];
    signal?: AbortSignal;
  }
): Promise<DigestSynthesisOutput> {
  const pipeline = createDigestSynthesisPipeline();
  const executor = new PipelineExecutor(context.executeTool);
  const result = await executor.execute<DigestSynthesisInput, DigestSynthesisOutput>(
    pipeline,
    input,
    {
      metadata: {
        agentManager: dependencies.agentManager,
        verifier: dependencies.verifier,
        digestConfig: dependencies.config,
      },
      onProgress: context.onProgress,
      signal: context.signal,
    }
  );

  if (!result.success) {
    throw new Error(result.error?.message ?? "Digest synthesis failed");
  }

  return result.output;
}

async function resolveItems(
  input: DigestSynthesisInput,
  context: PipelineContext
): Promise<DigestSourceItem[]> {
  if (input.items && input.items.length > 0) {
    return input.items;
  }

  const limit = input.limit ?? 50;
  const timeWindow = input.timeWindow ?? "24h";
  const includeRead = input.includeRead ?? false;

  const toolResult = await context.executeTool("digest:fetchItems", {
    limit,
    timeWindow,
    includeRead,
  });

  return parseFetchedItems(toolResult);
}

async function mapSummaries(
  items: DigestSourceItem[],
  context: PipelineContext
): Promise<DigestMapOutput> {
  const { agentManager, config } = getDependencies(context);
  const { strictCitations, maxSourceChars } = config;

  const tasks = items.map((item) => {
    const sourceText = item.content.slice(0, maxSourceChars);
    const prompt = buildDigestMapPrompt({
      itemId: item.id,
      title: item.title,
      sourceText,
      sourceName: item.sourceName,
    });
    return {
      type: "digest" as const,
      task: `DigestMap ${item.id}\n${prompt}`,
    };
  });

  const results = await agentManager.spawnParallel(tasks);
  const summaries: DigestSummary[] = [];
  const rejectedSummaries: DigestMapFailure[] = [];

  for (const [index, result] of results.entries()) {
    const item = items[index];
    if (!item) {
      continue;
    }
    if (!result.success) {
      rejectedSummaries.push({
        itemId: item.id,
        reason: result.error ?? "Digest map agent failed",
      });
      continue;
    }

    try {
      const summary = parseMapSummary(result.output, item, config.maxClaimsPerCard);
      if (strictCitations && summary.citations.length === 0) {
        rejectedSummaries.push({
          itemId: item.id,
          reason: "No citations returned from map step",
        });
        continue;
      }
      summaries.push(summary);
    } catch (error) {
      rejectedSummaries.push({
        itemId: item.id,
        reason: error instanceof Error ? error.message : "Failed to parse map summary",
      });
    }
  }

  return { summaries, rejectedSummaries, items };
}

async function reduceClusters(
  input: DigestMapOutput,
  context: PipelineContext
): Promise<DigestReduceOutput> {
  const { agentManager, config } = getDependencies(context);
  const clusters = clusterSummaries(input.summaries);
  const tasks = clusters.map((cluster) => {
    const prompt = buildDigestReducePrompt({
      clusterId: cluster.id,
      summaries: cluster.summaries.map((summary) => ({
        itemId: summary.itemId,
        title: summary.title,
        summary: summary.summary,
        topics: summary.topics,
        citations: summary.citations,
      })),
    });
    return {
      type: "digest" as const,
      task: `DigestReduce ${cluster.id}\n${prompt}`,
    };
  });

  const results = await agentManager.spawnParallel(tasks);
  const cards: DigestCardDraft[] = [];
  const rejectedClusters: DigestReduceFailure[] = [];

  for (const [index, result] of results.entries()) {
    const cluster = clusters[index];
    if (!cluster) {
      continue;
    }
    if (!result.success) {
      rejectedClusters.push({
        clusterId: cluster.id,
        reason: result.error ?? "Digest reduce agent failed",
      });
      continue;
    }

    try {
      const draft = parseDigestCard(result.output, cluster);
      if (config.strictCitations && draft.citations.length === 0) {
        rejectedClusters.push({
          clusterId: cluster.id,
          reason: "No citations returned from reduce step",
        });
        continue;
      }
      cards.push(draft);
    } catch (error) {
      rejectedClusters.push({
        clusterId: cluster.id,
        reason: error instanceof Error ? error.message : "Failed to parse reduce output",
      });
    }
  }

  return {
    cards,
    summaries: input.summaries,
    rejectedSummaries: input.rejectedSummaries,
    rejectedClusters,
    items: input.items,
  };
}

async function verifyCards(
  input: DigestReduceOutput,
  context: PipelineContext
): Promise<DigestSynthesisOutput> {
  const { verifier, config } = getDependencies(context);
  const verifiedCards: DigestCard[] = [];
  const rejectedCards: DigestCard[] = [];

  for (const draft of input.cards) {
    const claims = extractClaims(draft.summary, config.maxClaimsPerCard);
    const sources = draft.sourceItemIds
      .map((id) => input.items.find((item) => item.id === id))
      .filter((item): item is DigestSourceItem => Boolean(item))
      .map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content.slice(0, config.maxSourceChars),
      }));

    if (sources.length === 0) {
      rejectedCards.push({
        ...draft,
        verified: false,
        verification: [
          {
            claim: "No sources available",
            verified: false,
            evidence: "",
            reason: "No sources available for verification",
          },
        ],
      });
      continue;
    }

    const verificationRequests = claims.map((claim) => ({
      claim,
      sources,
    }));

    const verification = await verifier.verifyClaims(verificationRequests);
    const verified = verification.every((result) => result.verified);
    const mergedCitations = mergeCitations(draft.citations, verification);

    const card: DigestCard = {
      ...draft,
      citations: mergedCitations,
      verified,
      verification,
    };

    if (verified && card.citations.length > 0) {
      verifiedCards.push(card);
    } else {
      rejectedCards.push(card);
    }
  }

  return {
    cards: verifiedCards,
    rejectedCards,
    summaries: input.summaries,
    rejectedSummaries: input.rejectedSummaries,
    rejectedClusters: input.rejectedClusters,
  };
}

function getDependencies(context: PipelineContext): {
  agentManager: IAgentManager;
  verifier: VerifierAgent;
  config: DigestSynthesisConfig;
} {
  const metadata = context.metadata ?? {};
  const agentManager = metadata.agentManager;
  if (!isAgentManager(agentManager)) {
    throw new Error("Digest synthesis requires agentManager in pipeline metadata");
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...(metadata.digestConfig as Partial<DigestSynthesisConfig>),
  };
  const verifier =
    metadata.verifier instanceof VerifierAgent
      ? metadata.verifier
      : new VerifierAgent(agentManager);

  return { agentManager, verifier, config };
}

function parseFetchedItems(result: unknown): DigestSourceItem[] {
  const toolResult = result as MCPToolResult;
  const content = toolResult.content?.[0];
  if (!content || content.type !== "text") {
    throw new Error("Digest fetch tool returned no text content");
  }

  const parsed = parseJsonFromText<unknown>(content.text);
  if (!Array.isArray(parsed)) {
    throw new Error("Digest fetch tool returned invalid JSON");
  }

  return parsed.map(parseFetchedItem).filter((item): item is DigestSourceItem => Boolean(item));
}

function parseFetchedItem(entry: unknown): DigestSourceItem | null {
  if (!isRecord(entry)) {
    return null;
  }

  const id = readString(entry.id, "");
  if (!id) {
    return null;
  }

  const title = readString(entry.title, "Untitled");
  const contentText = readString(entry.content, "") || readString(entry.snippet, "");
  if (!contentText) {
    return null;
  }

  const sourceName = readOptionalString(entry.source);
  const sourceUrl = readOptionalString(entry.url);
  const publishedAt = readOptionalString(entry.published);

  return {
    id,
    title,
    content: contentText,
    sourceName,
    sourceUrl,
    publishedAt,
  };
}

function parseMapSummary(output: string, item: DigestSourceItem, maxClaims: number): DigestSummary {
  const parsed = parseJsonFromText<unknown>(output);
  if (!isRecord(parsed)) {
    throw new Error("Map summary output was not an object");
  }

  const summary = readString(parsed.summary, "");
  const claims = readStringArray(parsed.claims);
  const topics = readStringArray(parsed.topics);
  const citations = readCitations(parsed.citations, item.id);

  if (!summary) {
    throw new Error("Map summary missing summary text");
  }

  return {
    itemId: item.id,
    title: item.title,
    summary,
    claims: claims.length > 0 ? claims : extractClaims(summary, maxClaims),
    topics,
    citations,
  };
}

function parseDigestCard(output: string, cluster: DigestCluster): DigestCardDraft {
  const parsed = parseJsonFromText<unknown>(output);
  if (!isRecord(parsed)) {
    throw new Error("Reduce output was not an object");
  }

  const title = readString(parsed.title, "Digest Summary");
  const summary = readString(parsed.summary, "");
  const whyItMatters = readStringArray(parsed.whyItMatters);
  const topics = readStringArray(parsed.topics);
  const fallbackSources = cluster.summaries.map((s) => s.itemId);
  const sourceItemIdsRaw = readStringArray(parsed.sourceItemIds, fallbackSources);
  const sourceItemIds = sourceItemIdsRaw.length > 0 ? sourceItemIdsRaw : fallbackSources;
  const citations = readCitations(parsed.citations, sourceItemIds[0] ?? "");

  if (!summary) {
    throw new Error("Digest card missing summary text");
  }

  return {
    id: cluster.id,
    title,
    summary,
    whyItMatters,
    topics,
    citations,
    sourceItemIds,
  };
}

function clusterSummaries(summaries: DigestSummary[]): DigestCluster[] {
  const clusters: DigestCluster[] = [];

  for (const summary of summaries) {
    const normalizedTopics = summary.topics.map(normalizeTopic).filter(Boolean);
    let matched = clusters.find((cluster) =>
      cluster.topics.some((topic) => normalizedTopics.includes(topic))
    );

    if (!matched) {
      matched = {
        id: `cluster-${clusters.length + 1}`,
        summaries: [],
        topics: normalizedTopics.length > 0 ? normalizedTopics : [normalizeTopic(summary.title)],
      };
      clusters.push(matched);
    }

    matched.summaries.push(summary);
  }

  return clusters;
}

function extractClaims(summary: string, maxClaims: number): string[] {
  const parts = summary
    .split(/[.!?]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, maxClaims);
}

function mergeCitations(
  citations: DigestCitation[],
  verification: DigestCard["verification"]
): DigestCitation[] {
  const merged = [...citations];

  for (const result of verification) {
    if (!result.verified || !result.evidence) {
      continue;
    }
    if (!result.sourceItemId) {
      continue;
    }
    const itemId = result.sourceItemId;
    if (
      !merged.some(
        (existing) => existing.itemId === itemId && existing.evidence === result.evidence
      )
    ) {
      merged.push({ itemId, evidence: result.evidence });
    }
  }

  return merged;
}

function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isAgentManager(value: unknown): value is IAgentManager {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IAgentManager).spawn === "function" &&
    typeof (value as IAgentManager).spawnParallel === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readCitations(value: unknown, fallbackItemId: string): DigestCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const itemId = typeof record.itemId === "string" ? record.itemId : fallbackItemId;
      const evidence = typeof record.evidence === "string" ? record.evidence : "";
      if (!evidence) {
        return null;
      }
      return { itemId, evidence };
    })
    .filter((citation): citation is DigestCitation => Boolean(citation));
}
