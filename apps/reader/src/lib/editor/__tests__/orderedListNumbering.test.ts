import { pmSchema } from "@ku0/lfcc-bridge";
import { describe, expect, it } from "vitest";

import { buildOrderedListNumbering } from "../orderedListNumberingPlugin";

const createOrderedNode = (id: string, text: string, indentLevel = 0) =>
  pmSchema.nodes.paragraph.create(
    { block_id: id, list_type: "ordered", indent_level: indentLevel },
    pmSchema.text(text)
  );

describe("orderedListNumbering", () => {
  it("numbers ordered list items per indent level", () => {
    const doc = pmSchema.nodes.doc.create(null, [
      createOrderedNode("b1", "One"),
      createOrderedNode("b2", "Two"),
      createOrderedNode("b3", "Three", 1),
      createOrderedNode("b4", "Four"),
      createOrderedNode("b5", "Five", 1),
    ]);

    const numbering = buildOrderedListNumbering(doc);

    expect(numbering.get("b1")).toBe(1);
    expect(numbering.get("b2")).toBe(2);
    expect(numbering.get("b4")).toBe(3);
    expect(numbering.get("b3")).toBe(1);
    expect(numbering.get("b5")).toBe(2);
  });

  it("builds numbering for 1k items quickly", () => {
    const items = Array.from({ length: 1000 }, (_, index) =>
      createOrderedNode(`b-${index}`, `Item ${index + 1}`)
    );
    const doc = pmSchema.nodes.doc.create(null, items);

    const now = typeof performance !== "undefined" ? performance.now.bind(performance) : Date.now;
    const start = now();
    const numbering = buildOrderedListNumbering(doc);
    const durationMs = now() - start;

    expect(numbering.get("b-0")).toBe(1);
    expect(numbering.get("b-999")).toBe(1000);
    expect(durationMs).toBeLessThan(100);
  });
});
