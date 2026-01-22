/**
 * Agent Mapping Tests
 */

import { describe, expect, it } from "vitest";
import {
  getCoreCapabilitiesForRuntime,
  isValidCoreAgentType,
  isValidRuntimeAgentType,
  mapCoreAgentToRuntime,
  mapRuntimeAgentToCore,
  runtimeAgentHasCapability,
} from "../../bridge/agentMapping";

describe("agentMapping", () => {
  describe("mapCoreAgentToRuntime", () => {
    it("maps writer to code", () => {
      expect(mapCoreAgentToRuntime("writer")).toBe("code");
    });

    it("maps editor to code", () => {
      expect(mapCoreAgentToRuntime("editor")).toBe("code");
    });

    it("maps reviewer to code-reviewer", () => {
      expect(mapCoreAgentToRuntime("reviewer")).toBe("code-reviewer");
    });

    it("maps translator to general", () => {
      expect(mapCoreAgentToRuntime("translator")).toBe("general");
    });

    it("maps researcher to research", () => {
      expect(mapCoreAgentToRuntime("researcher")).toBe("research");
    });

    it("maps orchestrator to plan", () => {
      expect(mapCoreAgentToRuntime("orchestrator")).toBe("plan");
    });

    it("maps custom to general", () => {
      expect(mapCoreAgentToRuntime("custom")).toBe("general");
    });
  });

  describe("mapRuntimeAgentToCore", () => {
    it("maps code to writer", () => {
      expect(mapRuntimeAgentToCore("code")).toBe("writer");
    });

    it("maps research to researcher", () => {
      expect(mapRuntimeAgentToCore("research")).toBe("researcher");
    });

    it("maps code-reviewer to reviewer", () => {
      expect(mapRuntimeAgentToCore("code-reviewer")).toBe("reviewer");
    });

    it("maps plan to orchestrator", () => {
      expect(mapRuntimeAgentToCore("plan")).toBe("orchestrator");
    });

    it("maps general to custom", () => {
      expect(mapRuntimeAgentToCore("general")).toBe("custom");
    });

    it("maps debugger to editor", () => {
      expect(mapRuntimeAgentToCore("debugger")).toBe("editor");
    });
  });

  describe("getCoreCapabilitiesForRuntime", () => {
    it("returns capabilities for code agent", () => {
      const caps = getCoreCapabilitiesForRuntime("code");
      expect(caps).toContain("generate_content");
      expect(caps).toContain("modify_content");
      expect(caps).toContain("delete_content");
    });

    it("returns capabilities for code-reviewer agent", () => {
      const caps = getCoreCapabilitiesForRuntime("code-reviewer");
      expect(caps).toContain("add_annotations");
      expect(caps).toContain("approve_suggestions");
    });

    it("returns capabilities for plan agent", () => {
      const caps = getCoreCapabilitiesForRuntime("plan");
      expect(caps).toContain("delegate_tasks");
    });
  });

  describe("runtimeAgentHasCapability", () => {
    it("returns true for valid capability", () => {
      expect(runtimeAgentHasCapability("code", "generate_content")).toBe(true);
    });

    it("returns false for invalid capability", () => {
      expect(runtimeAgentHasCapability("code", "delegate_tasks")).toBe(false);
    });
  });

  describe("isValidCoreAgentType", () => {
    it("returns true for valid types", () => {
      expect(isValidCoreAgentType("writer")).toBe(true);
      expect(isValidCoreAgentType("editor")).toBe(true);
      expect(isValidCoreAgentType("reviewer")).toBe(true);
    });

    it("returns false for invalid types", () => {
      expect(isValidCoreAgentType("invalid")).toBe(false);
      expect(isValidCoreAgentType(123)).toBe(false);
      expect(isValidCoreAgentType(null)).toBe(false);
    });
  });

  describe("isValidRuntimeAgentType", () => {
    it("returns true for valid types", () => {
      expect(isValidRuntimeAgentType("code")).toBe(true);
      expect(isValidRuntimeAgentType("research")).toBe(true);
      expect(isValidRuntimeAgentType("bash")).toBe(true);
    });

    it("returns false for invalid types", () => {
      expect(isValidRuntimeAgentType("invalid")).toBe(false);
      expect(isValidRuntimeAgentType(undefined)).toBe(false);
    });
  });
});
