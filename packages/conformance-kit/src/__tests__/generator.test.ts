/**
 * LFCC Conformance Kit - Generator Tests
 */

import { describe, expect, it } from "vitest";
import { MockLoroAdapter } from "../adapters/mock";
import {
  DEFAULT_GEN_CONFIG,
  exportProgram,
  generateProgram,
  importProgram,
} from "../op-fuzzer/generator";
import { deserializeOps, getOpCategory, serializeOps } from "../op-fuzzer/types";

describe("Generator", () => {
  describe("generateProgram", () => {
    it("should generate deterministic programs", () => {
      const adapter1 = new MockLoroAdapter();
      const adapter2 = new MockLoroAdapter();

      adapter1.addBlock("paragraph", "Hello world");
      adapter2.addBlock("paragraph", "Hello world");

      const ops1 = generateProgram(42, 10, DEFAULT_GEN_CONFIG, adapter1);
      const ops2 = generateProgram(42, 10, DEFAULT_GEN_CONFIG, adapter2);

      expect(ops1).toEqual(ops2);
    });

    it("should generate specified number of steps", () => {
      const adapter = new MockLoroAdapter();
      adapter.addBlock("paragraph", "Hello world");
      adapter.addBlock("paragraph", "Another paragraph");

      const ops = generateProgram(42, 20, DEFAULT_GEN_CONFIG, adapter);
      expect(ops.length).toBeLessThanOrEqual(20);
      expect(ops.length).toBeGreaterThan(0);
    });

    it("should generate valid operations", () => {
      const adapter = new MockLoroAdapter();
      adapter.addBlock("paragraph", "Hello world");

      const ops = generateProgram(42, 50, DEFAULT_GEN_CONFIG, adapter);

      for (const op of ops) {
        expect(op.type).toBeDefined();
        const category = getOpCategory(op);
        expect(["text", "mark", "structural", "table", "history"]).toContain(category);
      }
    });

    it("should respect stress mode", () => {
      const adapter = new MockLoroAdapter();
      adapter.addBlock("paragraph", "Hello world");

      const config = { ...DEFAULT_GEN_CONFIG, stressMode: "typingBurst" as const };
      const ops = generateProgram(42, 50, config, adapter);

      // Typing burst should have mostly text operations
      const textOps = ops.filter((op) => getOpCategory(op) === "text");
      expect(textOps.length).toBeGreaterThan(ops.length * 0.5);
    });
  });

  describe("exportProgram / importProgram", () => {
    it("should round-trip program", () => {
      const adapter = new MockLoroAdapter();
      adapter.addBlock("paragraph", "Hello");

      const ops = generateProgram(42, 10, DEFAULT_GEN_CONFIG, adapter);
      const exported = exportProgram(42, 10, DEFAULT_GEN_CONFIG, ops);
      const imported = importProgram(exported);

      expect(imported.seed).toBe(42);
      expect(imported.steps).toBe(10);
      expect(imported.ops).toEqual(ops);
    });
  });

  describe("serializeOps / deserializeOps", () => {
    it("should round-trip ops", () => {
      const ops = [
        { type: "InsertText" as const, blockId: "b1", offset: 0, text: "Hello" },
        { type: "DeleteText" as const, blockId: "b1", offset: 0, length: 2 },
        { type: "AddMark" as const, blockId: "b1", from: 0, to: 3, markType: "bold" },
      ];

      const json = serializeOps(ops);
      const restored = deserializeOps(json);

      expect(restored).toEqual(ops);
    });
  });

  describe("getOpCategory", () => {
    it("should categorize text operations", () => {
      expect(getOpCategory({ type: "InsertText", blockId: "", offset: 0, text: "" })).toBe("text");
      expect(getOpCategory({ type: "DeleteText", blockId: "", offset: 0, length: 0 })).toBe("text");
    });

    it("should categorize mark operations", () => {
      expect(
        getOpCategory({ type: "AddMark", blockId: "", from: 0, to: 1, markType: "bold" })
      ).toBe("mark");
      expect(
        getOpCategory({ type: "RemoveMark", blockId: "", from: 0, to: 1, markType: "bold" })
      ).toBe("mark");
    });

    it("should categorize structural operations", () => {
      expect(getOpCategory({ type: "SplitBlock", blockId: "", offset: 0 })).toBe("structural");
      expect(getOpCategory({ type: "JoinWithPrev", blockId: "" })).toBe("structural");
      expect(getOpCategory({ type: "ReorderBlock", blockId: "", targetIndex: 0 })).toBe(
        "structural"
      );
    });

    it("should categorize history operations", () => {
      expect(getOpCategory({ type: "Undo" })).toBe("history");
      expect(getOpCategory({ type: "Redo" })).toBe("history");
    });
  });
});
