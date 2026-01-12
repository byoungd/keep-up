/**
 * LFCC v0.9 RC - Divergence Detection Hardening Tests
 * @see docs/product/Audit/enhance/Parallel_TaskPrompts_Robustness_Gap_P0P2_TwoAgents.md
 *
 * Regression tests for false negatives in divergence detection.
 */

import { LoroDoc } from "loro-crdt";
import type { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DivergenceDetector, createDivergenceDetector } from "../integrity/divergence";
import { pmSchema } from "../pm/pmSchema";

describe("DivergenceDetector Hardening", () => {
  let detector: DivergenceDetector;
  let loroDoc: LoroDoc;
  let schema: Schema;

  beforeEach(() => {
    loroDoc = new LoroDoc();
    schema = pmSchema;
  });

  describe("Marks Detection (P1.1)", () => {
    it("should detect divergence: same text, different marks", () => {
      const onDivergence = vi.fn();
      detector = createDivergenceDetector({
        onDivergence,
        enablePeriodicChecks: false,
      });

      // Editor: "Hello" with bold mark
      const editorState = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", { block_id: "b1" }, [
            schema.text("Hello", [schema.mark("bold")]),
          ]),
        ]),
        schema,
      });

      // Loro: "Hello" without marks (empty doc means different structure)
      const result = detector.checkDivergence(editorState, loroDoc, schema);

      // Should detect divergence because marks differ
      expect(result.diverged).toBe(true);
      expect(onDivergence).toHaveBeenCalled();
    });

    it("should detect divergence: same text length, different mark positions", () => {
      const onDivergence = vi.fn();
      detector = createDivergenceDetector({
        onDivergence,
        enablePeriodicChecks: false,
      });

      // Editor: "Hello World" with bold on first word only
      const editorState1 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", { block_id: "b1" }, [
            schema.text("Hello", [schema.mark("bold")]),
            schema.text(" World"),
          ]),
        ]),
        schema,
      });

      // Same text length but marks at different positions
      const editorState2 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", { block_id: "b1" }, [
            schema.text("Hello "),
            schema.text("World", [schema.mark("bold")]),
          ]),
        ]),
        schema,
      });

      // Compute checksums for both states
      const result1 = detector.checkDivergence(editorState1, loroDoc, schema);
      const result2 = detector.checkDivergence(editorState2, loroDoc, schema);

      // Checksums should be different due to different mark positions
      expect(result1.editorChecksum).not.toBe(result2.editorChecksum);
    });
  });

  describe("Attrs Detection (P1.1)", () => {
    it("should detect divergence: same blockId, different attrs", () => {
      const onDivergence = vi.fn();
      detector = createDivergenceDetector({
        onDivergence,
        enablePeriodicChecks: false,
      });

      // Editor with heading level 1
      const editorState1 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("heading", { block_id: "b1", level: 1 }, [schema.text("Title")]),
        ]),
        schema,
      });

      // Editor with heading level 2
      const editorState2 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("heading", { block_id: "b1", level: 2 }, [schema.text("Title")]),
        ]),
        schema,
      });

      const result1 = detector.checkDivergence(editorState1, loroDoc, schema);
      const result2 = detector.checkDivergence(editorState2, loroDoc, schema);

      // Different attrs should produce different checksums
      expect(result1.editorChecksum).not.toBe(result2.editorChecksum);
    });
  });

  describe("Block Order Detection (P1.1)", () => {
    it("should detect divergence: same blocks, different order", () => {
      const onDivergence = vi.fn();
      detector = createDivergenceDetector({
        onDivergence,
        enablePeriodicChecks: false,
      });

      // Order: b1, b2
      const editorState1 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", { block_id: "b1" }, [schema.text("First")]),
          schema.node("paragraph", { block_id: "b2" }, [schema.text("Second")]),
        ]),
        schema,
      });

      // Order: b2, b1 (reordered)
      const editorState2 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", { block_id: "b2" }, [schema.text("Second")]),
          schema.node("paragraph", { block_id: "b1" }, [schema.text("First")]),
        ]),
        schema,
      });

      const result1 = detector.checkDivergence(editorState1, loroDoc, schema);
      const result2 = detector.checkDivergence(editorState2, loroDoc, schema);

      // Reordered blocks should produce different checksums
      expect(result1.editorChecksum).not.toBe(result2.editorChecksum);
    });
  });

  describe("Structure Detection (P1.1)", () => {
    it("should detect divergence: same text, different node types", () => {
      const onDivergence = vi.fn();
      detector = createDivergenceDetector({
        onDivergence,
        enablePeriodicChecks: false,
      });

      // Paragraph node
      const editorState1 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", { block_id: "b1" }, [schema.text("Content")]),
        ]),
        schema,
      });

      // Heading node with same text
      const editorState2 = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("heading", { block_id: "b1", level: 1 }, [schema.text("Content")]),
        ]),
        schema,
      });

      const result1 = detector.checkDivergence(editorState1, loroDoc, schema);
      const result2 = detector.checkDivergence(editorState2, loroDoc, schema);

      // Different node types should produce different checksums
      expect(result1.editorChecksum).not.toBe(result2.editorChecksum);
    });
  });

  describe("Callback Invocation (P2.2)", () => {
    it("should invoke onDivergence callback when divergence detected", () => {
      const onDivergence = vi.fn();
      detector = createDivergenceDetector({
        onDivergence,
        enablePeriodicChecks: false,
      });

      const editorState = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", { block_id: "b1" }, [schema.text("Hello")]),
        ]),
        schema,
      });

      // Empty Loro doc = divergence
      const result = detector.checkDivergence(editorState, loroDoc, schema);

      expect(result.diverged).toBe(true);
      expect(onDivergence).toHaveBeenCalledTimes(1);
      expect(onDivergence).toHaveBeenCalledWith(
        expect.objectContaining({
          diverged: true,
          editorChecksum: expect.any(String),
          loroChecksum: expect.any(String),
        })
      );
    });
  });
});
