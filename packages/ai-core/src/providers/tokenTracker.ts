/**
 * Token Counter & Cost Tracker
 *
 * Tracks token usage and costs across AI providers.
 * Supports rate limiting and budget enforcement.
 */

import { getEncoding, type Tiktoken, type TiktokenEncoding } from "js-tiktoken";
import { getModelCapability, type ModelPricing } from "../catalog/models";
import type { TokenUsage } from "./types";

/** Usage record for a single request */
export interface UsageRecord {
  /** Unique request ID */
  requestId: string;
  /** User ID */
  userId: string;
  /** Model used */
  model: string;
  /** Provider name */
  provider: string;
  /** Token usage */
  usage: TokenUsage;
  /** Calculated cost in USD */
  costUsd: number;
  /** Request type */
  requestType: "completion" | "streaming" | "embedding";
  /** Timestamp */
  timestamp: number;
}

/** Usage summary for a time period */
export interface UsageSummary {
  /** Total requests */
  totalRequests: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Breakdown by model */
  byModel: Record<
    string,
    {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >;
  /** Breakdown by provider */
  byProvider: Record<
    string,
    {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >;
  /** Period start */
  periodStart: number;
  /** Period end */
  periodEnd: number;
}

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute?: number;
  /** Maximum tokens per minute */
  tokensPerMinute?: number;
  /** Maximum tokens per day */
  tokensPerDay?: number;
  /** Maximum cost per day in USD */
  costPerDayUsd?: number;
}

/** Rate limit state */
interface RateLimitState {
  /** Requests in current minute window */
  requestsInMinute: number;
  /** Tokens in current minute window */
  tokensInMinute: number;
  /** Tokens in current day */
  tokensInDay: number;
  /** Cost in current day */
  costInDay: number;
  /** Minute window start */
  minuteWindowStart: number;
  /** Day window start */
  dayWindowStart: number;
}

/**
 * Token Counter & Cost Tracker.
 */
export class TokenTracker {
  private readonly records: UsageRecord[] = [];
  private readonly maxRecords: number;
  private readonly rateLimits = new Map<string, RateLimitConfig>();
  private readonly rateLimitState = new Map<string, RateLimitState>();
  private readonly customPricing: Record<string, ModelPricing>;
  private readonly encodings = new Map<TiktokenEncoding, Tiktoken>();

  constructor(
    options: {
      maxRecords?: number;
      customPricing?: Record<string, ModelPricing>;
    } = {}
  ) {
    this.maxRecords = options.maxRecords ?? 10000;
    this.customPricing = options.customPricing ?? {};
  }

  /**
   * Count tokens in a string for a specific model using Tiktoken.
   */
  countTokens(text: string, model = "gpt-4o"): number {
    const encodingName = this.getEncodingNameForModel(model);
    let encoding = this.encodings.get(encodingName);

    if (!encoding) {
      encoding = getEncoding(encodingName);
      this.encodings.set(encodingName, encoding);
    }

    return encoding.encode(text).length;
  }

  private getEncodingNameForModel(model: string): TiktokenEncoding {
    // cl100k_base is used by GPT-3.5-Turbo, GPT-4, and GPT-4o
    if (
      model.includes("gpt-4") ||
      model.includes("gpt-3.5") ||
      model.includes("o1") ||
      model.includes("text-embedding-3")
    ) {
      return "cl100k_base";
    }
    // o200k_base is used by GPT-4o (some variants) but js-tiktoken might not have it yet
    // depending on version. cl100k_base is a safe fallback for modern OpenAI.
    return "cl100k_base";
  }

  /**
   * Record token usage for a request.
   */
  record(params: {
    requestId: string;
    userId: string;
    model: string;
    provider: string;
    usage: TokenUsage;
    requestType: "completion" | "streaming" | "embedding";
  }): UsageRecord {
    const costUsd = this.calculateCost(params.model, params.usage);
    const record: UsageRecord = {
      ...params,
      costUsd,
      timestamp: Date.now(),
    };

    this.records.push(record);

    // Trim old records if over limit
    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }

    // Update rate limit state
    this.updateRateLimitState(params.userId, params.usage, costUsd);

    return record;
  }

  /**
   * Calculate cost for token usage.
   */
  calculateCost(model: string, usage: TokenUsage): number {
    const pricing = this.customPricing[model] ?? getModelCapability(model)?.pricing;
    if (!pricing) {
      return 0;
    }

    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputTokensPer1M;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputTokensPer1M;

    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }

