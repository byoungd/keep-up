import { describe, expect, it } from "vitest";
import { buildLayoutGraph } from "../layoutGraph";

describe("buildLayoutGraph", () => {
  it("normalizes bounds to integers", () => {
    const graph = buildLayoutGraph({
      nodes: [
        {
          id: "node-1",
          bounds: { x: 10.2, y: 5.8, width: 100.6, height: 20.4 },
        },
      ],
      includeAdjacencyEdges: false,
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.bounds).toEqual({ x: 10, y: 6, width: 101, height: 20 });
  });

  it("classifies node types from roles and text", () => {
    const graph = buildLayoutGraph({
      nodes: [
        {
          id: "control",
          bounds: { x: 0, y: 0, width: 40, height: 20 },
          role: "button",
        },
        {
          id: "image",
          bounds: { x: 50, y: 0, width: 40, height: 20 },
          role: "img",
        },
        {
          id: "text",
          bounds: { x: 0, y: 30, width: 80, height: 20 },
          text: "Hello",
        },
        {
          id: "container",
          bounds: { x: 0, y: 60, width: 80, height: 40 },
        },
      ],
      includeAdjacencyEdges: false,
    });

    const types = graph.nodes.reduce<Record<string, string>>((acc, node) => {
      acc[node.id] = node.type;
      return acc;
    }, {});

    expect(types.control).toBe("control");
    expect(types.image).toBe("image");
    expect(types.text).toBe("text");
    expect(types.container).toBe("container");
  });

  it("creates containment edges for nested nodes", () => {
    const graph = buildLayoutGraph({
      nodes: [
        {
          id: "outer",
          bounds: { x: 0, y: 0, width: 200, height: 200 },
        },
        {
          id: "inner",
          bounds: { x: 40, y: 40, width: 50, height: 50 },
        },
      ],
      includeAdjacencyEdges: false,
    });

    expect(graph.edges).toEqual([{ from: "outer", to: "inner", type: "contains" }]);
  });

  it("creates adjacency edges for nearby siblings", () => {
    const graph = buildLayoutGraph({
      nodes: [
        {
          id: "left",
          bounds: { x: 0, y: 0, width: 40, height: 20 },
        },
        {
          id: "right",
          bounds: { x: 45, y: 0, width: 40, height: 20 },
        },
      ],
      adjacencyThreshold: 8,
    });

    expect(graph.edges).toContainEqual({ from: "left", to: "right", type: "adjacent" });
  });

  it("adds OCR blocks as text nodes", () => {
    const graph = buildLayoutGraph({
      ocrBlocks: [
        {
          id: "ocr-1",
          text: "Sign in",
          bounds: { x: 12, y: 24, width: 90, height: 18 },
          confidence: 0.9,
        },
      ],
      includeAdjacencyEdges: false,
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: "ocr-1",
      type: "text",
      text: "Sign in",
      confidence: 0.9,
    });
  });
});
