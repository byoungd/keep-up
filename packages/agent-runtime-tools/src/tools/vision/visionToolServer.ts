/**
 * Vision Tool Server
 *
 * Provides layout graph, visual diff, and region mapping utilities.
 */

import type { MCPTool, MCPToolResult, ToolContext, VisionConfig } from "@ku0/agent-runtime-core";
import { DEFAULT_VISION_CONFIG } from "@ku0/agent-runtime-core";
import {
  buildLayoutGraph,
  type ComponentRef,
  diffLayoutGraphs,
  type LayoutBounds,
  type LayoutEdge,
  type LayoutGraph,
  type LayoutNode,
  type LayoutNodeInput,
  type LayoutNodeType,
  type LayoutScanInput,
  mapRegionToComponent,
  type OcrBlockInput,
  type VisualDiffOptions,
} from "@ku0/agent-runtime-vision";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

export interface VisionToolServerOptions {
  config?: Partial<VisionConfig>;
}

export class VisionToolServer extends BaseToolServer {
  readonly name = "vision";
  readonly description = "Visual intelligence tools for layout graphs and diffs.";

  private readonly config: VisionConfig;

  constructor(options: VisionToolServerOptions = {}) {
    super();
    this.config = { ...DEFAULT_VISION_CONFIG, ...(options.config ?? {}) };

    this.registerTool(this.createLayoutScanToolDef(), this.handleLayoutScan.bind(this));
    this.registerTool(this.createVisualDiffToolDef(), this.handleVisualDiff.bind(this));
    this.registerTool(this.createMapRegionToolDef(), this.handleMapRegion.bind(this));
  }

