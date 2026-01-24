import { describe, expect, it } from "vitest";

import {
  mergeSemanticMemoryRecords,
  toSemanticMemoryRecord,
} from "../semantic/semanticMemoryStore";
import type { Lesson } from "../types";

const baseLesson: Lesson = {
  id: "lesson-1",
  trigger: "prefer const",
  rule: "Prefer const over let",
  confidence: 0.9,
  scope: "project",
  projectId: "proj",
  profile: "default",
  source: "manual",
  createdAt: 100,
  updatedAt: 100,
  embedding: [0, 1],
  metadata: undefined,
};

describe("SemanticMemoryStore helpers", () => {
  it("derives hard policy from confidence when metadata is absent", () => {
    const record = toSemanticMemoryRecord(baseLesson, 0.8);
    expect(record.policy).toBe("hard");

    const softRecord = toSemanticMemoryRecord({ ...baseLesson, confidence: 0.3 }, 0.8);
    expect(softRecord.policy).toBe("soft");
  });

  it("merges hard constraints before soft preferences and dedupes by rule", () => {
    const hard = toSemanticMemoryRecord(baseLesson, 0.8);
    const softDuplicate = {
      ...hard,
      id: "lesson-2",
      confidence: 0.6,
      policy: "soft" as const,
    };
    const softUnique = {
      ...hard,
      id: "lesson-3",
      rule: "Use descriptive names",
      confidence: 0.55,
      policy: "soft" as const,
    };

    const merged = mergeSemanticMemoryRecords([softUnique, softDuplicate, hard]);

    expect(merged.hard.map((record) => record.id)).toEqual(["lesson-1"]);
    expect(merged.soft.map((record) => record.id)).toEqual(["lesson-3"]);
    expect(merged.merged.map((record) => record.id)).toEqual(["lesson-1", "lesson-3"]);
  });
});
