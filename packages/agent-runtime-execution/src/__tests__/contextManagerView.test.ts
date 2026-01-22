/**
 * Context Manager View Tests
 */

import { describe, expect, it } from "vitest";
import { createContextManager } from "../context";

describe("ContextManager views", () => {
  it("reflects parent updates with overlay writes", () => {
    const manager = createContextManager();
    const parent = manager.create({ workingDirectory: "/workspace" });

    manager.updateScratchpad(parent.id, "base", "replace");
    manager.addFact(parent.id, {
      type: "decision",
      content: "parent fact",
      source: "parent",
      confidence: "high",
    });

    const view = manager.createView(parent.id);

    manager.updateScratchpad(parent.id, "parent update", "append");
    manager.addFact(parent.id, {
      type: "decision",
      content: "parent update fact",
      source: "parent",
      confidence: "high",
    });

    manager.updateScratchpad(view.id, "child update", "append");
    manager.addFact(view.id, {
      type: "decision",
      content: "child fact",
      source: "child",
      confidence: "high",
    });
    manager.touchFile(view.id, "child.txt");

    const snapshot = manager.get(view.id);
    expect(snapshot?.scratchpad).toContain("base");
    expect(snapshot?.scratchpad).toContain("parent update");
    expect(snapshot?.scratchpad).toContain("child update");
    expect(snapshot?.facts.map((fact) => fact.content)).toEqual(
      expect.arrayContaining(["parent fact", "parent update fact", "child fact"])
    );
    expect(snapshot?.touchedFiles.has("child.txt")).toBe(true);
  });

  it("merges view overlays into the parent", () => {
    const manager = createContextManager();
    const parent = manager.create();

    manager.updateScratchpad(parent.id, "base", "replace");

    const view = manager.createView(parent.id);
    manager.updateScratchpad(view.id, "child update", "append");
    manager.addFact(view.id, {
      type: "decision",
      content: "child fact",
      source: "child",
      confidence: "high",
    });

    manager.disposeView(view.id, true);

    const parentSnapshot = manager.get(parent.id);
    expect(parentSnapshot?.scratchpad).toContain("child update");
    expect(parentSnapshot?.facts.map((fact) => fact.content)).toContain("child fact");
  });
});
