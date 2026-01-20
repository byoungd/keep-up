import { describe, expect, it } from "vitest";
import type { LayoutGraph } from "../types";
import { diffLayoutGraphs } from "../visualDiff";

const emptyGraph = (): LayoutGraph => ({ nodes: [], edges: [] });

describe("diffLayoutGraphs", () => {
  it("marks added nodes", () => {
    const before = emptyGraph();
    const after: LayoutGraph = {
      nodes: [
        {
          id: "node-1",
          type: "text",
          bounds: { x: 0, y: 0, width: 50, height: 20 },
          confidence: 0.8,
          text: "Hello",
        },
      ],
      edges: [],
    };

    const report = diffLayoutGraphs(before, after);
    expect(report.regions).toHaveLength(1);
    expect(report.regions[0]?.changeType).toBe("added");
  });

  it("marks removed nodes", () => {
    const before: LayoutGraph = {
      nodes: [
        {
          id: "node-1",
          type: "text",
          bounds: { x: 0, y: 0, width: 50, height: 20 },
          confidence: 0.8,
          text: "Hello",
        },
      ],
      edges: [],
    };
    const after = emptyGraph();

    const report = diffLayoutGraphs(before, after);
    expect(report.regions).toHaveLength(1);
    expect(report.regions[0]?.changeType).toBe("removed");
  });

  it("marks modified nodes when bounds shift", () => {
    const before: LayoutGraph = {
      nodes: [
        {
          id: "node-1",
          type: "control",
          bounds: { x: 0, y: 0, width: 40, height: 20 },
          confidence: 0.7,
        },
      ],
      edges: [],
    };
    const after: LayoutGraph = {
      nodes: [
        {
          id: "node-1",
          type: "control",
          bounds: { x: 10, y: 0, width: 40, height: 20 },
          confidence: 0.7,
        },
      ],
      edges: [],
    };

    const report = diffLayoutGraphs(before, after);
    expect(report.regions).toHaveLength(1);
    expect(report.regions[0]?.changeType).toBe("modified");
    expect(report.regions[0]?.score).toBeGreaterThan(0);
  });

  it("computes summary max score", () => {
    const before = emptyGraph();
    const after: LayoutGraph = {
      nodes: [
        {
          id: "node-1",
          type: "text",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 1,
        },
        {
          id: "node-2",
          type: "text",
          bounds: { x: 20, y: 0, width: 10, height: 10 },
          confidence: 0.5,
        },
      ],
      edges: [],
    };

    const report = diffLayoutGraphs(before, after);
    expect(report.summary.totalRegions).toBe(2);
    expect(report.summary.maxScore).toBeGreaterThanOrEqual(report.regions[1]?.score ?? 0);
  });

  it("normalizes weight inputs", () => {
    const before: LayoutGraph = {
      nodes: [
        {
          id: "node-1",
          type: "text",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 0.7,
          text: "A",
        },
      ],
      edges: [],
    };
    const after: LayoutGraph = {
      nodes: [
        {
          id: "node-1",
          type: "text",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 0.7,
          text: "B",
        },
      ],
      edges: [],
    };

    const report = diffLayoutGraphs(before, after, {
      weights: { bounds: 2, text: 2, role: 2, type: 2 },
    });

    expect(report.regions[0]?.score).toBeGreaterThan(0);
    expect(report.regions[0]?.score).toBeLessThanOrEqual(1);
  });
});
