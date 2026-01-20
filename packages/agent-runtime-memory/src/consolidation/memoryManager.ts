import { randomUUID } from "node:crypto";
import type { EmbeddingProvider, VectorStore } from "../semantic/vectorStore";
import type { MemoryEntry, MemoryEntryType } from "../working/sessionMemory";
import { SessionMemory } from "../working/sessionMemory";

export interface MemoryConsolidationConfig {
  workingMemoryLimit: number;
  vectorStore: VectorStore<MemoryEntry>;
  consolidationIntervalMs: number;
  promotionThreshold: number;
  embeddingProvider?: EmbeddingProvider;
}

export interface WorkingMemoryConsolidationResult {
  promoted: number;
  evicted: number;
  remaining: number;
}

export class ConsolidationMemoryManager {
  private readonly workingMemory: SessionMemory;
  private readonly config: MemoryConsolidationConfig;

  constructor(config: MemoryConsolidationConfig) {
    this.config = config;
    this.workingMemory = new SessionMemory({ workingMemoryLimit: config.workingMemoryLimit });
  }

  async remember(content: string, type: MemoryEntryType): Promise<string> {
    const importance = await this.calculateImportance(content, type);
    return this.workingMemory.remember(content, type, {
      importance,
      source: "agent",
    });
  }

  async recall(query: string, limit = 5): Promise<MemoryEntry[]> {
    const working = this.searchWorking(query, limit);
    const remaining = limit - working.length;

    if (remaining <= 0) {
      return working;
    }

    const longTerm = await this.config.vectorStore.search(query, { limit: remaining });
    const merged = [...working, ...longTerm.map((result) => result.entry)];

    for (const entry of merged) {
      entry.metadata.accessedAt = Date.now();
      entry.metadata.accessCount += 1;
    }

    return merged;
  }

  async consolidate(): Promise<WorkingMemoryConsolidationResult> {
    let promoted = 0;
    let evicted = 0;
    const now = Date.now();

    for (const entry of this.workingMemory.list()) {
      if (entry.metadata.importance >= this.config.promotionThreshold) {
        const withEmbedding = await this.ensureEmbedding(entry);
        await this.config.vectorStore.upsert(withEmbedding);
        promoted += 1;
      }

      const age = now - entry.metadata.accessedAt;
      if (age > this.config.consolidationIntervalMs * 2) {
        this.workingMemory.remove(entry.id);
        evicted += 1;
      }
    }

    return {
      promoted,
      evicted,
      remaining: this.workingMemory.list().length,
    };
  }

  linkSessions(sourceSessionId: string, targetSessionId: string): void {
    this.workingMemory.linkSessions(sourceSessionId, targetSessionId);
  }

  getLinkedSessions(sessionId: string): string[] {
    return this.workingMemory.getLinkedSessions(sessionId);
  }

  private searchWorking(query: string, limit: number): MemoryEntry[] {
    const normalized = query.toLowerCase();
    const scored: Array<{ entry: MemoryEntry; score: number }> = [];

    for (const entry of this.workingMemory.list()) {
      const score = scoreText(entry.content, normalized);
      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((item) => item.entry);
  }

  private async ensureEmbedding(entry: MemoryEntry): Promise<MemoryEntry> {
    if (entry.embedding || !this.config.embeddingProvider) {
      return entry;
    }

    const embedding = await this.config.embeddingProvider.embed(entry.content);
    return {
      ...entry,
      embedding,
    };
  }

  private async calculateImportance(content: string, type: MemoryEntryType): Promise<number> {
    const base = content.length / 500;
    const typeBoost = type === "semantic" ? 0.2 : type === "procedural" ? 0.15 : 0.1;
    const raw = Math.min(1, base + typeBoost);
    return Number.isFinite(raw) ? raw : 0.1;
  }
}

export function createMemoryEntry(
  content: string,
  type: MemoryEntryType,
  options: { importance?: number; source?: string; sessionId?: string; embedding?: number[] } = {}
): MemoryEntry {
  const now = Date.now();
  return {
    id: `mem_${randomUUID()}`,
    type,
    content,
    embedding: options.embedding,
    metadata: {
      createdAt: now,
      accessedAt: now,
      accessCount: 1,
      importance: options.importance ?? 0.5,
      source: options.source ?? "agent",
      sessionId: options.sessionId,
    },
  };
}

function scoreText(content: string, query: string): number {
  const normalized = content.toLowerCase();
  if (normalized === query) {
    return 1;
  }
  if (normalized.includes(query)) {
    return Math.min(0.9, query.length / normalized.length + 0.2);
  }
  return 0;
}
