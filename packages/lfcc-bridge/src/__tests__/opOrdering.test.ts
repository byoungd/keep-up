import { describe, expect, it, vi } from "vitest";

import {
  type StructuralOp,
  buildStructuralOpsFromDirtyInfo,
  mergeAndOrderStructuralOps,
} from "../bridge/opOrdering";

describe("bridge op ordering helper", () => {
  it("orders structural ops deterministically and drops later conflicts", () => {
    const log = vi.fn();
    const local: StructuralOp[] = [
      { opCode: "OP_BLOCK_JOIN", blockId: "b1", timestamp: 2, source: "local" },
    ];
    const remote: StructuralOp[] = [
      { opCode: "OP_BLOCK_SPLIT", blockId: "b1", timestamp: 1, source: "remote" },
    ];

    const result = mergeAndOrderStructuralOps(local, remote, (event, data) => log(event, data));

    expect(result.ordered.map((op) => op.opCode)).toEqual(["OP_BLOCK_SPLIT"]);
    expect(result.dropped).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(log).toHaveBeenCalled();
  });

  it("builds structural ops per touched block from DirtyInfo", () => {
    let clock = 0;
    const ops = buildStructuralOpsFromDirtyInfo(
      {
        opCodes: ["OP_BLOCK_SPLIT", "OP_TEXT_EDIT"],
        touchedBlocks: ["b1", "b2"],
      },
      "local",
      () => ++clock
    );

    expect(ops).toHaveLength(2);
    expect(ops.map((op) => op.blockId).sort()).toEqual(["b1", "b2"]);
    expect(ops.every((op) => op.source === "local")).toBe(true);
    expect(ops.map((op) => op.timestamp)).toEqual([1, 2]);
  });
});