  private createLayoutScanToolDef(): MCPTool {
    return {
      name: "layout_scan",
      description: "Build a LayoutGraph from DOM nodes and OCR blocks.",
      inputSchema: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            description: "DOM or region nodes with bounds and metadata.",
            items: { type: "object" },
          },
          ocrBlocks: {
            type: "array",
            description: "OCR text blocks with bounds.",
            items: { type: "object" },
          },
          includeAdjacencyEdges: {
            type: "boolean",
            description: "Whether to emit adjacent edges (default: true).",
          },
          adjacencyThreshold: {
            type: "number",
            description: "Pixel threshold for adjacency edges.",
          },
        },
      },
      annotations: {
        category: "core",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private createVisualDiffToolDef(): MCPTool {
    return {
      name: "visual_diff",
      description: "Compute a VisualDiffReport between two LayoutGraphs.",
      inputSchema: {
        type: "object",
        properties: {
          before: { type: "object", description: "LayoutGraph before changes." },
          after: { type: "object", description: "LayoutGraph after changes." },
          weights: { type: "object", description: "Optional scoring weights." },
          minScore: { type: "number", description: "Minimum score to include regions." },
        },
        required: ["before", "after"],
      },
      annotations: {
        category: "core",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private createMapRegionToolDef(): MCPTool {
    return {
      name: "map_region",
      description: "Map a screen region to a component definition.",
      inputSchema: {
        type: "object",
        properties: {
          layoutGraph: { type: "object", description: "LayoutGraph to search." },
          region: {
            type: "object",
            description: "Target bounds for mapping.",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
          },
          confidenceThreshold: {
            type: "number",
            description: "Override auto-apply confidence threshold.",
          },
        },
        required: ["layoutGraph", "region"],
      },
      annotations: {
        category: "core",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private async handleLayoutScan(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const nodes = readLayoutNodeInputs(args.nodes);
    if (nodes === null) {
      return errorResult("INVALID_ARGUMENTS", "nodes must be an array of layout nodes");
    }

    const ocrBlocks = this.config.ocrEnabled ? readOcrBlocks(args.ocrBlocks) : undefined;
    if (this.config.ocrEnabled && ocrBlocks === null) {
      return errorResult("INVALID_ARGUMENTS", "ocrBlocks must be an array of OCR blocks");
    }

    const includeAdjacencyEdges =
      typeof args.includeAdjacencyEdges === "boolean" ? args.includeAdjacencyEdges : undefined;
    const adjacencyThreshold =
      typeof args.adjacencyThreshold === "number" ? args.adjacencyThreshold : undefined;

    const input: LayoutScanInput = {
      nodes: nodes ?? undefined,
      ocrBlocks: ocrBlocks ?? undefined,
      includeAdjacencyEdges,
      adjacencyThreshold,
    };

    const graph = buildLayoutGraph(input);
    return textResult(JSON.stringify(graph, null, 2));
  }

  private async handleVisualDiff(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const before = readLayoutGraph(args.before);
    if (!before) {
      return errorResult("INVALID_ARGUMENTS", "before must be a LayoutGraph");
    }
    const after = readLayoutGraph(args.after);
    if (!after) {
      return errorResult("INVALID_ARGUMENTS", "after must be a LayoutGraph");
    }

    const weights = readWeights(args.weights);
    if (weights === null) {
      return errorResult("INVALID_ARGUMENTS", "weights must be an object with numeric fields");
    }

    const options: VisualDiffOptions = {
      weights: weights ?? undefined,
      minScore: typeof args.minScore === "number" ? args.minScore : undefined,
    };

    const report = diffLayoutGraphs(before, after, options);
    return textResult(JSON.stringify(report, null, 2));
  }

  private async handleMapRegion(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const graph = readLayoutGraph(args.layoutGraph);
    if (!graph) {
      return errorResult("INVALID_ARGUMENTS", "layoutGraph must be a LayoutGraph");
    }
    const region = readBounds(args.region);
    if (!region) {
      return errorResult("INVALID_ARGUMENTS", "region must include x, y, width, height");
    }

    const confidenceThreshold =
      typeof args.confidenceThreshold === "number"
        ? args.confidenceThreshold
        : this.config.autoApplyConfidenceThreshold;

    const mapping = mapRegionToComponent(graph, region, { confidenceThreshold });
    return textResult(JSON.stringify(mapping, null, 2));
  }
}

export function createVisionToolServer(options: VisionToolServerOptions = {}): VisionToolServer {
  return new VisionToolServer(options);
}

function readLayoutNodeInputs(value: unknown): LayoutNodeInput[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const nodes: LayoutNodeInput[] = [];
  for (const entry of value) {
    const node = readLayoutNodeInput(entry);
    if (!node) {
      return null;
    }
    nodes.push(node);
  }
  return nodes;
}

function readLayoutNodeInput(value: unknown): LayoutNodeInput | null {
  if (!isRecord(value)) {
    return null;
  }
  const bounds = readBounds(value.bounds);
  if (!bounds) {
    return null;
  }

  let componentRef: ComponentRef | undefined;
  if (value.componentRef !== undefined) {
    const parsedRef = readComponentRef(value.componentRef);
    if (!parsedRef) {
      return null;
    }
    componentRef = parsedRef;
  }

  const type = isLayoutNodeType(value.type) ? value.type : undefined;
  const confidence = typeof value.confidence === "number" ? value.confidence : undefined;
  const source = isLayoutNodeSource(value.source) ? value.source : undefined;

  return {
    id: typeof value.id === "string" ? value.id : undefined,
    bounds,
    type,
    text: typeof value.text === "string" ? value.text : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    componentRef,
    confidence,
    source,
  };
}

function readOcrBlocks(value: unknown): OcrBlockInput[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const blocks: OcrBlockInput[] = [];
  for (const entry of value) {
    const block = readOcrBlock(entry);
    if (!block) {
      return null;
    }
    blocks.push(block);
  }
  return blocks;
}

function readOcrBlock(value: unknown): OcrBlockInput | null {
  if (!isRecord(value)) {
    return null;
  }
  const bounds = readBounds(value.bounds);
  if (!bounds || typeof value.text !== "string") {
    return null;
  }
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    text: value.text,
    bounds,
    confidence: typeof value.confidence === "number" ? value.confidence : undefined,
  };
}

function readLayoutGraph(value: unknown): LayoutGraph | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!Array.isArray(value.nodes)) {
    return null;
  }

  const nodes: LayoutNode[] = [];
  for (const entry of value.nodes) {
    const node = readLayoutNode(entry);
    if (!node) {
      return null;
    }
    nodes.push(node);
  }

  const edges: LayoutEdge[] = [];
  if (Array.isArray(value.edges)) {
    for (const entry of value.edges) {
      const edge = readLayoutEdge(entry);
      if (edge) {
        edges.push(edge);
      }
    }
  }

  return { nodes, edges };
}

function readLayoutNode(value: unknown): LayoutNode | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.id !== "string") {
    return null;
  }
  if (!isLayoutNodeType(value.type)) {
    return null;
  }
  const bounds = readBounds(value.bounds);
  if (!bounds) {
    return null;
  }
  if (typeof value.confidence !== "number") {
    return null;
  }

  let componentRef: ComponentRef | undefined;
  if (value.componentRef !== undefined) {
    const parsedRef = readComponentRef(value.componentRef);
    if (!parsedRef) {
      return null;
    }
    componentRef = parsedRef;
  }

  return {
    id: value.id,
    type: value.type,
    bounds,
    text: typeof value.text === "string" ? value.text : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    componentRef,
    confidence: value.confidence,
  };
}

function readLayoutEdge(value: unknown): LayoutEdge | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.from !== "string" || typeof value.to !== "string") {
    return null;
  }
  if (value.type !== "contains" && value.type !== "adjacent") {
    return null;
  }
  return { from: value.from, to: value.to, type: value.type };
}

function readComponentRef(value: unknown): ComponentRef | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.filePath !== "string") {
    return null;
  }
  if (typeof value.line !== "number" || typeof value.column !== "number") {
    return null;
  }

  return {
    filePath: value.filePath,
    symbol: typeof value.symbol === "string" ? value.symbol : undefined,
    line: value.line,
    column: value.column,
  };
}

function readBounds(value: unknown): LayoutBounds | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    typeof value.width !== "number" ||
    typeof value.height !== "number"
  ) {
    return null;
  }
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
}

function readWeights(value: unknown): VisualDiffOptions["weights"] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }

  const bounds = typeof value.bounds === "number" ? value.bounds : undefined;
  const text = typeof value.text === "number" ? value.text : undefined;
  const role = typeof value.role === "number" ? value.role : undefined;
  const type = typeof value.type === "number" ? value.type : undefined;

  if (bounds === undefined || text === undefined || role === undefined || type === undefined) {
    return null;
  }

  return { bounds, text, role, type };
}

function isLayoutNodeType(value: unknown): value is LayoutNodeType {
  return value === "text" || value === "image" || value === "control" || value === "container";
}

function isLayoutNodeSource(value: unknown): value is LayoutNodeInput["source"] {
  return value === "dom" || value === "ocr" || value === "region";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
