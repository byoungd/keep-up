import { describe, expect, it } from "vitest";
import { runScenario } from "../runner";
import type { GymScenario } from "../types";

const scenario: GymScenario = {
  id: "Z-AC-1",
  title: "Harness startup",
  category: "feature-add",
  difficulty: "easy",
  prompt: "Return immediately.",
  expectations: [{ type: "max_turns", count: 3 }],
  script: {
    responses: [{ content: "Done", finishReason: "stop" }],
  },
};

describe("KeepUpGym harness", () => {
  it("Z-AC-1 boots and completes a run", async () => {
    const run = await runScenario(scenario);
    expect(run.state.status).toBe("complete");
    expect(run.evaluation.pass).toBe(true);
  });
});
