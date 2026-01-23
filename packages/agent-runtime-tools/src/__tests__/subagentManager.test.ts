import type {
  AgentLifecycleStatus,
  AgentProfile,
  AgentResult,
  AgentType,
  IAgentManager,
  SpawnAgentOptions,
} from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { SubagentManager } from "../orchestrator/subagentManager";
import type { SubagentWorkItem } from "../orchestrator/subagents/types";

class FakeAgentManager implements IAgentManager {
  public spawned: SpawnAgentOptions[] = [];
  public activeCount = 0;
  public maxActive = 0;

  async spawn(options: SpawnAgentOptions): Promise<AgentResult> {
    this.spawned.push(options);
    this.activeCount += 1;
    this.maxActive = Math.max(this.maxActive, this.activeCount);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.activeCount -= 1;

    return {
      agentId: options.agentId ?? "agent-1",
      type: options.type,
      success: true,
      output: options.task,
      turns: 1,
      durationMs: 1,
    };
  }

  async spawnParallel(optionsList: SpawnAgentOptions[]): Promise<AgentResult[]> {
    return Promise.all(optionsList.map((opts) => this.spawn(opts)));
  }

  getAvailableTypes(): AgentType[] {
    return ["general", "code", "explore", "bash"];
  }

  getProfile(type: AgentType): AgentProfile {
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

  getStatus(_agentId: string): AgentLifecycleStatus | undefined {
    return "completed";
  }
}

describe("SubagentManager", () => {
  it("executes a single subagent", async () => {
    const manager = new SubagentManager(new FakeAgentManager());

    const result = await manager.executeSubagent({
      id: "task-1",
      config: {
        type: "codebase-research",
        name: "search",
        tools: ["file:read"],
      },
      input: { query: "auth" },
    });

    expect(result.success).toBe(true);
    expect(result.executionTime).toBeGreaterThan(0);
  });

  it("executes dependent subagents in order", async () => {
    const fake = new FakeAgentManager();
    const manager = new SubagentManager(fake);

    const tasks: SubagentWorkItem[] = [
      {
        id: "a",
        config: { type: "codebase-research", name: "research", tools: ["file:read"] },
        input: "step-a",
      },
      {
        id: "b",
        dependencies: ["a"],
        config: { type: "terminal-executor", name: "tests", tools: ["bash:execute"] },
        input: "step-b",
      },
    ];

    await manager.executeParallel(tasks);

    expect(fake.spawned[0]?.task).toContain("step-a");
    expect(fake.spawned[1]?.task).toContain("step-b");
  });

  it("respects maxConcurrency across batches", async () => {
    const fake = new FakeAgentManager();
    const manager = new SubagentManager(fake);

    const tasks: SubagentWorkItem[] = [
      {
        id: "a",
        config: {
          type: "parallel-work",
          name: "work-a",
          tools: ["file:read"],
          maxConcurrency: 1,
        },
        input: "a",
      },
      {
        id: "b",
        config: {
          type: "parallel-work",
          name: "work-b",
          tools: ["file:read"],
          maxConcurrency: 1,
        },
        input: "b",
      },
      {
        id: "c",
        config: {
          type: "parallel-work",
          name: "work-c",
          tools: ["file:read"],
          maxConcurrency: 1,
        },
        input: "c",
      },
    ];

    await manager.executeParallel(tasks);

    expect(fake.maxActive).toBeLessThanOrEqual(1);
  });
});
