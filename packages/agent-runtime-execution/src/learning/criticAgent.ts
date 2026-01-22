/**
 * Critic Agent
 *
 * Extracts preference rules from user feedback and persists lessons.
 */

import type {
  Lesson,
  LessonProfile,
  LessonScope,
  LessonSource,
  LessonStoreQuery,
} from "@ku0/agent-runtime-memory";

type Logger = Pick<Console, "info" | "warn">;

export type CriticFeedback = {
  feedback: string;
  projectId?: string;
  scope?: LessonScope;
  profile?: LessonProfile;
  source?: LessonSource;
  metadata?: Record<string, unknown>;
};

type ExtractedLesson = {
  trigger: string;
  rule: string;
  confidence: number;
};

export type CriticAgentConfig = {
  lessonStore: LessonStoreLike;
  defaultProfile?: LessonProfile;
  logger?: Logger;
};

export type LessonStoreLike = {
  add: (input: LessonInput) => Promise<Lesson>;
  update: (id: string, updates: Partial<Lesson>) => Promise<Lesson | null>;
  list: (query: LessonStoreQuery) => Promise<Lesson[]>;
};

type LessonInput = {
  trigger: string;
  rule: string;
  confidence?: number;
  scope?: LessonScope;
  projectId?: string;
  profile?: LessonProfile;
  source?: LessonSource;
  metadata?: Record<string, unknown>;
};

export class CriticAgent {
  private readonly lessonStore: LessonStoreLike;
  private readonly defaultProfile: LessonProfile;
  private readonly logger: Logger;

  constructor(config: CriticAgentConfig) {
    this.lessonStore = config.lessonStore;
    this.defaultProfile = config.defaultProfile ?? "default";
    this.logger = config.logger ?? console;
  }

  async ingestFeedback(input: CriticFeedback): Promise<Lesson[]> {
    const feedback = input.feedback.trim();
    if (!feedback) {
      return [];
    }
    const extracted = this.extractLessons(feedback);
    if (extracted.length === 0) {
      return [];
    }

    const scope = this.resolveScope(input);
    const profile = this.resolveProfile(input);
    const normalizedExisting = await this.loadExistingLessons(input, scope, profile);

    const stored: Lesson[] = [];
    for (const entry of extracted) {
      const lesson = await this.storeEntry({
        entry,
        existing: normalizedExisting,
        input,
        feedback,
        scope,
        profile,
      });
      if (lesson) {
        stored.push(lesson);
      }
    }

    return stored;
  }

  private resolveScope(input: CriticFeedback): LessonScope {
    return input.scope ?? (input.projectId ? "project" : "global");
  }

  private resolveProfile(input: CriticFeedback): LessonProfile {
    return input.profile ?? this.defaultProfile;
  }

  private async loadExistingLessons(
    input: CriticFeedback,
    scope: LessonScope,
    profile: LessonProfile
  ): Promise<Map<string, Lesson>> {
    const query: LessonStoreQuery = {
      projectId: input.projectId,
      scopes: [scope],
      profiles: [profile],
    };
    const existing = await this.lessonStore.list(query);
    return buildLessonMap(existing);
  }

  private async storeEntry(params: {
    entry: ExtractedLesson;
    existing: Map<string, Lesson>;
    input: CriticFeedback;
    feedback: string;
    scope: LessonScope;
    profile: LessonProfile;
  }): Promise<Lesson | null> {
    const key = normalizeKey(params.entry.rule);
    const duplicate = params.existing.get(key);
    if (duplicate) {
      return this.updateLesson(duplicate, params.entry, params.input, params.feedback);
    }
    return this.createLesson(
      params.entry,
      params.input,
      params.feedback,
      params.scope,
      params.profile
    );
  }

  private async updateLesson(
    duplicate: Lesson,
    entry: ExtractedLesson,
    input: CriticFeedback,
    feedback: string
  ): Promise<Lesson | null> {
    return this.lessonStore.update(duplicate.id, {
      confidence: Math.max(duplicate.confidence, entry.confidence),
      trigger: mergeTriggers(duplicate.trigger, entry.trigger),
      metadata: buildMetadata(duplicate.metadata, input.metadata, feedback),
    });
  }

