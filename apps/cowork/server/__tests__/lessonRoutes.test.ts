import type { Lesson, LessonStore } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLessonRoutes } from "../routes/lessons";

function createLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "lesson-1",
    trigger: "trigger",
    rule: "rule",
    confidence: 0.9,
    scope: "global",
    profile: "default",
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("Lesson routes", () => {
  let app: Hono;
  let lessonStore: LessonStore;

  beforeEach(() => {
    lessonStore = {
      list: vi.fn(async () => [createLesson()]),
      search: vi.fn(async () => [{ score: 0.9, lesson: createLesson() }]),
      add: vi.fn(async (input) => createLesson({ ...input, id: "lesson-new" })),
      update: vi.fn(async () => createLesson({ rule: "updated" })),
      delete: vi.fn(async () => true),
    } as unknown as LessonStore;

    app = createLessonRoutes({ lessonStore });
  });

  it("lists lessons when no query is provided", async () => {
    const res = await app.request("/lessons");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; lessons: Lesson[] };
    expect(data.ok).toBe(true);
    expect(data.lessons).toHaveLength(1);
    expect(data.lessons[0]?.id).toBe("lesson-1");
  });

  it("searches lessons when query is provided", async () => {
    const res = await app.request("/lessons?q=test&scope=global");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; results: Array<{ score: number }> };
    expect(data.ok).toBe(true);
    expect(data.results[0]?.score).toBe(0.9);
  });

  it("rejects invalid lesson payloads", async () => {
    const res = await app.request("/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("creates lessons", async () => {
    const res = await app.request("/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "t", rule: "r" }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { ok: boolean; lesson: Lesson };
    expect(data.ok).toBe(true);
    expect(data.lesson.id).toBe("lesson-new");
  });

  it("returns 404 when updating missing lessons", async () => {
    const update = lessonStore.update as ReturnType<typeof vi.fn>;
    update.mockResolvedValueOnce(null);

    const res = await app.request("/lessons/lesson-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: "change" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates lessons", async () => {
    const res = await app.request("/lessons/lesson-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: "change" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; lesson: Lesson };
    expect(data.ok).toBe(true);
    expect(data.lesson.rule).toBe("updated");
  });

  it("returns 404 when deleting missing lessons", async () => {
    const del = lessonStore.delete as ReturnType<typeof vi.fn>;
    del.mockResolvedValueOnce(false);

    const res = await app.request("/lessons/lesson-1", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("deletes lessons", async () => {
    const res = await app.request("/lessons/lesson-1", { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });
});
