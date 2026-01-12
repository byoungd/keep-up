import { describe, expect, it } from "vitest";

import { createAnnotationRepo } from "../annotations/annotationRepo";
import { createLoroRuntime } from "../runtime/loroRuntime";

describe("AnnotationRepo replication", () => {
  it("replicates annotations across replicas", () => {
    const runtimeA = createLoroRuntime({ peerId: "1" });
    const runtimeB = createLoroRuntime({ peerId: "2" });

    const repoA = createAnnotationRepo(runtimeA);
    const repoB = createAnnotationRepo(runtimeB);

    repoA.create({
      annotationId: "ann-1",
      kind: "highlight",
      createdAtMs: 1,
      updatedAtMs: 1,
      spanList: [{ blockId: "b1", start: 0, end: 3 }],
      chainPolicy: { mode: "required_order" },
      verificationState: "active",
      content: "Test",
      color: "yellow",
    });

    const snapshot = runtimeA.doc.export({ mode: "snapshot" });
    runtimeB.doc.import(snapshot);

    const listB = repoB.list();
    expect(listB).toHaveLength(1);
    expect(listB[0]?.annotationId).toBe("ann-1");
    expect(listB[0]?.content).toBe("Test");
    expect(listB[0]?.spanList[0]?.blockId).toBe("b1");
  });
});
