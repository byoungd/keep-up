import type {
  LayoutBounds,
  LayoutGraph,
  LayoutNode,
  VisualDiffOptions,
  VisualDiffRegion,
  VisualDiffReport,
} from "./types";

const DEFAULT_WEIGHTS = {
  bounds: 0.4,
  text: 0.3,
  role: 0.2,
  type: 0.1,
};

const DEFAULT_MIN_SCORE = 0;

export function diffLayoutGraphs(
  before: LayoutGraph,
  after: LayoutGraph,
  options: VisualDiffOptions = {}
): VisualDiffReport {
  const weights = normalizeWeights(options.weights);
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const regions: VisualDiffRegion[] = [];

  const beforeMap = mapNodes(before.nodes);
  const afterMap = mapNodes(after.nodes);

  for (const [id, beforeNode] of beforeMap.entries()) {
    const afterNode = afterMap.get(id);
    if (!afterNode) {
      regions.push({
        id,
        bounds: beforeNode.bounds,
        score: removalScore(beforeNode),
        changeType: "removed",
      });
      continue;
    }

    const score = modifiedScore(beforeNode, afterNode, weights);
    if (score >= minScore) {
      regions.push({
        id,
        bounds: afterNode.bounds,
        score,
        changeType: "modified",
      });
    }
  }

  for (const [id, afterNode] of afterMap.entries()) {
    if (beforeMap.has(id)) {
      continue;
    }
    regions.push({
      id,
      bounds: afterNode.bounds,
      score: additionScore(afterNode),
      changeType: "added",
    });
  }

  const maxScore = regions.reduce((max, region) => Math.max(max, region.score), 0);

  return {
    regions,
    summary: {
      totalRegions: regions.length,
      changedRegions: regions.length,
      maxScore,
    },
  };
}

function mapNodes(nodes: LayoutNode[]): Map<string, LayoutNode> {
  const map = new Map<string, LayoutNode>();
  for (const node of nodes) {
    if (!map.has(node.id)) {
      map.set(node.id, node);
    }
  }
  return map;
}

function modifiedScore(
  before: LayoutNode,
  after: LayoutNode,
  weights: typeof DEFAULT_WEIGHTS
): number {
  const boundsDelta = boundsDeltaScore(before.bounds, after.bounds);
  const textDelta = before.text === after.text ? 0 : 1;
  const roleDelta = before.role === after.role ? 0 : 1;
  const typeDelta = before.type === after.type ? 0 : 1;

  const score =
    weights.bounds * boundsDelta +
    weights.text * textDelta +
    weights.role * roleDelta +
    weights.type * typeDelta;

  return clamp(score);
}

function boundsDeltaScore(before: LayoutBounds, after: LayoutBounds): number {
  const positionDelta = Math.abs(before.x - after.x) + Math.abs(before.y - after.y);
  const sizeDelta = Math.abs(before.width - after.width) + Math.abs(before.height - after.height);

  const maxSpan = Math.max(
    before.x + before.width,
    after.x + after.width,
    before.y + before.height,
    after.y + after.height,
    1
  );

  const normalizedPosition = positionDelta / maxSpan;
  const normalizedSize = sizeDelta / maxSpan;
  const areaDelta = Math.abs(area(before) - area(after)) / Math.max(area(before), area(after), 1);

  return clamp((normalizedPosition + normalizedSize + areaDelta) / 3);
}

function additionScore(node: LayoutNode): number {
  return clamp(0.6 + 0.4 * node.confidence);
}

function removalScore(node: LayoutNode): number {
  return clamp(0.6 + 0.4 * node.confidence);
}

function normalizeWeights(weights: VisualDiffOptions["weights"]): typeof DEFAULT_WEIGHTS {
  if (!weights) {
    return DEFAULT_WEIGHTS;
  }
  const merged = {
    bounds: weights.bounds ?? DEFAULT_WEIGHTS.bounds,
    text: weights.text ?? DEFAULT_WEIGHTS.text,
    role: weights.role ?? DEFAULT_WEIGHTS.role,
    type: weights.type ?? DEFAULT_WEIGHTS.type,
  };
  const total = merged.bounds + merged.text + merged.role + merged.type;
  if (total <= 0) {
    return DEFAULT_WEIGHTS;
  }
  return {
    bounds: merged.bounds / total,
    text: merged.text / total,
    role: merged.role / total,
    type: merged.type / total,
  };
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
