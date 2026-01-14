/**
 * Subagent Orchestrator Tests
 */

import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  AgentResult,
  AgentStatus,
  IAgentManager,
  SpawnAgentOptions,
} from "../agents/types";
import { SubagentOrchestrator, type SubagentTask } from "../orchestrator/subagentOrchestrator";

class FakeAgentManager implements IAgentManager {
  public spawned: SubagentTask[] = [];
  public activeCount = 0;
  public maxActive = 0;

  async spawn(options: SpawnAgentOptions): Promise<AgentResult> {
    this.activeCount += 1;
    this.maxActive = Math.max(this.maxActive, this.activeCount);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.activeCount -= 1;

    this.spawned.push({
      type: options.type,
      task: options.task,
      scope: {
        allowedTools: options.allowedTools,
        network: options.security?.permissions.network === "none" ? "none" : "full",
        fileAccess: options.security?.permissions.file === "read" ? "read" : "write",
      },
    });

    return {
      agentId: `agent-${options.type}`,
      type: options.type,
      success: true,
      output: "ok",
      turns: 1,
      durationMs: 1,
    };
  }

  async spawnParallel(optionsList: SpawnAgentOptions[]): Promise<AgentResult[]> {
    return Promise.all(optionsList.map((opts) => this.spawn(opts)));
  }

  getAvailableTypes(): SubagentTask["type"][] {
    return ["code", "plan"];
  }

  getProfile(type: SubagentTask["type"]): AgentProfile {
    return {
      type,
      name: type,
      description: "test",
      allowedTools: ["*"],
      systemPrompt: "test",
      securityPreset: "balanced",
      maxTurns: 1,
      requireConfirmation: false,
    };
  }

  async stop(_agentId: string): Promise<void> {
    return;
  }

  getStatus(_agentId: string): AgentStatus | undefined {
    return "completed";
  }
}

describe("SubagentOrchestrator", () => {
  it("respects maxConcurrent when orchestrating", async () => {
    const manager = new FakeAgentManager();
    const orchestrator = new SubagentOrchestrator(manager);

    const tasks: SubagentTask[] = [
      { type: "plan", task: "t1" },
      { type: "plan", task: "t2" },
      { type: "plan", task: "t3" },
      { type: "plan", task: "t4" },
    ];

    await orchestrator.orchestrateSubagents("parent", tasks, { maxConcurrent: 2 });

    expect(manager.maxActive).toBeLessThanOrEqual(2);
  });

  it("passes scope constraints into spawned subagents", async () => {
    const manager = new FakeAgentManager();
    const orchestrator = new SubagentOrchestrator(manager);

    await orchestrator.spawnSubagent("parent", {
      type: "code",
      task: "do work",
      scope: {
        allowedTools: ["file:write"],
        network: "none",
        fileAccess: "read",
      },
    });

    const spawned = manager.spawned[0];
    expect(spawned?.scope?.allowedTools).toEqual(["file:write"]);
    expect(spawned?.scope?.network).toBe("none");
    expect(spawned?.scope?.fileAccess).toBe("read");
  });
});
