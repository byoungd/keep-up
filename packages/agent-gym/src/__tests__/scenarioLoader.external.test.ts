import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenariosFromSource } from "../scenarioLoader";
import type { GymScenario } from "../types";

describe("ScenarioLoader external adapters", () => {
  it("loads SWE-bench JSONL via adapter source", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "gym-swe-"));
    const filePath = path.join(tempDir, "swe-bench.jsonl");

    const payload =
      '{"instance_id":"demo-1","repo":"org/repo","base_commit":"abc","patch":"diff","problem_statement":"Fix the bug"}\n' +
      '{"instance_id":"demo-2","repo":"org/repo","base_commit":"def","patch":"diff","problem_statement":"Fix another bug"}\n';

    await writeFile(filePath, payload, "utf-8");

    try {
      const scenarios = await loadScenariosFromSource(
        {
          type: "external",
          path: filePath,
          adapterId: "swe-bench",
          defaultCategory: "cross-file",
          defaultDifficulty: "hard",
          limit: 1,
          maxTurns: 9,
        },
        {
          categories: ["cross-file"],
          difficulties: ["hard"],
        }
      );

      expect(scenarios).toHaveLength(1);
      const scenario = scenarios[0] as GymScenario;
      expect(scenario.id).toBe("swe-bench-demo-1");
      expect(scenario.category).toBe("cross-file");
      expect(scenario.difficulty).toBe("hard");
      expect(scenario.prompt).toContain("Repository: org/repo");
      expect(scenario.prompt).toContain("Base commit: abc");
      expect(scenario.maxTurns).toBe(9);
      expect(scenario.external?.source).toBe("swe-bench");
      expect(scenario.external?.instanceId).toBe("demo-1");
      expect(scenario.expectations.some((exp) => exp.type === "tool_called")).toBe(true);
      expect(scenario.expectations.some((exp) => exp.type === "max_turns" && exp.count === 9)).toBe(
        true
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