  private async createLesson(
    entry: ExtractedLesson,
    input: CriticFeedback,
    feedback: string,
    scope: LessonScope,
    profile: LessonProfile
  ): Promise<Lesson | null> {
    try {
      return await this.lessonStore.add({
        trigger: entry.trigger,
        rule: entry.rule,
        confidence: entry.confidence,
        scope,
        projectId: input.projectId,
        profile,
        source: input.source ?? "critic",
        metadata: buildMetadata(undefined, input.metadata, feedback),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("CriticAgent failed to store lesson", { message });
      return null;
    }
  }

  extractLessons(feedback: string): ExtractedLesson[] {
    const lines = feedback
      .split(/\n+/g)
      .map((line) => line.trim())
      .map(stripBullet)
      .filter((line) => line.length > 0);

    const lessons: ExtractedLesson[] = [];
    for (const line of lines) {
      if (line.endsWith("?")) {
        continue;
      }
      const lesson = extractFromLine(line);
      if (!lesson) {
        continue;
      }
      lessons.push(lesson);
    }

    return lessons;
  }
}

function buildLessonMap(lessons: Lesson[]): Map<string, Lesson> {
  const entries = new Map<string, Lesson>();
  for (const lesson of lessons) {
    entries.set(normalizeKey(lesson.rule), lesson);
  }
  return entries;
}

function buildMetadata(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
  feedback: string
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    ...(incoming ?? {}),
    lastFeedback: feedback,
  };
}

function extractFromLine(line: string): ExtractedLesson | null {
  const lower = line.toLowerCase();
  const confidence = baseConfidence(lower);

  const replaceMatch = matchReplace(line);
  if (replaceMatch) {
    const from = trimTerminalPunctuation(replaceMatch.from);
    const to = trimTerminalPunctuation(replaceMatch.to);
    const trigger = `replace ${from} with ${to}`;
    const rule = `Prefer ${to} over ${from}.`;
    return { trigger, rule, confidence };
  }

  const preferMatch = matchPrefer(line);
  if (preferMatch) {
    const prefer = trimTerminalPunctuation(preferMatch.prefer);
    const over = preferMatch.over ? trimTerminalPunctuation(preferMatch.over) : undefined;
    const rule = over ? `Prefer ${prefer} over ${over}.` : `Prefer ${prefer}.`;
    return { trigger: line, rule, confidence };
  }

  const avoidMatch = matchAvoid(line);
  if (avoidMatch) {
    const target = trimTerminalPunctuation(avoidMatch);
    const rule = `Avoid ${target}.`;
    return { trigger: line, rule, confidence };
  }

  if (lower.startsWith("no ") || lower.startsWith("not ")) {
    const target = line.replace(/^(no|not)\s+/i, "").trim();
    if (target) {
      const normalized = trimTerminalPunctuation(target);
      return { trigger: line, rule: `Avoid ${normalized}.`, confidence };
    }
  }

  return null;
}

function matchReplace(line: string): { from: string; to: string } | null {
  const match = /(?:change|replace)\s+(.+?)\s+(?:with|to)\s+(.+)/i.exec(line);
  if (!match) {
    return null;
  }
  const from = match[1]?.trim();
  const to = match[2]?.trim();
  if (!from || !to) {
    return null;
  }
  return { from, to };
}

function matchPrefer(line: string): { prefer: string; over?: string } | null {
  const match = /(?:prefer|use)\s+(.+?)(?:\s+over\s+(.+))?$/i.exec(line);
  if (!match) {
    return null;
  }
  const prefer = match[1]?.trim();
  const over = match[2]?.trim();
  if (!prefer) {
    return null;
  }
  return { prefer, over: over || undefined };
}

function matchAvoid(line: string): string | null {
  const match = /(?:avoid|don't use|do not use|stop using|never use|hate)\s+(.+)/i.exec(line);
  if (!match) {
    return null;
  }
  const target = match[1]?.trim();
  return target || null;
}

function baseConfidence(lower: string): number {
  if (lower.includes("always") || lower.includes("never")) {
    return 0.9;
  }
  if (lower.includes("must")) {
    return 0.85;
  }
  if (lower.includes("prefer") || lower.includes("avoid")) {
    return 0.75;
  }
  return 0.65;
}

function stripBullet(line: string): string {
  return line.replace(/^[-*]\s+/, "");
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function mergeTriggers(existing: string, next: string): string {
  if (!existing) {
    return next;
  }
  if (!next || existing.includes(next)) {
    return existing;
  }
  return `${existing}; ${next}`;
}

function trimTerminalPunctuation(value: string): string {
  return value
    .trim()
    .replace(/[.!]+$/, "")
    .trim();
}
