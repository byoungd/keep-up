import type { Lesson, LessonScope } from "@ku0/agent-runtime-memory";
import { describe, expect, it } from "vitest";
import { CriticAgent, type LessonStoreLike } from "../learning/criticAgent";

describe("CriticAgent", () => {
  it("extracts replace-style feedback into lessons", async () => {
    const store = createStubLessonStore();
    const critic = new CriticAgent({ lessonStore: store });
    const lessons = await critic.ingestFeedback({
      feedback: "Change let to const.",
      projectId: "project-1",
    });
    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.rule).toBe("Prefer const over let.");
  });

  it("updates existing lessons instead of duplicating", async () => {
    const store = createStubLessonStore();
    const critic = new CriticAgent({ lessonStore: store });
    await critic.ingestFeedback({
      feedback: "Avoid TypeScript enums.",
      projectId: "project-2",
      profile: "default",
    });
    await critic.ingestFeedback({
      feedback: "Avoid TypeScript enums.",
      projectId: "project-2",
      profile: "default",
    });

    const list = await store.list({
      projectId: "project-2",
      scopes: ["project"],
      profiles: ["default"],
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.rule).toBe("Avoid TypeScript enums.");
  });
});

function createStubLessonStore(): LessonStoreLike {
  const lessons = new Map<string, Lesson>();
  let counter = 0;

  return {
    add: async (input) => {
      const id = `lesson-${counter++}`;
      const now = Date.now();
      const scope = input.scope ?? (input.projectId ? "project" : "global");
      const lesson: Lesson = {
        id,
        trigger: input.trigger,
        rule: input.rule,
        confidence: input.confidence ?? 0.6,
        scope,
        projectId: scope === "project" ? input.projectId : undefined,
        profile: input.profile ?? "default",
        source: input.source ?? "manual",
        createdAt: now,
        updatedAt: now,
        metadata: input.metadata,
      };
      lessons.set(id, lesson);
      return lesson;
    },
    update: async (id, updates) => {
      const existing = lessons.get(id);
      if (!existing) {
        return null;
      }
      const updated: Lesson = {
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      };
      lessons.set(id, updated);
      return updated;
    },
    list: async (query) => {
      const scopes = resolveScopes(query.projectId, query.scopes);
      const profiles = query.profiles ?? [];
      const result: Lesson[] = [];
      for (const lesson of lessons.values()) {
        if (!scopes.includes(lesson.scope)) {
          continue;
        }
        if (lesson.scope === "project" && query.projectId && lesson.projectId !== query.projectId) {
          continue;
        }
        if (profiles.length > 0 && !profiles.includes(lesson.profile)) {
          continue;
        }
        result.push(lesson);
      }
      return result;
    },
  };
}

function resolveScopes(
  projectId: string | undefined,
  scopes: LessonScope[] | undefined
): LessonScope[] {
  if (scopes && scopes.length > 0) {
    return scopes;
  }
  if (projectId) {
    return ["project", "global"];
  }
  return ["global"];
}
