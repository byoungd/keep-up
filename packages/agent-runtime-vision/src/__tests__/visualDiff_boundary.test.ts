import { describe, expect, it } from "vitest";
import type { LayoutGraph } from "../types";
import { diffLayoutGraphs } from "../visualDiff";

describe("visualDiff Boundary Conditions", () => {
  it("should handle empty graphs", () => {
    const empty: LayoutGraph = { nodes: [] };
    const result = diffLayoutGraphs(empty, empty);
    expect(result.summary.totalRegions).toBe(0);
    expect(result.regions).toEqual([]);
  });

  it("should handle duplicate node IDs in before graph", () => {
    const graph1: LayoutGraph = {
      nodes: [
        {
          id: "node1",
          type: "text",
          role: "label",
          text: "A",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 1,
        },
        {
          id: "node1",
          type: "text",
          role: "label",
          text: "B",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 1,
        },
      ],
    };
    const graph2: LayoutGraph = { nodes: [] };

    const result = diffLayoutGraphs(graph1, graph2);
    // Should only have 1 removed region because mapNodes takes the first one
    expect(result.summary.totalRegions).toBe(1);
    expect(result.regions[0].id).toBe("node1");
  });

  it("should handle invalid numerical values in bounds", () => {
    const graph1: LayoutGraph = {
      nodes: [
        {
          id: "node1",
          type: "text",
          role: "label",
          text: "A",
          bounds: { x: NaN, y: 0, width: 10, height: 10 },
          confidence: 1,
        },
      ],
    };
    const graph2: LayoutGraph = {
      nodes: [
        {
          id: "node1",
          type: "text",
          role: "label",
          text: "A",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 1,
        },
      ],
    };

    const result = diffLayoutGraphs(graph1, graph2);
    expect(result.regions[0].score).toBe(0); // clamp returns 0 for non-finite values
  });

  it("should handle zero weights", () => {
    const node = {
      id: "node1",
      type: "text",
      role: "label",
      text: "A",
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      confidence: 1,
    };
    const graph1: LayoutGraph = { nodes: [node] };
    const graph2: LayoutGraph = { nodes: [{ ...node, text: "B" }] };

    // Weights that sum to 0 should fall back to defaults
    const result = diffLayoutGraphs(graph1, graph2, {
      weights: { bounds: 0, text: 0, role: 0, type: 0 },
    });
    expect(result.regions[0].score).toBeGreaterThan(0);
  });
});
