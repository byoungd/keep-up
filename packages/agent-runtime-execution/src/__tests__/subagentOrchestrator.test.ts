/**
 * Subagent Orchestrator Tests
 */

import { SubagentOrchestrator, type SubagentTask } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  AgentResult,
  AgentStatus,
  IAgentManager,
  SpawnAgentOptions,
} from "../agents/types";

type SpawnRecord = SubagentTask & { parentContextId?: string };

class FakeAgentManager implements IAgentManager {
  public spawned: SpawnRecord[] = [];
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
      parentContextId: options.parentContextId,
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

  it("inherits allowed tools from parent execution context when scope is absent", async () => {
    const manager = new FakeAgentManager();
    const orchestrator = new SubagentOrchestrator(manager);

    await orchestrator.spawnSubagent(
      "parent",
      { type: "plan", task: "do work" },
      {
        baseToolExecution: {
          policy: "batch",
          allowedTools: ["file:read"],
          requiresApproval: [],
          maxParallel: 1,
        },
      }
    );

    expect(manager.spawned[0]?.scope?.allowedTools).toEqual(["file:read"]);
  });

  it("threads workflow context between subagents", async () => {
    const manager = new FakeAgentManager();
    const orchestrator = new SubagentOrchestrator(manager);

    await orchestrator.executeWorkflow("parent", {
      research: "Find relevant details",
      plan: "Draft a plan",
      implement: "Implement the changes",
      verify: "Verify the result",
      context: { docId: "doc-1" },
    });

    expect(manager.spawned[0]?.task).toContain("Context from parent");
    expect(manager.spawned[0]?.task).toContain('docId: "doc-1"');
    expect(manager.spawned[1]?.task).toContain('research: "ok"');
    expect(manager.spawned[2]?.task).toContain('plan: "ok"');
    expect(manager.spawned[3]?.task).toContain('implementation: "ok"');
  });

  it("propagates context IDs to spawned agents", async () => {
    const manager = new FakeAgentManager();
    const orchestrator = new SubagentOrchestrator(manager);

    await orchestrator.spawnSubagent(
      "parent",
      { type: "plan", task: "do work" },
      { contextId: "ctx-parent" }
    );

    expect(manager.spawned[0]?.parentContextId).toBe("ctx-parent");
  });
});
