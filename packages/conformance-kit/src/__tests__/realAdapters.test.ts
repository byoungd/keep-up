/**
 * LFCC Conformance Kit - Real Adapters
 */

import { describe, expect, it } from "vitest";
import { RealAdapterFactory } from "../adapters/real";
import { DoubleBlindHarness } from "../double-blind/harness";
import type { FuzzOp } from "../op-fuzzer/types";

describe("Real adapters", () => {
  it("should converge on a basic edit sequence", async () => {
    const factory = new RealAdapterFactory();
    const loro = factory.createLoroAdapter();
    const shadow = factory.createShadowAdapter();
    const canonicalizer = factory.createCanonicalizerAdapter();

    const snapshot = loro.exportSnapshot();
    shadow.loadSnapshot(snapshot);

    const harness = new DoubleBlindHarness(loro, shadow, canonicalizer, {
      checkpointPolicy: "everyStep",
    });

    const ops: FuzzOp[] = [
      { type: "InsertText", blockId: "block-1", offset: 5, text: "!" },
      { type: "DeleteText", blockId: "block-1", offset: 0, length: 1 },
      { type: "SplitBlock", blockId: "block-1", offset: 4 },
      { type: "ReorderBlock", blockId: "block-2", targetIndex: 0 },
    ];

    const result = await harness.run(101, ops, snapshot);
    expect(result.passed).toBe(true);
  });
});
