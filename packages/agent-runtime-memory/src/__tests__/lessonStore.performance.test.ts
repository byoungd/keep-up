import { describe, expect, it } from "vitest";
import { createLessonStore } from "../index";

const perfSuite = process.env.KU0_PERF_TESTS === "true" ? describe : describe.skip;

perfSuite("LessonStore performance", () => {
  it("searches 1000 lessons under 50ms", async () => {
    const store = createLessonStore();
    for (let index = 0; index < 1000; index += 1) {
      await store.add({
        trigger: `rule ${index}`,
        rule: `Prefer pattern ${index}.`,
        confidence: 0.6,
        scope: "global",
        profile: "default",
        source: "manual",
      });
    }

    const start = performance.now();
    const results = await store.search("rule 999", { limit: 5 });
    const duration = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(50);
  });
});
