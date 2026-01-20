export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutNodeType = "text" | "image" | "control" | "container";
export type LayoutEdgeType = "contains" | "adjacent";

export interface ComponentRef {
  filePath: string;
  symbol?: string;
  line: number;
  column: number;
}

export interface LayoutNode {
  id: string;
  type: LayoutNodeType;
  bounds: LayoutBounds;
  text?: string;
  role?: string;
  componentRef?: ComponentRef;
  confidence: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  type: LayoutEdgeType;
}

export interface LayoutGraph {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export type LayoutNodeSource = "dom" | "ocr" | "region";

export interface LayoutNodeInput {
  id?: string;
  type?: LayoutNodeType;
  bounds: LayoutBounds;
  text?: string;
  role?: string;
  componentRef?: ComponentRef;
  confidence?: number;
  source?: LayoutNodeSource;
}

export interface OcrBlockInput {
  id?: string;
  text: string;
  bounds: LayoutBounds;
  confidence?: number;
}

export interface LayoutScanInput {
  nodes?: LayoutNodeInput[];
  ocrBlocks?: OcrBlockInput[];
  includeAdjacencyEdges?: boolean;
  adjacencyThreshold?: number;
}

export interface LayoutGraphOptions {
  includeAdjacencyEdges?: boolean;
  adjacencyThreshold?: number;
}

export type VisualDiffChangeType = "added" | "removed" | "modified";

export interface VisualDiffRegion {
  id: string;
  bounds: LayoutBounds;
  score: number;
  changeType: VisualDiffChangeType;
}

export interface VisualDiffSummary {
  totalRegions: number;
  changedRegions: number;
  maxScore: number;
}

export interface VisualDiffReport {
  regions: VisualDiffRegion[];
  summary: VisualDiffSummary;
}

export interface VisualDiffOptions {
  weights?: {
    bounds: number;
    text: number;
    role: number;
    type: number;
  };
  minScore?: number;
}

export interface RegionMappingResult {
  nodeId?: string;
  componentRef?: ComponentRef;
  confidence: number;
  autoApply: boolean;
}

export interface RegionMappingOptions {
  confidenceThreshold?: number;
}
