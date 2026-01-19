/**
 * Cowork Memory Controls
 *
 * No-op memory manager for Cowork sessions (no cross-session memory).
 */

import type {
  ConsolidationResult,
  IMemoryManager,
  Memory,
  MemoryStats,
  RecallOptions,
  RememberOptions,
} from "@ku0/agent-runtime-memory";

export class NoopMemoryManager implements IMemoryManager {
  async remember(_content: string, _options?: RememberOptions): Promise<string> {
    return "noop";
  }

  async recall(_query: string, _options?: RecallOptions): Promise<Memory[]> {
    return [];
  }

  async forget(_id: string): Promise<void> {
    return undefined;
  }

  async reinforce(_id: string): Promise<void> {
    return undefined;
  }

  async getContext(_maxTokens?: number): Promise<string> {
    return "";
  }

  async addToContext(_message: string, _role: "user" | "assistant" | "system"): Promise<void> {
    return undefined;
  }

  async clearContext(): Promise<void> {
    return undefined;
  }

  async consolidate(): Promise<ConsolidationResult> {
    return {
      memoriesBefore: 0,
      memoriesAfter: 0,
      deleted: 0,
      merged: 0,
      summaries: [],
      durationMs: 0,
    };
  }

  async getStats(): Promise<MemoryStats> {
    return {
      total: 0,
      byType: {
        fact: 0,
        preference: 0,
        codebase: 0,
        conversation: 0,
        decision: 0,
        error: 0,
        tool_result: 0,
        summary: 0,
      },
      averageImportance: 0,
      sizeBytes: 0,
      oldestAt: undefined,
      newestAt: undefined,
    };
  }

  async export(): Promise<string> {
    return "";
  }

  async import(_data: string): Promise<number> {
    return 0;
  }
}
