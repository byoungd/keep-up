/**
 * SOP Module Tests
 *
 * Tests for role registry, SOP executor, and phase-gated tool filtering.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { GateChecker, RoleDefinition, RoleRegistry } from "../sop";
import {
  ARCHITECT_SOP,
  CODER_SOP,
  createDefaultRoleRegistry,
  createRoleRegistry,
  createSOPExecutor,
  GateCheckFailedError,
  NoMorePhasesError,
  RESEARCHER_SOP,
  REVIEWER_SOP,
} from "../sop";

// ============================================================================
// RoleRegistry Tests
// ============================================================================

describe("RoleRegistry", () => {
  let registry: RoleRegistry;

  beforeEach(() => {
    registry = createRoleRegistry();
  });

  describe("register and get", () => {
    it("should register and retrieve a role", () => {
      registry.register(CODER_SOP);

      const role = registry.get("Coder");
      expect(role).toBeDefined();
      expect(role?.name).toBe("Coder");
      expect(role?.profile).toBe("Senior Software Engineer");
    });

    it("should return undefined for unknown role", () => {
      const role = registry.get("Unknown");
      expect(role).toBeUndefined();
    });

    it("should overwrite existing role with same name", () => {
      const customCoder: RoleDefinition = {
        ...CODER_SOP,
        goal: "Custom goal",
      };

      registry.register(CODER_SOP);
      registry.register(customCoder);

      const role = registry.get("Coder");
      expect(role?.goal).toBe("Custom goal");
    });
  });

  describe("list", () => {
    it("should list all registered role names", () => {
      registry.register(CODER_SOP);
      registry.register(RESEARCHER_SOP);

      const names = registry.list();
      expect(names).toHaveLength(2);
      expect(names).toContain("Coder");
      expect(names).toContain("Researcher");
    });

    it("should return empty array when no roles registered", () => {
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("has", () => {
    it("should return true for registered role", () => {
      registry.register(CODER_SOP);
      expect(registry.has("Coder")).toBe(true);
    });

    it("should return false for unregistered role", () => {
      expect(registry.has("Unknown")).toBe(false);
    });
  });

  describe("remove", () => {
    it("should remove a registered role", () => {
      registry.register(CODER_SOP);
      expect(registry.has("Coder")).toBe(true);

      const removed = registry.remove("Coder");
      expect(removed).toBe(true);
      expect(registry.has("Coder")).toBe(false);
    });

    it("should return false when removing non-existent role", () => {
      const removed = registry.remove("Unknown");
      expect(removed).toBe(false);
    });
  });

  describe("getAll", () => {
    it("should return all registered role definitions", () => {
      registry.register(CODER_SOP);
      registry.register(RESEARCHER_SOP);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.name)).toContain("Coder");
      expect(all.map((r) => r.name)).toContain("Researcher");
    });
  });

  describe("createDefaultRoleRegistry", () => {
    it("should create registry with all preset roles", () => {
      const defaultRegistry = createDefaultRoleRegistry();

      expect(defaultRegistry.has("Coder")).toBe(true);
      expect(defaultRegistry.has("Researcher")).toBe(true);
      expect(defaultRegistry.has("Reviewer")).toBe(true);
      expect(defaultRegistry.has("Architect")).toBe(true);
      expect(defaultRegistry.list()).toHaveLength(4);
    });
  });
});

// ============================================================================
// SOPExecutor Tests
// ============================================================================

describe("SOPExecutor", () => {
  describe("phase tracking", () => {
    it("should start at the first phase", () => {
      const executor = createSOPExecutor(CODER_SOP);

      expect(executor.getCurrentPhase()).toBe("understand");
      expect(executor.getPhaseIndex()).toBe(0);
    });

    it("should return allowed tools for current phase", () => {
      const executor = createSOPExecutor(CODER_SOP);

      const tools = executor.getAllowedTools();
      expect(tools).toEqual(["read_file", "search_code", "list_dir"]);
    });

    it("should advance through phases", async () => {
      const executor = createSOPExecutor(CODER_SOP);

      expect(executor.getCurrentPhase()).toBe("understand");

      await executor.advancePhase();
      expect(executor.getCurrentPhase()).toBe("plan");
      expect(executor.getAllowedTools()).toEqual(["read_file", "search_code"]);

      await executor.advancePhase();
      expect(executor.getCurrentPhase()).toBe("implement");
      expect(executor.getAllowedTools()).toEqual(["write_file", "read_file"]);

      await executor.advancePhase();
      expect(executor.getCurrentPhase()).toBe("verify");
      expect(executor.getAllowedTools()).toEqual(["run_command", "read_file"]);
    });

    it("should reset to first phase", async () => {
      const executor = createSOPExecutor(CODER_SOP);

      await executor.advancePhase();
      await executor.advancePhase();
      expect(executor.getCurrentPhase()).toBe("implement");

      executor.reset();
      expect(executor.getCurrentPhase()).toBe("understand");
      expect(executor.getPhaseIndex()).toBe(0);
    });
  });

  describe("isToolAllowed", () => {
    it("should allow tools in the current phase", () => {
      const executor = createSOPExecutor(CODER_SOP);

      expect(executor.isToolAllowed("read_file")).toBe(true);
      expect(executor.isToolAllowed("search_code")).toBe(true);
      expect(executor.isToolAllowed("list_dir")).toBe(true);
    });

    it("should deny tools not in the current phase", () => {
      const executor = createSOPExecutor(CODER_SOP);

      expect(executor.isToolAllowed("write_file")).toBe(false);
      expect(executor.isToolAllowed("run_command")).toBe(false);
    });

    it("should support wildcard matching", () => {
      const roleWithWildcard: RoleDefinition = {
        name: "TestRole",
        profile: "Test",
        goal: "Test",
        phases: [{ name: "test", allowedTools: ["file:*", "bash:execute"] }],
        qualityGates: [],
        maxReactLoop: 10,
      };

      const executor = createSOPExecutor(roleWithWildcard);

      expect(executor.isToolAllowed("file:read")).toBe(true);
      expect(executor.isToolAllowed("file:write")).toBe(true);
      expect(executor.isToolAllowed("file:delete")).toBe(true);
      expect(executor.isToolAllowed("bash:execute")).toBe(true);
      expect(executor.isToolAllowed("bash:other")).toBe(false);
    });

    it("should support global wildcard", () => {
      const roleWithGlobalWildcard: RoleDefinition = {
        name: "TestRole",
        profile: "Test",
        goal: "Test",
        phases: [{ name: "test", allowedTools: ["*"] }],
        qualityGates: [],
        maxReactLoop: 10,
      };

      const executor = createSOPExecutor(roleWithGlobalWildcard);

      expect(executor.isToolAllowed("anything")).toBe(true);
      expect(executor.isToolAllowed("file:read")).toBe(true);
    });
  });

  describe("quality gates", () => {
    it("should use default gate checker that always passes", async () => {
      const executor = createSOPExecutor(CODER_SOP);

      // Advance to implement phase (after which tests_exist gate is checked)
      await executor.advancePhase(); // understand -> plan
      await executor.advancePhase(); // plan -> implement

      // Can advance past implement phase with default checker
      const result = await executor.canAdvance();
      expect(result.passed).toBe(true);
    });

    it("should block advancement when quality gate fails", async () => {
      const failingChecker: GateChecker = async (gate) => ({
        passed: false,
        reason: `Gate ${gate.check} explicitly failed`,
      });

      const executor = createSOPExecutor(CODER_SOP, failingChecker);

      // Advance to implement phase
      await executor.advancePhase(); // understand -> plan
      await executor.advancePhase(); // plan -> implement

      // Should fail to advance due to tests_exist gate
      const result = await executor.canAdvance();
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("tests_exist");

      // advancePhase should throw
      await expect(executor.advancePhase()).rejects.toThrow(GateCheckFailedError);
    });

    it("should allow advancement when quality gate passes", async () => {
      const passingChecker: GateChecker = async () => ({ passed: true });

      const executor = createSOPExecutor(CODER_SOP, passingChecker);

      // Advance through all phases
      await executor.advancePhase(); // understand -> plan
      await executor.advancePhase(); // plan -> implement
      await executor.advancePhase(); // implement -> verify (passes tests_exist)
      await executor.advancePhase(); // verify -> complete (passes tests_pass)

      expect(executor.getCurrentPhase()).toBe("complete");
    });

    it("should check specific gates for each phase", async () => {
      const checkedGates: string[] = [];

      const trackingChecker: GateChecker = async (gate) => {
        checkedGates.push(gate.check);
        return { passed: true };
      };

      const executor = createSOPExecutor(CODER_SOP, trackingChecker);

      // Advance through all phases
      await executor.advancePhase(); // understand -> plan (no gates)
      await executor.advancePhase(); // plan -> implement (no gates)
      await executor.advancePhase(); // implement -> verify (tests_exist gate)
      await executor.advancePhase(); // verify -> complete (tests_pass gate)

      expect(checkedGates).toContain("tests_exist");
      expect(checkedGates).toContain("tests_pass");
    });
  });

  describe("isComplete", () => {
    it("should return false when not in final phase", () => {
      const executor = createSOPExecutor(CODER_SOP);
      expect(executor.isComplete()).toBe(false);
    });

    it("should return true when completed", async () => {
      const executor = createSOPExecutor(CODER_SOP);

      // Advance to completion
      await executor.advancePhase();
      await executor.advancePhase();
      await executor.advancePhase();
      await executor.advancePhase();

      expect(executor.getCurrentPhase()).toBe("complete");
      expect(executor.isComplete()).toBe(true);
    });

    it("should throw when trying to advance past final phase", async () => {
      const executor = createSOPExecutor(CODER_SOP);

      // Advance to completion
      await executor.advancePhase();
      await executor.advancePhase();
      await executor.advancePhase();
      await executor.advancePhase();

      await expect(executor.advancePhase()).rejects.toThrow(NoMorePhasesError);
    });
  });

  describe("getRole", () => {
    it("should return the role definition", () => {
      const executor = createSOPExecutor(CODER_SOP);

      const role = executor.getRole();
      expect(role.name).toBe("Coder");
      expect(role.phases).toHaveLength(4);
    });
  });
});

// ============================================================================
// Preset SOPs Tests
// ============================================================================

describe("Preset SOPs", () => {
  describe("CODER_SOP", () => {
    it("should have correct structure", () => {
      expect(CODER_SOP.name).toBe("Coder");
      expect(CODER_SOP.phases).toHaveLength(4);
      expect(CODER_SOP.qualityGates).toHaveLength(2);
      expect(CODER_SOP.maxReactLoop).toBe(15);
    });

    it("should have phases in correct order", () => {
      const phaseNames = CODER_SOP.phases.map((p) => p.name);
      expect(phaseNames).toEqual(["understand", "plan", "implement", "verify"]);
    });
  });

  describe("RESEARCHER_SOP", () => {
    it("should have correct structure", () => {
      expect(RESEARCHER_SOP.name).toBe("Researcher");
      expect(RESEARCHER_SOP.phases).toHaveLength(3);
      expect(RESEARCHER_SOP.qualityGates).toHaveLength(0);
      expect(RESEARCHER_SOP.maxReactLoop).toBe(10);
    });

    it("should have LLM-only synthesize phase", () => {
      const synthesizePhase = RESEARCHER_SOP.phases.find((p) => p.name === "synthesize");
      expect(synthesizePhase?.allowedTools).toEqual([]);
    });
  });

  describe("REVIEWER_SOP", () => {
    it("should have correct structure", () => {
      expect(REVIEWER_SOP.name).toBe("Reviewer");
      expect(REVIEWER_SOP.phases).toHaveLength(3);
      expect(REVIEWER_SOP.qualityGates).toHaveLength(0);
      expect(REVIEWER_SOP.maxReactLoop).toBe(8);
    });
  });

  describe("ARCHITECT_SOP", () => {
    it("should have correct structure", () => {
      expect(ARCHITECT_SOP.name).toBe("Architect");
      expect(ARCHITECT_SOP.phases).toHaveLength(3);
      expect(ARCHITECT_SOP.qualityGates).toHaveLength(1);
      expect(ARCHITECT_SOP.maxReactLoop).toBe(12);
    });

    it("should have diagram_exists gate after design phase", () => {
      const gate = ARCHITECT_SOP.qualityGates[0];
      expect(gate.after).toBe("design");
      expect(gate.check).toBe("diagram_exists");
    });
  });
});

// ============================================================================
// Integration Test
// ============================================================================

describe("SOP Integration", () => {
  it("should simulate a complete Coder workflow", async () => {
    const registry = createDefaultRoleRegistry();
    const coderRole = registry.get("Coder");
    if (!coderRole) {
      throw new Error("Coder role not found");
    }

    // Track gate checks and phase transitions
    const events: string[] = [];

    const gateChecker: GateChecker = async (gate) => {
      events.push(`gate_check:${gate.check}`);
      // Simulate tests exist and pass
      return { passed: true };
    };

    const executor = createSOPExecutor(coderRole, gateChecker);

    // Phase 1: Understand
    events.push(`phase:${executor.getCurrentPhase()}`);
    expect(executor.isToolAllowed("read_file")).toBe(true);
    expect(executor.isToolAllowed("write_file")).toBe(false);

    // Phase 2: Plan
    await executor.advancePhase();
    events.push(`phase:${executor.getCurrentPhase()}`);
    expect(executor.isToolAllowed("read_file")).toBe(true);
    expect(executor.isToolAllowed("write_file")).toBe(false);

    // Phase 3: Implement
    await executor.advancePhase();
    events.push(`phase:${executor.getCurrentPhase()}`);
    expect(executor.isToolAllowed("write_file")).toBe(true);
    expect(executor.isToolAllowed("run_command")).toBe(false);

    // Phase 4: Verify (passes tests_exist gate)
    await executor.advancePhase();
    events.push(`phase:${executor.getCurrentPhase()}`);
    expect(executor.isToolAllowed("run_command")).toBe(true);
    expect(executor.isToolAllowed("write_file")).toBe(false);

    // Phase 5: Complete (passes tests_pass gate)
    await executor.advancePhase();
    events.push(`phase:${executor.getCurrentPhase()}`);

    // Should be complete
    expect(executor.isComplete()).toBe(true);

    // Verify expected events
    expect(events).toEqual([
      "phase:understand",
      "phase:plan",
      "phase:implement",
      "gate_check:tests_exist",
      "phase:verify",
      "gate_check:tests_pass",
      "phase:complete",
    ]);
  });
});
