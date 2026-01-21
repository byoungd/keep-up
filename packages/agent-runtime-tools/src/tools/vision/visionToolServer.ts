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
        policyAction: "connector.read",
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
        policyAction: "connector.read",
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
        policyAction: "connector.read",
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
    const adjacencyThreshold = readOptionalNonNegativeNumber(args.adjacencyThreshold);
    if (adjacencyThreshold === null) {
      return errorResult("INVALID_ARGUMENTS", "adjacencyThreshold must be a non-negative number");
    }

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
      return errorResult(
        "INVALID_ARGUMENTS",
        "weights must be an object with non-negative numeric fields"
      );
    }

    const minScore = readOptionalUnitInterval(args.minScore);
    if (minScore === null) {
      return errorResult("INVALID_ARGUMENTS", "minScore must be between 0 and 1");
    }

    const options: VisualDiffOptions = {
      weights: weights ?? undefined,
      minScore: minScore ?? undefined,
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

    const confidenceOverride = readOptionalUnitInterval(args.confidenceThreshold);
    if (confidenceOverride === null) {
      return errorResult("INVALID_ARGUMENTS", "confidenceThreshold must be between 0 and 1");
    }
    const confidenceThreshold = confidenceOverride ?? this.config.autoApplyConfidenceThreshold;

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

  const id = readOptionalString(value.id);
  if (id === null) {
    return null;
  }
  const text = readOptionalString(value.text);
  if (text === null) {
    return null;
  }
  const role = readOptionalString(value.role);
  if (role === null) {
    return null;
  }
  const componentRef = readOptionalComponentRef(value.componentRef);
  if (componentRef === null) {
    return null;
  }

  const type = readOptionalLayoutNodeType(value.type);
  if (type === null) {
    return null;
  }
  const source = readOptionalLayoutNodeSource(value.source);
  if (source === null) {
    return null;
  }
  const confidence = readOptionalUnitInterval(value.confidence);
  if (confidence === null) {
    return null;
  }

  return {
    id,
    bounds,
    type,
    text,
    role,
    componentRef,
    confidence: confidence ?? undefined,
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
  if (value.id !== undefined && typeof value.id !== "string") {
    return null;
  }
  const confidence = readOptionalUnitInterval(value.confidence);
  if (confidence === null) {
    return null;
  }
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    text: value.text,
    bounds,
    confidence: confidence ?? undefined,
  };
}

function readLayoutGraph(value: unknown): LayoutGraph | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!Array.isArray(value.nodes)) {
    return null;
  }
  if (value.edges !== undefined && !Array.isArray(value.edges)) {
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
      if (!edge) {
        return null;
      }
      edges.push(edge);
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
  if (value.text !== undefined && typeof value.text !== "string") {
    return null;
  }
  if (value.role !== undefined && typeof value.role !== "string") {
    return null;
  }
  const confidence = readUnitInterval(value.confidence);
  if (confidence === null) {
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
    confidence,
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
  const line = readNonNegativeNumber(value.line);
  const column = readNonNegativeNumber(value.column);
  if (line === null || column === null) {
    return null;
  }

  return {
    filePath: value.filePath,
    symbol: typeof value.symbol === "string" ? value.symbol : undefined,
    line,
    column,
  };
}

function readBounds(value: unknown): LayoutBounds | null {
  if (!isRecord(value)) {
    return null;
  }
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const width = readPositiveNumber(value.width);
  const height = readPositiveNumber(value.height);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  return {
    x,
    y,
    width,
    height,
  };
}

function readWeights(value: unknown): VisualDiffOptions["weights"] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }

  const bounds = readNonNegativeNumber(value.bounds);
  const text = readNonNegativeNumber(value.text);
  const role = readNonNegativeNumber(value.role);
  const type = readNonNegativeNumber(value.type);

  if (bounds === null || text === null || role === null || type === null) {
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

function readOptionalString(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  return value;
}

function readOptionalComponentRef(value: unknown): ComponentRef | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return readComponentRef(value);
}

function readOptionalLayoutNodeType(value: unknown): LayoutNodeType | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isLayoutNodeType(value)) {
    return null;
  }
  return value;
}

function readOptionalLayoutNodeSource(
  value: unknown
): LayoutNodeInput["source"] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isLayoutNodeSource(value)) {
    return null;
  }
  return value;
}

function readOptionalNonNegativeNumber(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return readNonNegativeNumber(value);
}

function readOptionalUnitInterval(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return readUnitInterval(value);
}

function readUnitInterval(value: unknown): number | null {
  const number = readFiniteNumber(value);
  if (number === null) {
    return null;
  }
  if (number < 0 || number > 1) {
    return null;
  }
  return number;
}

function readNonNegativeNumber(value: unknown): number | null {
  const number = readFiniteNumber(value);
  if (number === null) {
    return null;
  }
  if (number < 0) {
    return null;
  }
  return number;
}

function readPositiveNumber(value: unknown): number | null {
  const number = readFiniteNumber(value);
  if (number === null) {
    return null;
  }
  if (number <= 0) {
    return null;
  }
  return number;
}

function readFiniteNumber(value: unknown): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
