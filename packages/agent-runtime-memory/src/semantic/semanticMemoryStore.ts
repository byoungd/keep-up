import {
  createLessonStore,
  type LessonSearchResult,
  type LessonStoreConfig,
} from "../lessons/lessonStore";
import type {
  Lesson,
  LessonProfile,
  LessonScope,
  SemanticMemoryPolicy,
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  SemanticMemorySearchResult,
} from "../types";

export type SemanticMemoryStoreConfig = LessonStoreConfig & {
  lessonStore?: ReturnType<typeof createLessonStore>;
  hardConfidenceThreshold?: number;
};

export type SemanticMemoryInput = Omit<
  SemanticMemoryRecord,
  "id" | "createdAt" | "updatedAt" | "policy"
> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  policy?: SemanticMemoryPolicy;
};

export type SemanticMemoryMergeResult = {
  hard: SemanticMemoryRecord[];
  soft: SemanticMemoryRecord[];
  merged: SemanticMemoryRecord[];
};

const DEFAULT_HARD_CONFIDENCE_THRESHOLD = 0.85;

export class SemanticMemoryStore {
  private readonly lessonStore: ReturnType<typeof createLessonStore>;
  private readonly hardConfidenceThreshold: number;

  constructor(config: SemanticMemoryStoreConfig = {}) {
    this.lessonStore = config.lessonStore ?? createLessonStore(config);
    this.hardConfidenceThreshold =
      config.hardConfidenceThreshold ?? DEFAULT_HARD_CONFIDENCE_THRESHOLD;
  }

  async add(input: SemanticMemoryInput): Promise<SemanticMemoryRecord> {
    const lesson = await this.lessonStore.add(toLessonInput(input));
    return toSemanticMemoryRecord(lesson, this.hardConfidenceThreshold);
  }

  async update(
    id: string,
    updates: Partial<SemanticMemoryInput>
  ): Promise<SemanticMemoryRecord | null> {
    const lessonUpdates = toLessonUpdates(updates);
    const updated = await this.lessonStore.update(id, lessonUpdates);
    if (!updated) {
      return null;
    }
    return toSemanticMemoryRecord(updated, this.hardConfidenceThreshold);
  }

  async delete(id: string): Promise<boolean> {
    return this.lessonStore.delete(id);
  }

  async get(id: string): Promise<SemanticMemoryRecord | null> {
    const lesson = await this.lessonStore.get(id);
    if (!lesson) {
      return null;
    }
    return toSemanticMemoryRecord(lesson, this.hardConfidenceThreshold);
  }

  async list(query: SemanticMemoryQuery = {}): Promise<SemanticMemoryRecord[]> {
    const lessons = await this.lessonStore.list(mapSemanticQuery(query));
    const records = lessons.map((lesson) =>
      toSemanticMemoryRecord(lesson, this.hardConfidenceThreshold)
    );
    return filterAndSortRecords(records, query);
  }

  async search(
    query: string,
    options: SemanticMemoryQuery = {}
  ): Promise<SemanticMemorySearchResult[]> {
    const results = await this.lessonStore.search(query, mapSemanticQuery(options));
    const mapped = results.map((result) =>
      toSemanticMemorySearchResult(result, this.hardConfidenceThreshold)
    );
    const filtered = filterSearchResults(mapped, options);
    return sortSearchResults(filtered);
  }

  mergePolicies(
    records: SemanticMemoryRecord[],
    options: { limit?: number; hardLimit?: number; softLimit?: number } = {}
  ): SemanticMemoryMergeResult {
    return mergeSemanticMemoryRecords(records, options);
  }
}

export function createSemanticMemoryStore(config?: SemanticMemoryStoreConfig): SemanticMemoryStore {
  return new SemanticMemoryStore(config);
}

export function mergeSemanticMemoryRecords(
  records: SemanticMemoryRecord[],
  options: { limit?: number; hardLimit?: number; softLimit?: number } = {}
): SemanticMemoryMergeResult {
  const hard = records.filter((record) => record.policy === "hard");
  const soft = records.filter((record) => record.policy !== "hard");

  const sortedHard = sortRecords(hard);
  const sortedSoft = sortRecords(soft);

  const hardRules = new Set(sortedHard.map((record) => normalizeRule(record.rule)));
  const dedupedSoft = sortedSoft.filter((record) => !hardRules.has(normalizeRule(record.rule)));

  const limitedHard =
    options.hardLimit !== undefined ? sortedHard.slice(0, options.hardLimit) : sortedHard;
  const limitedSoft =
    options.softLimit !== undefined ? dedupedSoft.slice(0, options.softLimit) : dedupedSoft;

  let merged = [...limitedHard, ...limitedSoft];
  if (options.limit !== undefined) {
    merged = merged.slice(0, options.limit);
  }

  return {
    hard: limitedHard,
    soft: limitedSoft,
    merged,
  };
}

