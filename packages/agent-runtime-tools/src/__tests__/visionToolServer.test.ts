import type { ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { VisionToolServer } from "../tools/vision";

describe("VisionToolServer", () => {
  const context: ToolContext = {
    security: {
      sandbox: { ...SECURITY_PRESETS.safe.sandbox },
      permissions: { ...SECURITY_PRESETS.safe.permissions },
      limits: { ...SECURITY_PRESETS.safe.limits },
    },
  };

  it("returns a layout graph from layout_scan", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "layout_scan",
        arguments: {
          nodes: [
            {
              id: "node-1",
              bounds: { x: 0, y: 0, width: 40, height: 20 },
              text: "Hello",
            },
          ],
        },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    const payload = JSON.parse((result.content[0] as { type: "text"; text: string }).text) as {
      nodes: unknown[];
    };
    expect(payload.nodes).toHaveLength(1);
  });

  it("returns a visual diff report", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "visual_diff",
        arguments: {
          before: {
            nodes: [
              {
                id: "node-1",
                type: "text",
                bounds: { x: 0, y: 0, width: 40, height: 20 },
                confidence: 0.8,
              },
            ],
            edges: [],
          },
          after: {
            nodes: [
              {
                id: "node-1",
                type: "text",
                bounds: { x: 0, y: 0, width: 50, height: 20 },
                confidence: 0.8,
              },
            ],
            edges: [],
          },
        },
      },
      context
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse((result.content[0] as { type: "text"; text: string }).text) as {
      summary: { totalRegions: number };
    };
    expect(payload.summary.totalRegions).toBe(1);
  });

  it("maps regions to component refs", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "map_region",
        arguments: {
          layoutGraph: {
            nodes: [
              {
                id: "node-1",
                type: "control",
                bounds: { x: 0, y: 0, width: 100, height: 40 },
                confidence: 0.9,
                componentRef: {
                  filePath: "src/components/Button.tsx",
                  symbol: "Button",
                  line: 12,
                  column: 2,
                },
              },
            ],
            edges: [],
          },
          region: { x: 10, y: 5, width: 30, height: 20 },
          confidenceThreshold: 0.5,
        },
      },
      context
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse((result.content[0] as { type: "text"; text: string }).text) as {
      autoApply: boolean;
    };
    expect(payload.autoApply).toBe(true);
  });

  it("rejects layout_scan nodes with invalid bounds", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "layout_scan",
        arguments: {
          nodes: [
            {
              id: "node-1",
              bounds: { x: 0, y: 0, width: 0, height: 20 },
              text: "Hello",
            },
          ],
        },
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects layout_scan nodes with invalid confidence", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "layout_scan",
        arguments: {
          nodes: [
            {
              id: "node-1",
              bounds: { x: 0, y: 0, width: 40, height: 20 },
              confidence: 1.5,
            },
          ],
        },
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects visual_diff inputs with invalid weights", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "visual_diff",
        arguments: {
          before: {
            nodes: [
              {
                id: "node-1",
                type: "text",
                bounds: { x: 0, y: 0, width: 40, height: 20 },
                confidence: 0.8,
              },
            ],
            edges: [],
          },
          after: {
            nodes: [
              {
                id: "node-1",
                type: "text",
                bounds: { x: 0, y: 0, width: 50, height: 20 },
                confidence: 0.8,
              },
            ],
            edges: [],
          },
          weights: { bounds: 0.4, text: 0.3, role: -0.1, type: 0.4 },
        },
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects visual_diff inputs with invalid minScore", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "visual_diff",
        arguments: {
          before: {
            nodes: [
              {
                id: "node-1",
                type: "text",
                bounds: { x: 0, y: 0, width: 40, height: 20 },
                confidence: 0.8,
              },
            ],
            edges: [],
          },
          after: {
            nodes: [
              {
                id: "node-1",
                type: "text",
                bounds: { x: 0, y: 0, width: 50, height: 20 },
                confidence: 0.8,
              },
            ],
            edges: [],
          },
          minScore: 2,
        },
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects map_region with invalid confidenceThreshold", async () => {
    const server = new VisionToolServer();

    const result = await server.callTool(
      {
        name: "map_region",
        arguments: {
          layoutGraph: {
            nodes: [
              {
                id: "node-1",
                type: "control",
                bounds: { x: 0, y: 0, width: 100, height: 40 },
                confidence: 0.9,
                componentRef: {
                  filePath: "src/components/Button.tsx",
                  symbol: "Button",
                  line: 12,
                  column: 2,
                },
              },
            ],
            edges: [],
          },
          region: { x: 10, y: 5, width: 30, height: 20 },
          confidenceThreshold: 1.2,
        },
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });
});
