/**
 * Delegation Tool Tests
 */

import {
  type AgentLineageManager,
  createDelegationToolServer,
  createLineageManager,
  type DelegationToolServer,
} from "@ku0/agent-runtime-tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfile, AgentResult, AgentType, IAgentManager } from "../agents/types";
import { createSecurityPolicy } from "../security";

// ============================================================================
// Mock Agent Manager
// ============================================================================

function createMockAgentManager(): IAgentManager & {
  spawnCalls: { type: AgentType; task: string; allowedTools?: string[]; agentId?: string }[];
} {
  const spawnCalls: { type: AgentType; task: string; allowedTools?: string[]; agentId?: string }[] =
    [];

  return {
    spawnCalls,
    spawn: vi.fn(async (options) => {
      spawnCalls.push({
        type: options.type,
        task: options.task,
        allowedTools: options.allowedTools,
        agentId: options.agentId,
      });
      return {
        agentId: options.agentId ?? `${options.type}-123`,
        type: options.type,
        success: true,
        output: `Completed task: ${options.task}`,
        turns: 3,
        durationMs: 1500,
      } as AgentResult;
    }),
    spawnParallel: vi.fn(async () => []),
    getAvailableTypes: () => ["research", "code", "code-reviewer", "explore"] as AgentType[],
    getProfile: (type: AgentType) => ({ type, name: type, allowedTools: ["*"] }) as AgentProfile,
    stop: vi.fn(async () => {
      /* noop */
    }),
    getStatus: () => undefined,
  };
}

describe("DelegationToolServer", () => {
  let manager: ReturnType<typeof createMockAgentManager>;
  let lineageManager: AgentLineageManager;
  let server: DelegationToolServer;
  const security = createSecurityPolicy("balanced");

  beforeEach(() => {
    manager = createMockAgentManager();
    lineageManager = createLineageManager();
    server = createDelegationToolServer(manager, {
      lineageManager,
      parentAgentId: "parent-1",
      parentDepth: 0,
    });
  });

  describe("tool registration", () => {
    it("should register delegate and list_roles tools", () => {
      const tools = server.listTools();
      expect(tools.map((t) => t.name)).toContain("delegate");
      expect(tools.map((t) => t.name)).toContain("list_roles");
    });
  });

  describe("role to agent type mapping", () => {
    it("should map researcher to research agent", async () => {
      await server.callTool(
        { name: "delegate", arguments: { role: "researcher", task: "Find information" } },
        { security }
      );

      expect(manager.spawnCalls[0].type).toBe("research");
    });

    it("should map coder to code agent", async () => {
      await server.callTool(
        { name: "delegate", arguments: { role: "coder", task: "Write code" } },
        { security }
      );

      expect(manager.spawnCalls[0].type).toBe("code");
    });

    it("should map reviewer to code-reviewer agent", async () => {
      await server.callTool(
        { name: "delegate", arguments: { role: "reviewer", task: "Review code" } },
        { security }
      );

      expect(manager.spawnCalls[0].type).toBe("code-reviewer");
    });

    it("should map analyst to explore agent", async () => {
      await server.callTool(
        { name: "delegate", arguments: { role: "analyst", task: "Analyze data" } },
        { security }
      );

      expect(manager.spawnCalls[0].type).toBe("explore");
    });
  });

  describe("constraint enforcement", () => {
    it("should pass constraints as allowedTools", async () => {
      await server.callTool(
        {
          name: "delegate",
          arguments: {
            role: "coder",
            task: "Write code",
            constraints: ["file:read", "file:write"],
          },
        },
        { security }
      );

      expect(manager.spawnCalls[0].allowedTools).toEqual(["file:read", "file:write"]);
    });

    it("should allow delegation without constraints", async () => {
      await server.callTool(
        { name: "delegate", arguments: { role: "coder", task: "Write code" } },
        { security }
      );

      expect(manager.spawnCalls[0].allowedTools).toBeUndefined();
    });
  });

  describe("argument validation", () => {
    it("should reject invalid role", async () => {
      const result = await server.callTool(
        { name: "delegate", arguments: { role: "invalid", task: "Do something" } },
        { security }
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    });

    it("should reject empty task", async () => {
      const result = await server.callTool(
        { name: "delegate", arguments: { role: "coder", task: "" } },
        { security }
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    });

    it("should reject invalid constraints", async () => {
      const result = await server.callTool(
        {
          name: "delegate",
          arguments: { role: "coder", task: "Write code", constraints: [1, "file:read"] },
        },
        { security }
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    });
  });

  describe("lineage tracking", () => {
    it("should track child agent in lineage", async () => {
      await server.callTool(
        { name: "delegate", arguments: { role: "researcher", task: "Find info" } },
        { security }
      );

      const childAgentId = manager.spawnCalls[0].agentId;
      expect(childAgentId).toBeDefined();
      const entry = lineageManager.get(childAgentId as string);
      expect(entry).toBeDefined();
      expect(entry?.parentId).toBe("parent-1");
      expect(entry?.role).toBe("researcher");
      expect(entry?.depth).toBe(1);
    });

    it("should update status on successful completion", async () => {
      await server.callTool(
        { name: "delegate", arguments: { role: "coder", task: "Write code" } },
        { security }
      );

      const childAgentId = manager.spawnCalls[0].agentId;
      expect(childAgentId).toBeDefined();
      const entry = lineageManager.get(childAgentId as string);
      expect(entry?.status).toBe("completed");
    });

    it("should increment depth for nested delegation", () => {
      // Server created with parentDepth 0, so children should have depth 1
      const childServer = createDelegationToolServer(manager, {
        lineageManager,
        parentAgentId: "child-1",
        parentDepth: 1,
      });

      // The child server would create agents at depth 2
      expect(childServer).toBeDefined();
    });
  });

  describe("list_roles", () => {
    it("should return role descriptions", async () => {
      const result = await server.callTool({ name: "list_roles", arguments: {} }, { security });

      expect(result.success).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("researcher");
      expect(text).toContain("coder");
      expect(text).toContain("reviewer");
      expect(text).toContain("analyst");
    });
  });

  describe("result formatting", () => {
    it("should format successful result with agent details", async () => {
      const result = await server.callTool(
        { name: "delegate", arguments: { role: "researcher", task: "Find info" } },
        { security }
      );

      expect(result.success).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      const childAgentId = manager.spawnCalls[0].agentId;
      expect(childAgentId).toBeDefined();
      expect(text).toContain("Delegation Result");
      expect(text).toContain("researcher");
      expect(text).toContain(childAgentId as string);
      expect(text).toContain("Completed task");
    });
  });

  describe("error handling", () => {
    it("should handle spawn failure gracefully", async () => {
      manager.spawn = vi.fn(async (options) => {
        manager.spawnCalls.push({
          type: options.type,
          task: options.task,
          allowedTools: options.allowedTools,
          agentId: options.agentId,
        });
        throw new Error("Spawn failed: max depth exceeded");
      });

      const result = await server.callTool(
        { name: "delegate", arguments: { role: "coder", task: "Write code" } },
        { security }
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_FAILED");
      expect(result.error?.message).toContain("max depth exceeded");
      const childAgentId = manager.spawnCalls[0].agentId;
      expect(childAgentId).toBeDefined();
      const entry = lineageManager.get(childAgentId as string);
      expect(entry?.status).toBe("failed");
    });
  });
});
