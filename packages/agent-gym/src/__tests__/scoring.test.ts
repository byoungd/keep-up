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

  it("scores assistant content expectations", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "keepup-gym-test-"));
    const assistantState: AgentState = {
      turn: 1,
      messages: [{ role: "assistant", content: "Plan:\\n1. Read docs\\n2. Update code" }],
      pendingToolCalls: [],
      status: "complete",
    };

    const contentScenario: GymScenario = {
      id: "Z-AC-2B",
      title: "Assistant content scoring",
      category: "plan-quality",
      difficulty: "easy",
      prompt: "Provide a plan.",
      expectations: [
        { type: "assistant_contains", content: "Plan:" },
        { type: "assistant_regex", pattern: "^Plan:" },
      ],
    };

    const result = await evaluateScenario(contentScenario, {
      workspacePath: workspace,
      state: assistantState,
      toolCalls: [],
    });

    expect(result.pass).toBe(true);

    await rm(workspace, { recursive: true, force: true });
  });

  it("scores patch parsing expectations", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "keepup-gym-test-"));
    const patch = [
      "diff --git a/file.txt b/file.txt",
      "index 0000000..1111111 100644",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -0,0 +1 @@",
      "+hello",
      "",
    ].join("\\n");

    const patchScenario: GymScenario = {
      id: "Z-AC-PATCH",
      title: "Patch parsing scoring",
      category: "feature-add",
      difficulty: "easy",
      prompt: "Apply patch.",
      expectations: [{ type: "patch_parses", patch }],
    };

    const result = await evaluateScenario(patchScenario, {
      workspacePath: workspace,
      state: emptyState,
      toolCalls: [],
    });

    expect(result.pass).toBe(true);

    const invalidScenario: GymScenario = {
      id: "Z-AC-PATCH-BAD",
      title: "Patch parsing fails",
      category: "feature-add",
      difficulty: "easy",
      prompt: "Apply patch.",
      expectations: [{ type: "patch_parses", patch: "   " }],
    };

    const invalidResult = await evaluateScenario(invalidScenario, {
      workspacePath: workspace,
      state: emptyState,
      toolCalls: [],
    });

    expect(invalidResult.pass).toBe(false);
    expect(invalidResult.reason).toBe("missing_patch");

    await rm(workspace, { recursive: true, force: true });
  });
});
