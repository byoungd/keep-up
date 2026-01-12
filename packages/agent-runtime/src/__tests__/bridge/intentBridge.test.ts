/**
 * Intent Bridge Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { type IntentBridge, createIntentBridge } from "../../bridge/intentBridge";

describe("intentBridge", () => {
  let bridge: IntentBridge;

  beforeEach(() => {
    bridge = createIntentBridge();
  });

  describe("createIntentForAction", () => {
    it("creates intent with correct category for generate action", () => {
      const intent = bridge.createIntentForAction("code", "generate", "Generate new function");

      expect(intent.category).toBe("content_creation");
      expect(intent.description.short).toBe("Generate new function");
      expect(intent.structured.action).toBe("generate");
    });

    it("creates intent with correct category for edit action", () => {
      const intent = bridge.createIntentForAction("code", "edit", "Edit existing code");

      expect(intent.category).toBe("content_modification");
    });

    it("creates intent with correct category for review action", () => {
      const intent = bridge.createIntentForAction("code-reviewer", "review", "Review code changes");

      expect(intent.category).toBe("review_feedback");
    });

    it("creates intent with correct category for restructure action", () => {
      const intent = bridge.createIntentForAction(
        "code",
        "restructure",
        "Reorganize file structure"
      );

      expect(intent.category).toBe("structure_change");
    });

    it("includes user context when provided", () => {
      const intent = bridge.createIntentForAction("code", "generate", "Generate function", {
        userRequest: "Create a helper function",
        sessionId: "session-123",
      });

      expect(intent.user_context?.original_request).toBe("Create a helper function");
      expect(intent.user_context?.session_id).toBe("session-123");
    });

    it("includes constraints when provided", () => {
      const intent = bridge.createIntentForAction("code", "generate", "Generate function", {
        constraints: { language: "typescript", maxLines: 50 },
      });

      expect(intent.structured.constraints?.language).toBe("typescript");
    });

    it("generates unique intent IDs", () => {
      const intent1 = bridge.createIntentForAction("code", "generate", "First");
      const intent2 = bridge.createIntentForAction("code", "generate", "Second");

      expect(intent1.id).not.toBe(intent2.id);
    });
  });

  describe("createChainedIntent", () => {
    it("creates chained intent with parent reference", () => {
      const parent = bridge.createIntentForAction("code", "generate", "Parent");
      const child = bridge.createChainedIntent(parent, "code", "refactor", "Child step", 1, 3);

      expect(child.chain?.parent_intent_id).toBe(parent.id);
      expect(child.chain?.step_index).toBe(1);
      expect(child.chain?.total_steps).toBe(3);
    });

    it("preserves parent agent_id", () => {
      const parent = bridge.createIntentForAction("code", "generate", "Parent");
      const child = bridge.createChainedIntent(
        parent,
        "research",
        "research",
        "Research step",
        0,
        2
      );

      expect(child.agent_id).toBe(parent.agent_id);
    });
  });

  describe("getRegistry", () => {
    it("returns the intent registry", () => {
      const registry = bridge.getRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry.registerIntent).toBe("function");
    });

    it("intents are registered in the registry", () => {
      const intent = bridge.createIntentForAction("code", "generate", "Test");
      const registry = bridge.getRegistry();
      const retrieved = registry.getIntent(intent.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(intent.id);
    });
  });

  describe("action to category mapping", () => {
    const actionCategoryMap = [
      ["create", "content_creation"],
      ["write", "content_creation"],
      ["draft", "content_creation"],
      ["modify", "content_modification"],
      ["update", "content_modification"],
      ["fix", "content_modification"],
      ["reorganize", "structure_change"],
      ["move", "structure_change"],
      ["split", "structure_change"],
      ["merge", "structure_change"],
      ["improve", "quality_improvement"],
      ["optimize", "quality_improvement"],
      ["polish", "quality_improvement"],
      ["format", "quality_improvement"],
      ["comment", "review_feedback"],
      ["suggest", "review_feedback"],
      ["validate", "review_feedback"],
      ["delegate", "collaboration"],
      ["handoff", "collaboration"],
      ["coordinate", "collaboration"],
    ];

    it.each(actionCategoryMap)("maps action '%s' to category '%s'", (action, expectedCategory) => {
      const intent = bridge.createIntentForAction("code", action, "Test");
      expect(intent.category).toBe(expectedCategory);
    });

    it("defaults unknown actions to content_modification", () => {
      const intent = bridge.createIntentForAction("code", "unknown_action", "Test");
      expect(intent.category).toBe("content_modification");
    });
  });
});
