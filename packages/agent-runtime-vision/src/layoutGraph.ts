import type {
  LayoutBounds,
  LayoutEdge,
  LayoutGraph,
  LayoutGraphOptions,
  LayoutNode,
  LayoutNodeInput,
  LayoutNodeType,
  LayoutScanInput,
  OcrBlockInput,
} from "./types";

const DEFAULT_ADJACENCY_THRESHOLD = 12;

export function buildLayoutGraph(input: LayoutScanInput = {}): LayoutGraph {
  const options: LayoutGraphOptions = {
    includeAdjacencyEdges: input.includeAdjacencyEdges ?? true,
    adjacencyThreshold: input.adjacencyThreshold ?? DEFAULT_ADJACENCY_THRESHOLD,
  };

  const nodes: LayoutNode[] = [];
  const usedIds = new Set<string>();

  const addNode = (nodeInput: LayoutNodeInput, prefix: string) => {
    const bounds = normalizeBounds(nodeInput.bounds);
    if (!bounds) {
      return;
    }
    const id = ensureUniqueId(nodeInput.id ?? `${prefix}-${usedIds.size + 1}`, usedIds);
    const type = resolveNodeType(nodeInput);
    const confidence = resolveConfidence(nodeInput);

    nodes.push({
      id,
      type,
      bounds,
      text: nodeInput.text,
      role: nodeInput.role,
      componentRef: nodeInput.componentRef,
      confidence,
    });
  };

  for (const node of input.nodes ?? []) {
    addNode(node, node.source ?? "node");
  }

  for (const block of input.ocrBlocks ?? []) {
    addNode(ocrBlockToNode(block), "ocr");
  }

  const edges: LayoutEdge[] = [];
  edges.push(...buildContainmentEdges(nodes));

  if (options.includeAdjacencyEdges) {
    edges.push(
      ...buildAdjacencyEdges(nodes, options.adjacencyThreshold ?? DEFAULT_ADJACENCY_THRESHOLD)
    );
  }

  return { nodes, edges };
}

function ocrBlockToNode(block: OcrBlockInput): LayoutNodeInput {
  return {
    id: block.id,
    bounds: block.bounds,
    text: block.text,
    role: "text",
    type: "text",
    confidence: block.confidence,
    source: "ocr",
  };
}

function resolveNodeType(input: LayoutNodeInput): LayoutNodeType {
  if (input.type) {
    return input.type;
  }

  const role = input.role?.toLowerCase();
  if (role) {
    if (
      roleMatches(role, [
        "button",
        "link",
        "checkbox",
        "radio",
        "switch",
        "input",
        "textbox",
        "select",
        "combobox",
        "slider",
      ])
    ) {
      return "control";
    }
    if (roleMatches(role, ["img", "image", "icon", "picture", "figure"])) {
      return "image";
    }
    if (roleMatches(role, ["text", "label", "heading", "paragraph"])) {
      return "text";
    }
  }

  if (input.text && input.text.trim().length > 0) {
    return "text";
  }

  return "container";
}

function resolveConfidence(input: LayoutNodeInput): number {
  if (typeof input.confidence === "number") {
    return clampConfidence(input.confidence);
  }

  let score = 0.5;
  if (input.text && input.text.trim().length > 0) {
    score += 0.2;
  }
  if (input.role) {
    score += 0.15;
  }
  if (input.componentRef) {
    score += 0.1;
  }
  if (input.type) {
    score += 0.05;
  }

  return clampConfidence(score);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function ensureUniqueId(id: string, usedIds: Set<string>): string {
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }

  let counter = 1;
  let candidate = `${id}-${counter}`;
  while (usedIds.has(candidate)) {
    counter += 1;
    candidate = `${id}-${counter}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function normalizeBounds(bounds: LayoutBounds): LayoutBounds | null {
  if (!bounds || !isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y)) {
    return null;
  }
  if (!isFiniteNumber(bounds.width) || !isFiniteNumber(bounds.height)) {
    return null;
  }

  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width,
    height,
  };
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function buildContainmentEdges(nodes: LayoutNode[]): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  for (const child of nodes) {
    const parent = findContainmentParent(child, nodes);
    if (parent) {
      edges.push({ from: parent.id, to: child.id, type: "contains" });
    }
  }

  return edges;
}

function findContainmentParent(child: LayoutNode, nodes: LayoutNode[]): LayoutNode | undefined {
  let parent: LayoutNode | undefined;
  let parentArea = Number.POSITIVE_INFINITY;

  for (const candidate of nodes) {
    if (!isContainmentParentCandidate(candidate, child)) {
      continue;
    }
    const candidateArea = area(candidate.bounds);
    if (candidateArea < parentArea) {
      parent = candidate;
      parentArea = candidateArea;
    }
  }

  return parent;
}

function isContainmentParentCandidate(candidate: LayoutNode, child: LayoutNode): boolean {
  if (candidate.id === child.id) {
    return false;
  }
  if (!containsBounds(candidate.bounds, child.bounds)) {
    return false;
  }
  return !isSameBounds(candidate.bounds, child.bounds);
}

function buildAdjacencyEdges(nodes: LayoutNode[], threshold: number): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  const normalizedThreshold = Math.max(0, Math.round(threshold));

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    if (!a) {
      continue;
    }
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      if (!b) {
        continue;
      }
      if (containsBounds(a.bounds, b.bounds) || containsBounds(b.bounds, a.bounds)) {
        continue;
      }
      if (!areAdjacent(a.bounds, b.bounds, normalizedThreshold)) {
        continue;
      }
      edges.push({ from: a.id, to: b.id, type: "adjacent" });
    }
  }

  return edges;
}

function containsBounds(outer: LayoutBounds, inner: LayoutBounds): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

function isSameBounds(a: LayoutBounds, b: LayoutBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function area(bounds: LayoutBounds): number {
  return bounds.width * bounds.height;
}

function areAdjacent(a: LayoutBounds, b: LayoutBounds, threshold: number): boolean {
  const xGap = axisGap(a.x, a.width, b.x, b.width);
  const yGap = axisGap(a.y, a.height, b.y, b.height);
  const overlapX = xGap === 0;
  const overlapY = yGap === 0;

  if (overlapX && yGap <= threshold) {
    return true;
  }
  if (overlapY && xGap <= threshold) {
    return true;
  }
  return false;
}

function axisGap(aStart: number, aSize: number, bStart: number, bSize: number): number {
  const aEnd = aStart + aSize;
  const bEnd = bStart + bSize;

  if (aEnd < bStart) {
    return bStart - aEnd;
  }
  if (bEnd < aStart) {
    return aStart - bEnd;
  }
  return 0;
}

function roleMatches(role: string, tokens: string[]): boolean {
  return tokens.some((token) => role.includes(token));
}
