/**
 * Lineage Tracking Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { type AgentLineageManager, createLineageManager } from "../agents/lineage";

describe("AgentLineageManager", () => {
  let manager: AgentLineageManager;

  beforeEach(() => {
    manager = createLineageManager();
  });

  describe("tracking agents", () => {
    it("should track a root agent with no parent", () => {
      const entry = manager.track("agent-1", null, "coder", 0);

      expect(entry.id).toBe("agent-1");
      expect(entry.parentId).toBeNull();
      expect(entry.role).toBe("coder");
      expect(entry.depth).toBe(0);
      expect(entry.status).toBe("active");
      expect(entry.usage).toEqual({ inputTokens: 0, outputTokens: 0, cost: 0 });
    });

    it("should track a child agent with parent", () => {
      manager.track("parent-1", null, "coder", 0);
      const child = manager.track("child-1", "parent-1", "researcher", 1);

      expect(child.parentId).toBe("parent-1");
      expect(child.depth).toBe(1);
    });

    it("should allow retrieving tracked agent", () => {
      manager.track("agent-1", null, "coder", 0);
      const entry = manager.get("agent-1");

      expect(entry).toBeDefined();
      expect(entry?.id).toBe("agent-1");
    });
  });

  describe("status updates", () => {
    it("should update status to completed", () => {
      manager.track("agent-1", null, "coder", 0);
      manager.updateStatus("agent-1", "completed");

      const entry = manager.get("agent-1");
      expect(entry?.status).toBe("completed");
      expect(entry?.completedAt).toBeDefined();
    });

    it("should update status to failed", () => {
      manager.track("agent-1", null, "coder", 0);
      manager.updateStatus("agent-1", "failed");

      const entry = manager.get("agent-1");
      expect(entry?.status).toBe("failed");
    });

    it("should handle non-existent agent gracefully", () => {
      // Should not throw
      manager.updateStatus("nonexistent", "completed");
    });
  });

  describe("usage tracking", () => {
    it("should accumulate usage for an agent", () => {
      manager.track("agent-1", null, "coder", 0);

      manager.addUsage("agent-1", { inputTokens: 100 });
      manager.addUsage("agent-1", { outputTokens: 50 });
      manager.addUsage("agent-1", { cost: 0.01 });

      const entry = manager.get("agent-1");
      expect(entry?.usage.inputTokens).toBe(100);
      expect(entry?.usage.outputTokens).toBe(50);
      expect(entry?.usage.cost).toBe(0.01);
    });

    it("should update both direct and aggregated usage", () => {
      manager.track("agent-1", null, "coder", 0);
      manager.addUsage("agent-1", { inputTokens: 100, outputTokens: 50, cost: 0.01 });

      const entry = manager.get("agent-1");
      expect(entry?.usage).toEqual({ inputTokens: 100, outputTokens: 50, cost: 0.01 });
      expect(entry?.aggregatedUsage).toEqual({ inputTokens: 100, outputTokens: 50, cost: 0.01 });
    });
  });

  describe("cost rollup", () => {
    it("should roll up child usage to parent", () => {
      manager.track("parent-1", null, "coder", 0);
      manager.track("child-1", "parent-1", "researcher", 1);

      // Parent has own usage
      manager.addUsage("parent-1", { inputTokens: 100, cost: 0.01 });

      // Child has its usage
      manager.addUsage("child-1", { inputTokens: 200, cost: 0.02 });

      // Rollup child to parent
      manager.rollupToParent("child-1");

      const parent = manager.get("parent-1");
      // Parent's direct usage unchanged
      expect(parent?.usage.inputTokens).toBe(100);
      expect(parent?.usage.cost).toBe(0.01);

      // Parent's aggregated includes child
      expect(parent?.aggregatedUsage.inputTokens).toBe(300);
      expect(parent?.aggregatedUsage.cost).toBe(0.03);
    });

    it("should handle multi-level rollup", () => {
      manager.track("root", null, "coder", 0);
      manager.track("child", "root", "researcher", 1);
      manager.track("grandchild", "child", "analyst", 2);

      manager.addUsage("root", { cost: 0.01 });
      manager.addUsage("child", { cost: 0.02 });
      manager.addUsage("grandchild", { cost: 0.03 });

      // Rollup grandchild to child
      manager.rollupToParent("grandchild");

      // Child's aggregated should include grandchild
      const child = manager.get("child");
      expect(child?.aggregatedUsage.cost).toBe(0.05); // 0.02 + 0.03

      // Rollup child to root
      manager.rollupToParent("child");

      // Root's aggregated should include child (which includes grandchild)
      const root = manager.get("root");
      expect(root?.aggregatedUsage.cost).toBeCloseTo(0.06, 10); // 0.01 + 0.05
    });

    it("should handle rollup for root agent (no parent)", () => {
      manager.track("root", null, "coder", 0);
      manager.addUsage("root", { cost: 0.01 });

      // Should not throw
      manager.rollupToParent("root");

      const root = manager.get("root");
      expect(root?.aggregatedUsage.cost).toBe(0.01);
    });
  });

  describe("lineage chain", () => {
    it("should return full lineage chain", () => {
      manager.track("root", null, "coder", 0);
      manager.track("child", "root", "researcher", 1);
      manager.track("grandchild", "child", "analyst", 2);

      const chain = manager.getLineage("grandchild");

      expect(chain).not.toBeNull();
      expect(chain?.agent.id).toBe("grandchild");
      expect(chain?.ancestors).toHaveLength(2);
      expect(chain?.ancestors[0].id).toBe("root");
      expect(chain?.ancestors[1].id).toBe("child");
      expect(chain?.descendants).toHaveLength(0);
    });

    it("should return descendants in lineage chain", () => {
      manager.track("root", null, "coder", 0);
      manager.track("child-1", "root", "researcher", 1);
      manager.track("child-2", "root", "analyst", 1);

      const chain = manager.getLineage("root");

      expect(chain?.descendants).toHaveLength(2);
      expect(chain?.descendants.map((d) => d.id)).toContain("child-1");
      expect(chain?.descendants.map((d) => d.id)).toContain("child-2");
    });

    it("should return null for unknown agent", () => {
      expect(manager.getLineage("nonexistent")).toBeNull();
    });
  });

  describe("getChildren", () => {
    it("should return direct children", () => {
      manager.track("root", null, "coder", 0);
      manager.track("child-1", "root", "researcher", 1);
      manager.track("child-2", "root", "analyst", 1);
      manager.track("grandchild", "child-1", "reviewer", 2);

      const children = manager.getChildren("root");

      expect(children).toHaveLength(2);
      expect(children.map((c) => c.id)).toContain("child-1");
      expect(children.map((c) => c.id)).toContain("child-2");
    });
  });

  describe("getRoot", () => {
    it("should return root agent", () => {
      manager.track("root", null, "coder", 0);
      manager.track("child", "root", "researcher", 1);
      manager.track("grandchild", "child", "analyst", 2);

      const root = manager.getRoot("grandchild");

      expect(root?.id).toBe("root");
    });

    it("should return self if already root", () => {
      manager.track("root", null, "coder", 0);

      const root = manager.getRoot("root");

      expect(root?.id).toBe("root");
    });
  });

  describe("stats", () => {
    it("should return correct stats", () => {
      manager.track("agent-1", null, "coder", 0);
      manager.track("agent-2", null, "researcher", 0);
      manager.track("agent-3", null, "analyst", 0);

      manager.updateStatus("agent-2", "completed");
      manager.updateStatus("agent-3", "failed");

      const stats = manager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe("clear and remove", () => {
    it("should remove a single agent", () => {
      manager.track("agent-1", null, "coder", 0);
      expect(manager.remove("agent-1")).toBe(true);
      expect(manager.get("agent-1")).toBeUndefined();
    });

    it("should clear all agents", () => {
      manager.track("agent-1", null, "coder", 0);
      manager.track("agent-2", null, "researcher", 0);
      manager.clear();

      expect(manager.getStats().total).toBe(0);
    });
  });
});
