/**
 * PlanPersistence tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExecutionPlan } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createPlanPersistence } from "../orchestrator/planPersistence";

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "plan-persist-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("PlanPersistence", () => {
  it("round-trips step tools and dependencies", async () => {
    await withTempDir(async (dir) => {
      const persistence = createPlanPersistence({ workingDirectory: dir });

      const plan: ExecutionPlan = {
        id: "plan-1",
        goal: "Test plan",
        steps: [
          {
            id: "step-1",
            order: 1,
            description: "Call ping",
            tools: ["ping", "file:read"],
            expectedOutcome: "pong",
            dependencies: ["seed-step"],
            parallelizable: false,
            status: "pending",
          },
        ],
        estimatedDuration: 1000,
        riskAssessment: "low",
        toolsNeeded: ["ping", "file:read"],
        contextRequired: ["README.md"],
        successCriteria: ["pong"],
        createdAt: Date.now(),
        status: "draft",
        requiresApproval: true,
      };

      await persistence.saveCurrent(plan);

      const loaded = await persistence.loadCurrent();
      expect(loaded).not.toBeNull();
      expect(loaded?.steps).toHaveLength(1);
      expect(loaded?.steps[0]?.tools).toEqual(["ping", "file:read"]);
      expect(loaded?.steps[0]?.dependencies).toEqual(["seed-step"]);
      expect(loaded?.steps[0]?.expectedOutcome).toBe("pong");
      expect(loaded?.contextRequired).toEqual(["README.md"]);
      expect(loaded?.requiresApproval).toBe(true);
    });
  });
});
