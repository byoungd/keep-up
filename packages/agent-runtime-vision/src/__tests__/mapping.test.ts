import { describe, expect, it } from "vitest";
import { mapRegionToComponent } from "../mapping";
import type { LayoutGraph } from "../types";

describe("mapRegionToComponent", () => {
  it("selects the best overlapping node", () => {
    const graph: LayoutGraph = {
      nodes: [
        {
          id: "header",
          type: "container",
          bounds: { x: 0, y: 0, width: 200, height: 40 },
          confidence: 0.6,
          componentRef: {
            filePath: "src/components/Header.tsx",
            symbol: "Header",
            line: 10,
            column: 2,
          },
        },
        {
          id: "cta",
          type: "control",
          bounds: { x: 20, y: 10, width: 80, height: 24 },
          confidence: 0.9,
          componentRef: {
            filePath: "src/components/CTA.tsx",
            symbol: "CTAButton",
            line: 5,
            column: 1,
          },
        },
      ],
      edges: [],
    };

    const result = mapRegionToComponent(
      graph,
      { x: 22, y: 12, width: 60, height: 20 },
      {
        confidenceThreshold: 0.5,
      }
    );

    expect(result.componentRef?.filePath).toBe("src/components/CTA.tsx");
    expect(result.autoApply).toBe(true);
  });

  it("returns zero confidence when no component matches", () => {
    const graph: LayoutGraph = {
      nodes: [
        {
          id: "container",
          type: "container",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          confidence: 0.4,
        },
      ],
      edges: [],
    };

    const result = mapRegionToComponent(graph, { x: 10, y: 10, width: 20, height: 20 });

    expect(result.confidence).toBe(0);
    expect(result.autoApply).toBe(false);
  });
});
