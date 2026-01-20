import type { LayoutBounds, LayoutGraph, RegionMappingOptions, RegionMappingResult } from "./types";

const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;

export function mapRegionToComponent(
  graph: LayoutGraph,
  region: LayoutBounds,
  options: RegionMappingOptions = {}
): RegionMappingResult {
  const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const regionArea = area(region);
  if (regionArea <= 0) {
    return { confidence: 0, autoApply: false };
  }

  let best: {
    nodeId: string;
    confidence: number;
    componentRef: RegionMappingResult["componentRef"];
  } | null = null;

  for (const node of graph.nodes) {
    if (!node.componentRef) {
      continue;
    }
    const overlapArea = intersectionArea(region, node.bounds);
    if (overlapArea <= 0) {
      continue;
    }

    const nodeArea = area(node.bounds);
    const overlapRegion = overlapArea / regionArea;
    const overlapNode = nodeArea > 0 ? overlapArea / nodeArea : 0;
    const overlapScore = Math.max(overlapRegion, overlapNode);
    const confidence = clamp(overlapScore * node.confidence);

    if (!best || confidence > best.confidence) {
      best = {
        nodeId: node.id,
        confidence,
        componentRef: node.componentRef,
      };
    }
  }

  if (!best) {
    return { confidence: 0, autoApply: false };
  }

  return {
    nodeId: best.nodeId,
    componentRef: best.componentRef,
    confidence: best.confidence,
    autoApply: best.confidence >= threshold,
  };
}

function intersectionArea(a: LayoutBounds, b: LayoutBounds): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const width = x2 - x1;
  const height = y2 - y1;

  if (width <= 0 || height <= 0) {
    return 0;
  }

  return width * height;
}

function area(bounds: LayoutBounds): number {
  return bounds.width * bounds.height;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
