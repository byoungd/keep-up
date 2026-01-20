import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentState } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { evaluateScenario } from "../scoring";
import type { GymScenario } from "../types";

const scenario: GymScenario = {
  id: "Z-AC-2",
  title: "Syntax scoring",
  category: "syntax-repair",
  difficulty: "easy",
  prompt: "Fix syntax",
  expectations: [{ type: "no_syntax_errors", path: "broken.ts" }],
};

const emptyState: AgentState = {
  turn: 0,
  messages: [],
  pendingToolCalls: [],
  status: "complete",
};

describe("KeepUpGym scoring", () => {
  it("Z-AC-2 flags syntax errors", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "keepup-gym-test-"));
    await writeFile(path.join(workspace, "broken.ts"), "const = 1;", "utf-8");

    const result = await evaluateScenario(scenario, {
      workspacePath: workspace,
      state: emptyState,
      toolCalls: [],
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toBe("syntax");

    await rm(workspace, { recursive: true, force: true });
  });
});