  /**
   * Get usage summary for a time period.
   */
  getSummary(
    options: { userId?: string; startTime?: number; endTime?: number } = {}
  ): UsageSummary {
    const now = Date.now();
    const startTime = options.startTime ?? now - 24 * 60 * 60 * 1000;
    const endTime = options.endTime ?? now;

    const filtered = this.records.filter((r) => {
      if (r.timestamp < startTime || r.timestamp > endTime) {
        return false;
      }
      if (options.userId && r.userId !== options.userId) {
        return false;
      }
      return true;
    });

    const summary: UsageSummary = {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      byModel: {},
      byProvider: {},
      periodStart: startTime,
      periodEnd: endTime,
    };

    for (const record of filtered) {
      summary.totalRequests++;
      summary.totalInputTokens += record.usage.inputTokens;
      summary.totalOutputTokens += record.usage.outputTokens;
      summary.totalCostUsd += record.costUsd;

      if (!summary.byModel[record.model]) {
        summary.byModel[record.model] = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
      }
      const modelStat = summary.byModel[record.model];
      modelStat.requests++;
      modelStat.inputTokens += record.usage.inputTokens;
      modelStat.outputTokens += record.usage.outputTokens;
      modelStat.costUsd += record.costUsd;

      if (!summary.byProvider[record.provider]) {
        summary.byProvider[record.provider] = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
      }
      const providerStat = summary.byProvider[record.provider];
      providerStat.requests++;
      providerStat.inputTokens += record.usage.inputTokens;
      providerStat.outputTokens += record.usage.outputTokens;
      providerStat.costUsd += record.costUsd;
    }

    summary.totalCostUsd = Math.round(summary.totalCostUsd * 1_000_000) / 1_000_000;

    return summary;
  }

  /**
   * Set rate limits for a user.
   */
  setRateLimit(userId: string, config: RateLimitConfig): void {
    this.rateLimits.set(userId, config);
  }

  /**
   * Check if a request would exceed rate limits.
   */
  checkRateLimit(
    userId: string,
    estimatedTokens = 0
  ): {
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
  } {
    const limits = this.rateLimits.get(userId);
    if (!limits) {
      return { allowed: true };
    }

    const state = this.getOrCreateRateLimitState(userId);
    const now = Date.now();

    if (now - state.minuteWindowStart > 60_000) {
      state.requestsInMinute = 0;
      state.tokensInMinute = 0;
      state.minuteWindowStart = now;
    }

    if (now - state.dayWindowStart > 24 * 60 * 60 * 1000) {
      state.tokensInDay = 0;
      state.costInDay = 0;
      state.dayWindowStart = now;
    }

    if (limits.requestsPerMinute && state.requestsInMinute >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: "Rate limit exceeded: too many requests per minute",
        retryAfterMs: 60_000 - (now - state.minuteWindowStart),
      };
    }

    if (limits.tokensPerMinute && state.tokensInMinute + estimatedTokens > limits.tokensPerMinute) {
      return {
        allowed: false,
        reason: "Rate limit exceeded: too many tokens per minute",
        retryAfterMs: 60_000 - (now - state.minuteWindowStart),
      };
    }

    if (limits.tokensPerDay && state.tokensInDay + estimatedTokens > limits.tokensPerDay) {
      return {
        allowed: false,
        reason: "Rate limit exceeded: daily token limit reached",
        retryAfterMs: 24 * 60 * 60 * 1000 - (now - state.dayWindowStart),
      };
    }

    if (limits.costPerDayUsd && state.costInDay >= limits.costPerDayUsd) {
      return {
        allowed: false,
        reason: "Rate limit exceeded: daily cost limit reached",
        retryAfterMs: 24 * 60 * 60 * 1000 - (now - state.dayWindowStart),
      };
    }

    return { allowed: true };
  }

  /**
   * Get pricing for a model.
   */
  getPricing(model: string): ModelPricing | undefined {
    return this.customPricing[model] ?? getModelCapability(model)?.pricing;
  }

  /**
   * Estimate cost for a request.
   */
  estimateCost(model: string, estimatedInputTokens: number, estimatedOutputTokens: number): number {
    return this.calculateCost(model, {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
    });
  }

  /**
   * Get all records.
   */
  getRecords(options: { userId?: string; limit?: number } = {}): UsageRecord[] {
    let filtered = this.records;

    if (options.userId) {
      filtered = filtered.filter((r) => r.userId === options.userId);
    }

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return [...filtered];
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records.length = 0;
    this.rateLimitState.clear();
  }

  private getOrCreateRateLimitState(userId: string): RateLimitState {
    let state = this.rateLimitState.get(userId);
    if (!state) {
      const now = Date.now();
      state = {
        requestsInMinute: 0,
        tokensInMinute: 0,
        tokensInDay: 0,
        costInDay: 0,
        minuteWindowStart: now,
        dayWindowStart: now,
      };
      this.rateLimitState.set(userId, state);
    }
    return state;
  }

  private updateRateLimitState(userId: string, usage: TokenUsage, costUsd: number): void {
    const state = this.getOrCreateRateLimitState(userId);
    const now = Date.now();

    if (now - state.minuteWindowStart > 60_000) {
      state.requestsInMinute = 0;
      state.tokensInMinute = 0;
      state.minuteWindowStart = now;
    }

    if (now - state.dayWindowStart > 24 * 60 * 60 * 1000) {
      state.tokensInDay = 0;
      state.costInDay = 0;
      state.dayWindowStart = now;
    }

    state.requestsInMinute++;
    state.tokensInMinute += usage.totalTokens;
    state.tokensInDay += usage.totalTokens;
    state.costInDay += costUsd;
  }
}