export function toSemanticMemoryRecord(
  lesson: Lesson,
  hardConfidenceThreshold = DEFAULT_HARD_CONFIDENCE_THRESHOLD
): SemanticMemoryRecord {
  return {
    id: lesson.id,
    trigger: lesson.trigger,
    rule: lesson.rule,
    confidence: lesson.confidence,
    source: lesson.source,
    scope: lesson.scope,
    projectId: lesson.projectId,
    profile: lesson.profile,
    policy: resolvePolicy(lesson, hardConfidenceThreshold),
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
    metadata: lesson.metadata,
  };
}

function toSemanticMemorySearchResult(
  result: LessonSearchResult,
  hardConfidenceThreshold: number
): SemanticMemorySearchResult {
  return {
    record: toSemanticMemoryRecord(result.lesson, hardConfidenceThreshold),
    score: result.score,
  };
}

function mapSemanticQuery(query: SemanticMemoryQuery): {
  projectId?: string;
  scopes?: LessonScope[];
  profiles?: LessonProfile[];
  minConfidence?: number;
  limit?: number;
} {
  return {
    projectId: query.projectId,
    scopes: query.scopes,
    profiles: query.profiles,
    minConfidence: query.minConfidence,
    limit: query.limit,
  };
}

function filterAndSortRecords(
  records: SemanticMemoryRecord[],
  query: SemanticMemoryQuery
): SemanticMemoryRecord[] {
  const filtered = filterRecordsByPolicy(records, query.policy);
  return sortRecords(filtered);
}

function filterSearchResults(
  results: SemanticMemorySearchResult[],
  query: SemanticMemoryQuery
): SemanticMemorySearchResult[] {
  const filtered = filterRecordsByPolicy(
    results.map((result) => result.record),
    query.policy
  );
  const allowedIds = new Set(filtered.map((record) => record.id));
  return results.filter((result) => allowedIds.has(result.record.id));
}

function filterRecordsByPolicy(
  records: SemanticMemoryRecord[],
  policy: SemanticMemoryQuery["policy"]
): SemanticMemoryRecord[] {
  if (!policy) {
    return records;
  }
  const policies = Array.isArray(policy) ? policy : [policy];
  return records.filter((record) => policies.includes(record.policy));
}

function sortSearchResults(results: SemanticMemorySearchResult[]): SemanticMemorySearchResult[] {
  return results.slice().sort((a, b) => {
    const policyDelta = policyPriority(b.record.policy) - policyPriority(a.record.policy);
    if (policyDelta !== 0) {
      return policyDelta;
    }
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const confidenceDelta = b.record.confidence - a.record.confidence;
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    const updatedDelta = b.record.updatedAt - a.record.updatedAt;
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return a.record.rule.localeCompare(b.record.rule);
  });
}

function sortRecords(records: SemanticMemoryRecord[]): SemanticMemoryRecord[] {
  return records.slice().sort((a, b) => {
    const policyDelta = policyPriority(b.policy) - policyPriority(a.policy);
    if (policyDelta !== 0) {
      return policyDelta;
    }
    const confidenceDelta = b.confidence - a.confidence;
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    const updatedDelta = b.updatedAt - a.updatedAt;
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    const ruleDelta = a.rule.localeCompare(b.rule);
    if (ruleDelta !== 0) {
      return ruleDelta;
    }
    return a.id.localeCompare(b.id);
  });
}

function resolvePolicy(lesson: Lesson, hardConfidenceThreshold: number): SemanticMemoryPolicy {
  const policy = lesson.metadata?.policy;
  if (policy === "hard" || policy === "soft") {
    return policy;
  }
  return lesson.confidence >= hardConfidenceThreshold ? "hard" : "soft";
}

function normalizeRule(rule: string): string {
  return rule.trim().toLowerCase();
}

function policyPriority(policy: SemanticMemoryPolicy): number {
  return policy === "hard" ? 2 : 1;
}

function toLessonInput(input: SemanticMemoryInput): Omit<Lesson, "id" | "createdAt" | "updatedAt"> {
  return {
    trigger: input.trigger,
    rule: input.rule,
    confidence: input.confidence,
    source: input.source,
    scope: input.scope,
    projectId: input.projectId,
    profile: input.profile,
    metadata: mergeMetadata(input.metadata, input.policy),
  };
}

function toLessonUpdates(updates: Partial<SemanticMemoryInput>): Partial<Lesson> {
  return {
    trigger: updates.trigger,
    rule: updates.rule,
    confidence: updates.confidence,
    source: updates.source,
    scope: updates.scope,
    projectId: updates.projectId,
    profile: updates.profile,
    metadata: mergeMetadata(updates.metadata, updates.policy),
  };
}

function mergeMetadata(
  metadata: Record<string, unknown> | undefined,
  policy: SemanticMemoryPolicy | undefined
): Record<string, unknown> | undefined {
  if (!metadata && !policy) {
    return metadata;
  }
  const next = { ...(metadata ?? {}) };
  if (policy) {
    next.policy = policy;
  }
  return next;
}
