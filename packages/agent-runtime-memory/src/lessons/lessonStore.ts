/**
 * Lesson Store
 *
 * Persistent, vector-backed storage for learned preferences.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { EmbeddingProvider, VectorSearchOptions } from "../semantic/vectorStore";
import { InMemoryVectorStore } from "../semantic/vectorStore";
import type { IEmbeddingProvider, Lesson, LessonProfile, LessonScope } from "../types";
import { MockEmbeddingProvider } from "../vectorIndex";

export type LessonSearchResult = {
  lesson: Lesson;
  score: number;
};

export type LessonStoreQuery = {
  projectId?: string;
  scopes?: LessonScope[];
  profiles?: LessonProfile[];
  minConfidence?: number;
  limit?: number;
};

export type LessonStoreConfig = {
  filePath?: string;
  embeddingProvider?: EmbeddingProvider | IEmbeddingProvider;
  dimension?: number;
  maxEntries?: number;
  clock?: () => number;
};

type LessonInput = Omit<
  Lesson,
  "id" | "createdAt" | "updatedAt" | "scope" | "profile" | "source" | "confidence"
> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  scope?: LessonScope;
  profile?: LessonProfile;
  source?: Lesson["source"];
  confidence?: number;
};

type LessonVectorEntry = {
  id: string;
  content: string;
  embedding: number[];
};

type LessonWithEmbedding = Lesson & { embedding: number[] };

const DEFAULT_DIMENSION = 384;

export class LessonStore {
  private readonly filePath?: string;
  private readonly vectorStore: InMemoryVectorStore<LessonVectorEntry>;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly clock: () => number;
  private readonly lessons = new Map<string, Lesson>();
  private loadPromise: Promise<void> | null = null;

  constructor(config: LessonStoreConfig = {}) {
    this.filePath = config.filePath;
    this.clock = config.clock ?? (() => Date.now());
    this.embeddingProvider = resolveEmbeddingProvider(config);
    this.vectorStore = new InMemoryVectorStore<LessonVectorEntry>({
      dimension: this.embeddingProvider.dimension,
      maxEntries: config.maxEntries,
      embeddingProvider: this.embeddingProvider,
    });
  }

  async add(input: LessonInput): Promise<Lesson> {
    await this.ensureLoaded();
    const now = this.clock();
    const id = input.id ?? randomUUID();
    const scope = input.scope ?? (input.projectId ? "project" : "global");
    const projectId = scope === "project" ? input.projectId : undefined;
    const lesson: Lesson = {
      ...input,
      id,
      trigger: normalizeText(input.trigger),
      rule: normalizeText(input.rule),
      confidence: clampConfidence(input.confidence),
      scope,
      projectId,
      profile: input.profile ?? "default",
      source: input.source ?? "manual",
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    if (!lesson.trigger || !lesson.rule) {
      throw new Error("Lessons require non-empty trigger and rule");
    }
    if (lesson.scope === "project" && !lesson.projectId) {
      throw new Error("Project-scoped lessons require projectId");
    }

    const embedding = await this.getEmbedding(lesson);
    const stored = { ...lesson, embedding };
    this.lessons.set(id, stored);
    await this.vectorStore.upsert(this.toVectorEntry(stored, embedding));
    await this.persist();
    return stored;
  }

  async update(id: string, updates: Partial<Lesson>): Promise<Lesson | null> {
    await this.ensureLoaded();
    const current = this.lessons.get(id);
    if (!current) {
      return null;
    }
    const nextScope = updates.scope ?? current.scope;
    const nextProjectId =
      nextScope === "project" ? (updates.projectId ?? current.projectId) : undefined;
    const next: Lesson = {
      ...current,
      ...updates,
      scope: nextScope,
      projectId: nextProjectId,
      trigger: updates.trigger ? normalizeText(updates.trigger) : current.trigger,
      rule: updates.rule ? normalizeText(updates.rule) : current.rule,
      confidence:
        updates.confidence !== undefined ? clampConfidence(updates.confidence) : current.confidence,
      updatedAt: this.clock(),
    };
    if (!next.trigger || !next.rule) {
      throw new Error("Lessons require non-empty trigger and rule");
    }
    if (next.scope === "project" && !next.projectId) {
      throw new Error("Project-scoped lessons require projectId");
    }
    const embedding = await this.getEmbedding(next, current);
    const stored = { ...next, embedding };
    this.lessons.set(id, stored);
    await this.vectorStore.upsert(this.toVectorEntry(stored, embedding));
    await this.persist();
    return stored;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    if (!this.lessons.delete(id)) {
      return false;
    }
    await this.vectorStore.delete(id);
    await this.persist();
    return true;
  }

  async get(id: string): Promise<Lesson | null> {
    await this.ensureLoaded();
    return this.lessons.get(id) ?? null;
  }

  async list(query: LessonStoreQuery = {}): Promise<Lesson[]> {
    await this.ensureLoaded();
    const items = this.filterLessons(Array.from(this.lessons.values()), query);
    if (query.limit !== undefined) {
      return items.slice(0, query.limit);
    }
    return items;
  }

  async search(query: string, options: LessonStoreQuery = {}): Promise<LessonSearchResult[]> {
    await this.ensureLoaded();
    const limit = options.limit ?? 8;
    const results = await this.vectorStore.search(query, {
      limit: limit * 3,
    } satisfies VectorSearchOptions);
    const filtered: LessonSearchResult[] = [];

    for (const result of results) {
      const lesson = this.lessons.get(result.entry.id);
      if (!lesson) {
        continue;
      }
      if (!isLessonMatch(lesson, options)) {
        continue;
      }
      filtered.push({ lesson, score: result.score });
      if (filtered.length >= limit) {
        break;
      }
    }

    return filtered;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.filePath) {
      return;
    }
    if (!this.loadPromise) {
      this.loadPromise = this.loadFromDisk();
    }
    await this.loadPromise;
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.filePath) {
      return;
    }
    const items = await this.readLessonItems();
    await this.restoreLessonItems(items);
  }

  private async readLessonItems(): Promise<Lesson[]> {
    if (!this.filePath) {
      return [];
    }
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as { items?: Lesson[] };
      return Array.isArray(parsed.items) ? parsed.items : [];
    } catch (error) {
      if (isMissingFile(error)) {
        return [];
      }
      throw error;
    }
  }

  private async restoreLessonItems(items: Lesson[]): Promise<void> {
    for (const item of items) {
      const stored = await this.hydrateLesson(item);
      if (!stored) {
        continue;
      }
      this.lessons.set(stored.id, stored);
      await this.vectorStore.upsert(this.toVectorEntry(stored, stored.embedding));
    }
  }

  private async hydrateLesson(item: Lesson): Promise<LessonWithEmbedding | null> {
    if (!item.id) {
      return null;
    }
    const normalized = this.normalizeLesson(item);
    if (!normalized) {
      return null;
    }
    const embedding = await this.getEmbedding(normalized);
    return { ...normalized, embedding };
  }

  private normalizeLesson(item: Lesson): Lesson | null {
    const scope = item.scope ?? (item.projectId ? "project" : "global");
    const normalized: Lesson = {
      ...item,
      trigger: normalizeText(item.trigger),
      rule: normalizeText(item.rule),
      confidence: clampConfidence(item.confidence),
      scope,
      projectId: scope === "project" ? item.projectId : undefined,
      profile: item.profile ?? "default",
      source: item.source ?? "manual",
      createdAt: item.createdAt ?? this.clock(),
      updatedAt: item.updatedAt ?? item.createdAt ?? this.clock(),
    };
    if (!normalized.trigger || !normalized.rule) {
      return null;
    }
    return normalized;
  }

  private async persist(): Promise<void> {
    if (!this.filePath) {
      return;
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify({ items: Array.from(this.lessons.values()) }, null, 2);
    const tempPath = `${this.filePath}.${this.clock()}.tmp`;
    await writeFile(tempPath, payload, "utf-8");
    await rename(tempPath, this.filePath);
  }

  private toVectorEntry(lesson: Lesson, embedding: number[]): LessonVectorEntry {
    return {
      id: lesson.id,
      content: buildLessonContent(lesson),
      embedding,
    };
  }

  private async getEmbedding(lesson: Lesson, previous?: Lesson, force = false): Promise<number[]> {
    if (!force && lesson.embedding && !this.shouldReembed(lesson, previous)) {
      return lesson.embedding;
    }
    return this.embeddingProvider.embed(buildLessonContent(lesson));
  }

  private shouldReembed(next: Lesson, previous?: Lesson): boolean {
    if (!previous) {
      return true;
    }
    return next.trigger !== previous.trigger || next.rule !== previous.rule;
  }

  private filterLessons(items: Lesson[], query: LessonStoreQuery): Lesson[] {
    const filtered: Lesson[] = [];
    for (const lesson of items) {
      if (!isLessonMatch(lesson, query)) {
        continue;
      }
      filtered.push(lesson);
    }
    return filtered;
  }
}

export function createLessonStore(config?: LessonStoreConfig): LessonStore {
  return new LessonStore(config);
}

function resolveEmbeddingProvider(config: LessonStoreConfig): EmbeddingProvider {
  const configuredProvider = config.embeddingProvider;
  if (configuredProvider) {
    if ("dimension" in configuredProvider) {
      return configuredProvider;
    }
    return {
      embed: (text: string) => configuredProvider.embed(text),
      dimension: configuredProvider.getDimension(),
    };
  }
  const dimension = config.dimension ?? DEFAULT_DIMENSION;
  const mockProvider = new MockEmbeddingProvider(dimension);
  return {
    embed: (text: string) => mockProvider.embed(text),
    dimension,
  };
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function buildLessonContent(lesson: Lesson): string {
  return `${lesson.trigger}\n${lesson.rule}`.trim();
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

function isLessonMatch(lesson: Lesson, query: LessonStoreQuery): boolean {
  const scopes = resolveScopes(query);
  if (!scopes.includes(lesson.scope)) {
    return false;
  }
  if (lesson.scope === "project") {
    if (!query.projectId || lesson.projectId !== query.projectId) {
      return false;
    }
  }
  if (query.profiles && query.profiles.length > 0) {
    if (!query.profiles.includes(lesson.profile)) {
      return false;
    }
  }
  if (query.minConfidence !== undefined && lesson.confidence < query.minConfidence) {
    return false;
  }
  return true;
}

function resolveScopes(query: LessonStoreQuery): LessonScope[] {
  if (query.scopes && query.scopes.length > 0) {
    return query.scopes;
  }
  if (query.projectId) {
    return ["project", "global"];
  }
  return ["global"];
}
