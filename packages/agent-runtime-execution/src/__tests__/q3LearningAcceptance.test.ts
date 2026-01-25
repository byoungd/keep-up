import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createLessonStore,
  type EmbeddingProvider,
  type Lesson,
  type VectorSearchOptions,
  type VectorSearchResult,
  type VectorStore,
  type VectorStoreEntry,
} from "@ku0/agent-runtime-memory";
import { describe, expect, it } from "vitest";

import { CriticAgent } from "../learning/criticAgent";

class KeywordEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 2;

  async embed(text: string): Promise<number[]> {
    const normalized = text.toLowerCase();
    return normalized.includes("var") ? [1, 0] : [0, 1];
  }
}

type LessonVectorEntry = VectorStoreEntry & { embedding: number[] };

class ThresholdVectorStore implements VectorStore<LessonVectorEntry> {
  private readonly entries = new Map<string, LessonVectorEntry>();

  constructor(private readonly threshold = 0.1) {}

  async upsert(entry: LessonVectorEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async search(
    _query: string,
    _options?: VectorSearchOptions
  ): Promise<VectorSearchResult<LessonVectorEntry>[]> {
    return [];
  }

  async searchByEmbedding(
    embedding: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult<LessonVectorEntry>[]> {
    const scored: Array<VectorSearchResult<LessonVectorEntry>> = [];
    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(embedding, entry.embedding);
      if (score >= this.threshold) {
        scored.push({ entry, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const limit = options?.limit ?? scored.length;
    return scored.slice(0, limit);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

describe("Q3 Track Y Acceptance", () => {
  it("Y-AC-1 preference learning persists rule", async () => {
    const store = createLessonStore();
    const critic = new CriticAgent({ lessonStore: store });

    const lessons = await critic.ingestFeedback({ feedback: "Do not use var." });
    expect(lessons.length).toBeGreaterThan(0);

    const stored = await store.list({ scopes: ["global"], profiles: ["default"] });
    const rules = stored.map((lesson) => lesson.rule.toLowerCase());
    expect(rules.some((rule) => rule.includes("avoid var"))).toBe(true);
  });

  it("Y-AC-2 cross-session memory reloads persisted lesson", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ku0-lessons-"));
    const filePath = join(dir, "lessons.json");

    try {
      const store = createLessonStore({ filePath });
      const critic = new CriticAgent({ lessonStore: store });
      await critic.ingestFeedback({ feedback: "Do not use var." });

      const reloaded = createLessonStore({ filePath });
      const results = await reloaded.search("var usage", { profiles: ["default"] });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.lesson.rule.toLowerCase()).toContain("avoid var");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("Y-AC-3 rule deletion removes preference", async () => {
    const store = createLessonStore();
    const critic = new CriticAgent({ lessonStore: store });
    const lessons = await critic.ingestFeedback({ feedback: "Do not use var." });
    const target = lessons[0] as Lesson | undefined;
    expect(target).toBeDefined();

    if (!target) {
      return;
    }

    const deleted = await store.delete(target.id);
    expect(deleted).toBe(true);

    const results = await store.list({ scopes: ["global"], profiles: ["default"] });
    expect(results.length).toBe(0);
  });

  it("Y-AC-4 noise filtering skips unrelated rules", async () => {
    const embeddingProvider: EmbeddingProvider = new KeywordEmbeddingProvider();
    const vectorStore: VectorStore<LessonVectorEntry> = new ThresholdVectorStore(0.1);
    const store = createLessonStore({ embeddingProvider, vectorStore });
    const critic = new CriticAgent({ lessonStore: store });
    await critic.ingestFeedback({ feedback: "Do not use var." });

    const results = await store.search("Design a UI layout", { profiles: ["default"] });
    expect(results.length).toBe(0);
  });
});
