/**
 * LFCC v0.9 RC - Transaction Classification Tests
 * @see docs/product/Audit/phase6/TASK_PROMPT_LFCC_CONFORMANCE_BASELINE.md D4
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type TransactionInput,
  classifyTransaction,
  resetTxnCounter,
} from "../shadow/classifyTransaction.js";

describe("Transaction Classification (D4)", () => {
  beforeEach(() => {
    resetTxnCounter();
  });

  describe("Determinism", () => {
    it("should produce same results for same input", () => {
      const input: TransactionInput = {
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 0,
            to: 0,
            insertedText: "hello",
            deletedLength: 0,
          },
        ],
        seed: 42,
      };

      const result1 = classifyTransaction(input);
      resetTxnCounter();
      const result2 = classifyTransaction(input);

      expect(result1.opCodes).toEqual(result2.opCodes);
      expect(result1.touchedBlocks).toEqual(result2.touchedBlocks);
      expect(result1.txnIndex).toEqual(result2.txnIndex);
    });

    it("should produce deterministic txnIndex with seed", () => {
      const input: TransactionInput = {
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 0,
            to: 5,
            insertedText: "",
            deletedLength: 5,
          },
        ],
        seed: 123,
      };

      const result1 = classifyTransaction(input);
      const result2 = classifyTransaction(input);

      expect(result1.txnIndex).toBe(result2.txnIndex);
    });
  });

  describe("Op Code Classification", () => {
    it("should classify text insert as OP_TEXT_EDIT", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 0,
            to: 0,
            insertedText: "hello",
            deletedLength: 0,
          },
        ],
      });

      expect(result.opCodes).toContain("OP_TEXT_EDIT");
    });

    it("should classify mark add as OP_MARK_EDIT", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "addMark",
            affectedBlockIds: ["block1"],
            from: 0,
            to: 5,
            markType: "bold",
          },
        ],
      });

      expect(result.opCodes).toContain("OP_MARK_EDIT");
    });

    it("should classify enter key (newline) as OP_BLOCK_SPLIT", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1", "block2"],
            from: 5,
            to: 5,
            insertedText: "\n",
            deletedLength: 0,
          },
        ],
      });

      expect(result.opCodes).toContain("OP_BLOCK_SPLIT");
    });

    it("should classify undo/redo as OP_HISTORY_RESTORE", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 0,
            to: 0,
            insertedText: "",
            deletedLength: 0,
          },
        ],
        isUndo: true,
      });

      expect(result.opCodes).toContain("OP_HISTORY_RESTORE");
    });
  });

  describe("Touched Blocks", () => {
    it("should collect all affected block IDs", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 0,
            to: 5,
            insertedText: "a",
          },
          {
            type: "addMark",
            affectedBlockIds: ["block2"],
            from: 0,
            to: 3,
            markType: "italic",
          },
        ],
      });

      expect(result.touchedBlocks).toContain("block1");
      expect(result.touchedBlocks).toContain("block2");
    });

    it("should sort touched blocks for determinism", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["zebra"],
            from: 0,
            to: 0,
            insertedText: "a",
          },
          {
            type: "replace",
            affectedBlockIds: ["alpha"],
            from: 0,
            to: 0,
            insertedText: "b",
          },
        ],
      });

      expect(result.touchedBlocks).toEqual(["alpha", "zebra"]);
    });
  });

  describe("Touched Ranges", () => {
    it("should track touched ranges within blocks", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 5,
            to: 10,
            insertedText: "x",
          },
        ],
      });

      expect(result.touchedRanges?.get("block1")).toEqual({
        start: 5,
        end: 10,
      });
    });

    it("should merge overlapping ranges", () => {
      const result = classifyTransaction({
        steps: [
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 5,
            to: 10,
            insertedText: "x",
          },
          {
            type: "replace",
            affectedBlockIds: ["block1"],
            from: 8,
            to: 15,
            insertedText: "y",
          },
        ],
      });

      expect(result.touchedRanges?.get("block1")).toEqual({
        start: 5,
        end: 15,
      });
    });
  });
});
