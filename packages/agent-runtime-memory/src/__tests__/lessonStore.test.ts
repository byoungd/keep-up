import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLessonStore } from "../index";

describe("LessonStore", () => {
  it("filters lessons by scope and project", async () => {
    const store = createLessonStore();
    const globalLesson = await store.add({
      trigger: "typescript enums",
      rule: "Avoid TypeScript enums.",
      confidence: 0.7,
      scope: "global",
      profile: "default",
      source: "manual",
    });
    const projectLesson = await store.add({
      trigger: "typescript enums",
      rule: "Prefer string unions over enums.",
      confidence: 0.8,
      scope: "project",
      projectId: "project-a",
      profile: "default",
      source: "manual",
    });

    const results = await store.search("typescript enums", {
      projectId: "project-a",
      profiles: ["default"],
    });
    const ids = results.map((result) => result.lesson.id);
    expect(ids).toContain(globalLesson.id);
    expect(ids).toContain(projectLesson.id);

    const otherProject = await store.search("typescript enums", {
      projectId: "project-b",
      profiles: ["default"],
    });
    expect(otherProject.some((result) => result.lesson.id === projectLesson.id)).toBe(false);
  });

  it("persists lessons to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lesson-store-"));
    const filePath = join(dir, "lessons.json");
    const store = createLessonStore({ filePath });
    await store.add({
      trigger: "const",
      rule: "Prefer const over let.",
      confidence: 0.65,
      scope: "global",
      profile: "default",
      source: "manual",
    });

    const reloaded = createLessonStore({ filePath });
    const list = await reloaded.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.rule).toBe("Prefer const over let.");
  });
});
