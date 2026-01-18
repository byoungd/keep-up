import type { TokenUsageStats } from "@ku0/agent-runtime";
import { isRecord } from "@ku0/shared";
import { Hono } from "hono";
import { jsonError } from "../http";
import type { ChatMessageStoreLike, SessionStoreLike, TaskStoreLike } from "../storage/contracts";
import { calculateUsageCostUsd, normalizeTokenUsage } from "../utils/tokenUsage";

interface CostRoutesDeps {
  sessionStore: SessionStoreLike;
  chatMessageStore: ChatMessageStoreLike;
  taskStore: TaskStoreLike;
}

export function createCostRoutes(deps: CostRoutesDeps) {
  const app = new Hono();

  app.get("/sessions/:id/cost", async (c) => {
    const id = c.req.param("id");

    const session = await deps.sessionStore.getById(id);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const [messages, tasks] = await Promise.all([
      deps.chatMessageStore.getBySession(id),
      deps.taskStore.getBySession(id),
    ]);

    const usageEntries: UsageEntry[] = [];
    let messageCount = 0;
    let taskCount = 0;

    for (const message of messages) {
      const entry = buildUsageEntry(message.metadata, {
        modelId: message.modelId,
        providerId: message.providerId,
      });
      if (!entry) {
        continue;
      }
      usageEntries.push(entry);
      messageCount += 1;
    }

    for (const task of tasks) {
      const entry = buildUsageEntry(task.metadata, {
        modelId: task.modelId,
        providerId: task.providerId,
      });
      if (!entry) {
        continue;
      }
      usageEntries.push(entry);
      taskCount += 1;
    }

    const { totals, byModel, byProvider, hasUnknownCost, knownCostUsd } =
      aggregateUsage(usageEntries);

    return c.json({
      ok: true,
      cost: {
        sessionId: id,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        totalTokens: totals.totalTokens,
        totalCostUsd: hasUnknownCost ? null : knownCostUsd,
        knownCostUsd,
        hasUnknownCost,
        usageCount: usageEntries.length,
        messageCount,
        taskCount,
        byModel,
        byProvider,
        currency: "USD",
        summary: `Aggregated ${usageEntries.length} usage entries.`,
      },
    });
  });

  return app;
}

type UsageEntry = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  modelId?: string;
  providerId?: string;
  contextWindow?: number;
  utilization?: number;
};

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsageBucket = UsageTotals & {
  costUsd: number;
  usageCount: number;
  unknownCostCount: number;
  providerId?: string;
};

function buildUsageEntry(
  metadata: Record<string, unknown> | undefined,
  defaults: { modelId?: string; providerId?: string }
): UsageEntry | null {
  if (!metadata || !isRecord(metadata.usage)) {
    return null;
  }
  const usageRecord = metadata.usage;
  const usage = parseUsage(usageRecord);
  if (!usage) {
    return null;
  }
  const modelId = typeof usageRecord.modelId === "string" ? usageRecord.modelId : defaults.modelId;
  const providerId =
    typeof usageRecord.providerId === "string" ? usageRecord.providerId : defaults.providerId;

  const normalized = normalizeTokenUsage(usage, modelId);
  const costUsd =
    typeof usageRecord.costUsd === "number"
      ? usageRecord.costUsd
      : usageRecord.costUsd === null
        ? null
        : calculateUsageCostUsd(normalized, modelId);

  return {
    ...normalized,
    costUsd,
    modelId,
    providerId,
  };
}

function parseUsage(raw: unknown): TokenUsageStats | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (
    typeof raw.inputTokens !== "number" ||
    typeof raw.outputTokens !== "number" ||
    typeof raw.totalTokens !== "number"
  ) {
    return null;
  }
  return {
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    totalTokens: raw.totalTokens,
    ...(typeof raw.contextWindow === "number" ? { contextWindow: raw.contextWindow } : {}),
    ...(typeof raw.utilization === "number" ? { utilization: raw.utilization } : {}),
  };
}

function aggregateUsage(entries: UsageEntry[]) {
  const totals: UsageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const byModel: Record<string, UsageBucket> = {};
  const byProvider: Record<string, UsageBucket> = {};
  let knownCostUsd = 0;
  let hasUnknownCost = false;

  for (const entry of entries) {
    totals.inputTokens += entry.inputTokens;
    totals.outputTokens += entry.outputTokens;
    totals.totalTokens += entry.totalTokens;
    if (entry.costUsd === null) {
      hasUnknownCost = true;
    } else {
      knownCostUsd += entry.costUsd;
    }

    const modelKey = entry.modelId ?? "unknown";
    const providerKey = entry.providerId ?? "unknown";

    accumulateBucket(byModel, modelKey, entry, entry.providerId);
    accumulateBucket(byProvider, providerKey, entry, entry.providerId);
  }

  return { totals, byModel, byProvider, knownCostUsd, hasUnknownCost };
}

function accumulateBucket(
  buckets: Record<string, UsageBucket>,
  key: string,
  entry: UsageEntry,
  providerId?: string
) {
  const existing =
    buckets[key] ??
    ({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      usageCount: 0,
      unknownCostCount: 0,
      providerId,
    } satisfies UsageBucket);

  existing.inputTokens += entry.inputTokens;
  existing.outputTokens += entry.outputTokens;
  existing.totalTokens += entry.totalTokens;
  existing.usageCount += 1;
  existing.providerId = existing.providerId ?? providerId;

  if (entry.costUsd === null) {
    existing.unknownCostCount += 1;
  } else {
    existing.costUsd += entry.costUsd;
  }

  buckets[key] = existing;
}
