/**
 * HNSW-like Vector Index
 *
 * Hierarchical Navigable Small World graph for approximate nearest neighbor search.
 * Provides O(log n) search complexity for high-dimensional vectors.
 *
 * Features:
 * - Multi-layer skip-list structure for fast search
 * - Configurable M (max connections per node) and efConstruction
 * - Support for incremental insertions and deletions
 * - Distance metrics: cosine, euclidean, dot product
 */

import type { ChunkEmbedding } from "../extraction";

// ============================================================================
// Types
// ============================================================================

/** Distance metric type */
export type DistanceMetric = "cosine" | "euclidean" | "dot";

/** HNSW configuration */
export interface HNSWConfig {
  /** Maximum number of connections per node at each layer (default: 16) */
  M: number;
  /** Size of dynamic candidate list during construction (default: 200) */
  efConstruction: number;
  /** Size of dynamic candidate list during search (default: 50) */
  efSearch: number;
  /** Distance metric (default: "cosine") */
  metric: DistanceMetric;
  /** Maximum number of layers (auto-calculated if not specified) */
  maxLayers?: number;
  /** Random seed for reproducibility */
  seed?: number;
}

/** Node in the HNSW graph */
interface HNSWNode {
  /** Node ID (chunk ID) */
  id: string;
  /** Document ID for filtering */
  docId: string;
  /** Vector embedding */
  vector: Float32Array;
  /** Connections at each layer: layer -> [nodeId, distance][] */
  connections: Map<number, Array<{ id: string; distance: number }>>;
  /** Maximum layer this node exists on */
  maxLayer: number;
}

/** Search candidate */
interface Candidate {
  id: string;
  distance: number;
}

/** Search result */
export interface HNSWSearchResult {
  id: string;
  similarity: number;
  distance: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HNSWConfig = {
  M: 16,
  efConstruction: 200,
  efSearch: 50,
  metric: "cosine",
};

// ============================================================================
// Distance Functions
// ============================================================================

function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 1;
  }

  // Cosine distance = 1 - cosine similarity
  return 1 - dotProduct / magnitude;
}

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function dotProductDistance(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  // Negative because we want to maximize dot product but minimize distance
  return -dotProduct;
}

function getDistanceFunction(metric: DistanceMetric): (a: Float32Array, b: Float32Array) => number {
  switch (metric) {
    case "cosine":
      return cosineDistance;
    case "euclidean":
      return euclideanDistance;
    case "dot":
      return dotProductDistance;
  }
}

// ============================================================================
// Priority Queue for Search
// ============================================================================

class MinHeap<T> {
  private heap: Array<{ item: T; priority: number }> = [];

  get size(): number {
    return this.heap.length;
  }

  push(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const top = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return top.item;
  }

  peek(): { item: T; priority: number } | undefined {
    return this.heap[0];
  }

  private bubbleUp(index: number): void {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[currentIndex].priority) {
        break;
      }

      [this.heap[parentIndex], this.heap[currentIndex]] = [
        this.heap[currentIndex],
        this.heap[parentIndex],
      ];
      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;

    for (let currentIndex = index; ; ) {
      const leftChild = 2 * currentIndex + 1;
      const rightChild = 2 * currentIndex + 2;
      let smallest = currentIndex;

      if (leftChild < length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }

      if (smallest === currentIndex) {
        break;
      }

      [this.heap[currentIndex], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[currentIndex],
      ];
      currentIndex = smallest;
    }
  }
}

class MaxHeap<T> {
  private heap: Array<{ item: T; priority: number }> = [];

  get size(): number {
    return this.heap.length;
  }

  push(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const top = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return top.item;
  }

  peek(): { item: T; priority: number } | undefined {
    return this.heap[0];
  }

  toArray(): T[] {
    return this.heap.sort((a, b) => a.priority - b.priority).map((x) => x.item);
  }

  private bubbleUp(index: number): void {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (this.heap[parentIndex].priority >= this.heap[currentIndex].priority) {
        break;
      }

      [this.heap[parentIndex], this.heap[currentIndex]] = [
        this.heap[currentIndex],
        this.heap[parentIndex],
      ];
      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;

    for (let currentIndex = index; ; ) {
      const leftChild = 2 * currentIndex + 1;
      const rightChild = 2 * currentIndex + 2;
      let largest = currentIndex;

      if (leftChild < length && this.heap[leftChild].priority > this.heap[largest].priority) {
        largest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild].priority > this.heap[largest].priority) {
        largest = rightChild;
      }

      if (largest === currentIndex) {
        break;
      }

      [this.heap[currentIndex], this.heap[largest]] = [this.heap[largest], this.heap[currentIndex]];
      currentIndex = largest;
    }
  }
}

// ============================================================================
// HNSW Index Implementation
// ============================================================================

/**
 * HNSW Vector Index
 *
 * Implements Hierarchical Navigable Small World graph algorithm for
 * approximate nearest neighbor search with O(log n) complexity.
 */
export class HNSWIndex {
  private readonly config: HNSWConfig;
  private readonly distance: (a: Float32Array, b: Float32Array) => number;
  private readonly nodes = new Map<string, HNSWNode>();
  private readonly docIndex = new Map<string, Set<string>>();
  private entryPointId: string | null = null;
  private maxLevel = 0;
  private readonly levelMultiplier: number;
  private rng: () => number;

  constructor(config: Partial<HNSWConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.distance = getDistanceFunction(this.config.metric);
    this.levelMultiplier = 1 / Math.log(this.config.M);

    // Simple seeded RNG for reproducibility
    const seed = this.config.seed ?? Date.now();
    let state = seed;
    this.rng = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  /**
   * Get the number of indexed vectors.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Add embeddings to the index.
   */
  async add(embeddings: ChunkEmbedding[]): Promise<void> {
    for (const embedding of embeddings) {
      await this.insert(embedding);
    }
  }

  /**
   * Insert a single embedding.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: HNSW insertion requires multiple ordered steps; broader refactor would risk algorithm correctness
  async insert(embedding: ChunkEmbedding): Promise<void> {
    const vector = new Float32Array(embedding.embedding);
    const nodeLevel = this.getRandomLevel();

    const node: HNSWNode = {
      id: embedding.chunkId,
      docId: embedding.docId,
      vector,
      connections: new Map(),
      maxLayer: nodeLevel,
    };

    // Initialize connection lists for each layer
    for (let level = 0; level <= nodeLevel; level++) {
      node.connections.set(level, []);
    }

    // Update doc index
    let docChunks = this.docIndex.get(embedding.docId);
    if (!docChunks) {
      docChunks = new Set();
      this.docIndex.set(embedding.docId, docChunks);
    }
    docChunks.add(embedding.chunkId);

    // First node becomes entry point
    if (this.entryPointId === null) {
      this.nodes.set(node.id, node);
      this.entryPointId = node.id;
      this.maxLevel = nodeLevel;
      return;
    }

    // Find entry point for this insertion
    const entryPointNode = this.nodes.get(this.entryPointId);
    if (!entryPointNode) {
      return;
    }
    let currentId = this.entryPointId;

    // Traverse from top level down to node's max level
    for (let level = this.maxLevel; level > nodeLevel; level--) {
      const changed = this.greedyClosest(vector, currentId, level);
      if (changed !== currentId) {
        currentId = changed;
        const nextNode = this.nodes.get(currentId);
        if (!nextNode) {
          break;
        }
      }
    }

    // Insert at each layer from nodeLevel down to 0
    for (let level = Math.min(nodeLevel, this.maxLevel); level >= 0; level--) {
      const neighbors = this.searchLayer(vector, currentId, this.config.efConstruction, level);
      const selectedNeighbors = this.selectNeighbors(vector, neighbors, this.config.M);

      // Connect to selected neighbors
      node.connections.set(
        level,
        selectedNeighbors.map((n) => ({ id: n.id, distance: n.distance }))
      );

      // Add bidirectional connections
      for (const neighbor of selectedNeighbors) {
        const neighborNode = this.nodes.get(neighbor.id);
        if (neighborNode) {
          const neighborConnections = neighborNode.connections.get(level) || [];
          neighborConnections.push({ id: node.id, distance: neighbor.distance });

          // Prune if too many connections
          if (neighborConnections.length > this.config.M * 2) {
            const pruned = this.selectNeighbors(
              neighborNode.vector,
              neighborConnections.map((c) => ({ id: c.id, distance: c.distance })),
              this.config.M * 2
            );
            neighborNode.connections.set(
              level,
              pruned.map((c) => ({ id: c.id, distance: c.distance }))
            );
          } else {
            neighborNode.connections.set(level, neighborConnections);
          }
        }
      }

      // Update current node for next layer
      if (neighbors.length > 0) {
        currentId = neighbors[0].id;
      }
    }

    // Add node to index
    this.nodes.set(node.id, node);

    // Update entry point if new node has higher level
    if (nodeLevel > this.maxLevel) {
      this.entryPointId = node.id;
      this.maxLevel = nodeLevel;
    }
  }

  /**
   * Search for k nearest neighbors.
   */
  async search(
    query: number[],
    options: { topK: number; filter?: { docIds?: string[] } }
  ): Promise<HNSWSearchResult[]> {
    if (this.entryPointId === null) {
      return [];
    }

    const queryVector = new Float32Array(query);
    const allowedIds = this.buildAllowedIds(options.filter);
    if (allowedIds !== null && allowedIds.size === 0) {
      return [];
    }

    const entryPoint = this.findEntryPoint(queryVector);
    const candidates = this.searchLayer(queryVector, entryPoint, this.config.efSearch, 0);

    return this.buildSearchResults(candidates, allowedIds, options.topK);
  }

  private buildAllowedIds(filter?: { docIds?: string[] }): Set<string> | null {
    if (!filter?.docIds || filter.docIds.length === 0) {
      return null;
    }

    const allowed = new Set<string>();
    for (const docId of filter.docIds) {
      const chunkIds = this.docIndex.get(docId);
      if (!chunkIds) {
        continue;
      }
      for (const id of chunkIds) {
        allowed.add(id);
      }
    }

    return allowed;
  }

  private findEntryPoint(queryVector: Float32Array): string {
    let currentId = this.entryPointId as string;
    for (let level = this.maxLevel; level >= 1; level--) {
      currentId = this.greedyClosest(queryVector, currentId, level);
    }
    return currentId;
  }

  private buildSearchResults(
    candidates: Candidate[],
    allowedIds: Set<string> | null,
    topK: number
  ): HNSWSearchResult[] {
    const results: HNSWSearchResult[] = [];
    for (const candidate of candidates) {
      if (allowedIds && !allowedIds.has(candidate.id)) {
        continue;
      }

      results.push({
        id: candidate.id,
        distance: candidate.distance,
        similarity: this.distanceToSimilarity(candidate.distance),
      });

      if (results.length >= topK) {
        break;
      }
    }
    return results;
  }

  /**
   * Delete embeddings by chunk IDs.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deletion touches multiple graph structures; refactor deferred to preserve correctness
  async delete(chunkIds: string[]): Promise<void> {
    for (const chunkId of chunkIds) {
      const node = this.nodes.get(chunkId);
      if (!node) {
        continue;
      }

      // Remove from doc index
      const docChunks = this.docIndex.get(node.docId);
      if (docChunks) {
        docChunks.delete(chunkId);
        if (docChunks.size === 0) {
          this.docIndex.delete(node.docId);
        }
      }

      // Remove connections from neighbors
      for (const [level, connections] of node.connections) {
        for (const conn of connections) {
          const neighborNode = this.nodes.get(conn.id);
          if (neighborNode) {
            const neighborConns = neighborNode.connections.get(level);
            if (neighborConns) {
              neighborNode.connections.set(
                level,
                neighborConns.filter((c) => c.id !== chunkId)
              );
            }
          }
        }
      }

      // Remove node
      this.nodes.delete(chunkId);

      // Update entry point if necessary
      if (this.entryPointId === chunkId) {
        this.updateEntryPoint();
      }
    }
  }

  /**
   * Delete all embeddings for a document.
   */
  async deleteByDocId(docId: string): Promise<void> {
    const chunkIds = this.docIndex.get(docId);
    if (chunkIds) {
      await this.delete(Array.from(chunkIds));
    }
  }

  /**
   * Get embedding by chunk ID.
   */
  async get(chunkId: string): Promise<ChunkEmbedding | null> {
    const node = this.nodes.get(chunkId);
    if (!node) {
      return null;
    }

    return {
      chunkId: node.id,
      docId: node.docId,
      embedding: Array.from(node.vector),
      model: "unknown",
      dimensions: node.vector.length,
      createdAt: Date.now(),
    };
  }

  /**
   * Get total count of embeddings.
   */
  async count(filter?: { docId?: string }): Promise<number> {
    if (filter?.docId) {
      return this.docIndex.get(filter.docId)?.size ?? 0;
    }
    return this.nodes.size;
  }

  /**
   * Clear all embeddings.
   */
  async clear(): Promise<void> {
    this.nodes.clear();
    this.docIndex.clear();
    this.entryPointId = null;
    this.maxLevel = 0;
  }

  /**
   * Get index statistics.
   */
  getStats(): {
    nodeCount: number;
    docCount: number;
    maxLevel: number;
    avgConnectionsPerNode: number;
  } {
    let totalConnections = 0;
    for (const node of this.nodes.values()) {
      for (const connections of node.connections.values()) {
        totalConnections += connections.length;
      }
    }

    return {
      nodeCount: this.nodes.size,
      docCount: this.docIndex.size,
      maxLevel: this.maxLevel,
      avgConnectionsPerNode: this.nodes.size > 0 ? totalConnections / this.nodes.size : 0,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getRandomLevel(): number {
    let level = 0;
    while (this.rng() < 0.5 && level < (this.config.maxLayers ?? 16)) {
      level++;
    }
    return level;
  }

  private greedyClosest(query: Float32Array, startId: string, level: number): string {
    let currentId = startId;
    const initialNode = this.nodes.get(currentId);
    if (!initialNode) {
      return startId;
    }
    let currentNode = initialNode;
    let currentDist = this.distance(query, currentNode.vector);
    let changed = true;

    while (changed) {
      changed = false;
      const connections = currentNode.connections.get(level) || [];

      for (const conn of connections) {
        const neighborNode = this.nodes.get(conn.id);
        if (!neighborNode) {
          continue;
        }

        const dist = this.distance(query, neighborNode.vector);
        if (dist < currentDist) {
          currentId = conn.id;
          currentNode = neighborNode;
          currentDist = dist;
          changed = true;
        }
      }
    }

    return currentId;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: search layer expansion follows HNSW reference algorithm and stays explicit
  private searchLayer(
    query: Float32Array,
    entryId: string,
    ef: number,
    level: number
  ): Candidate[] {
    const visited = new Set<string>([entryId]);
    const entryNode = this.nodes.get(entryId);
    if (!entryNode) {
      return [];
    }
    const entryDist = this.distance(query, entryNode.vector);

    const candidates = new MinHeap<Candidate>();
    const results = new MaxHeap<Candidate>();

    candidates.push({ id: entryId, distance: entryDist }, entryDist);
    results.push({ id: entryId, distance: entryDist }, entryDist);

    while (candidates.size > 0) {
      const candidateItem = candidates.peek();
      const resultItem = results.peek();

      if (!candidateItem || !resultItem) {
        break;
      }
      if (candidateItem.priority > resultItem.priority) {
        break;
      }

      const current = candidates.pop();
      if (!current) {
        break;
      }
      const currentNode = this.nodes.get(current.id);
      if (!currentNode) {
        continue;
      }

      const connections = currentNode.connections.get(level) || [];

      for (const conn of connections) {
        if (visited.has(conn.id)) {
          continue;
        }
        visited.add(conn.id);

        const neighborNode = this.nodes.get(conn.id);
        if (!neighborNode) {
          continue;
        }

        const dist = this.distance(query, neighborNode.vector);
        const resultTop = results.peek();

        if (results.size < ef || (resultTop && dist < resultTop.priority)) {
          candidates.push({ id: conn.id, distance: dist }, dist);
          results.push({ id: conn.id, distance: dist }, dist);

          if (results.size > ef) {
            results.pop();
          }
        }
      }
    }

    return results.toArray();
  }

  private selectNeighbors(
    _query: Float32Array,
    candidates: Candidate[],
    maxCount: number
  ): Candidate[] {
    // Simple selection: just take the closest ones
    // A more sophisticated version would use the heuristic from the paper
    const sorted = [...candidates].sort((a, b) => a.distance - b.distance);
    return sorted.slice(0, maxCount);
  }

  private updateEntryPoint(): void {
    if (this.nodes.size === 0) {
      this.entryPointId = null;
      this.maxLevel = 0;
      return;
    }

    // Find node with highest level
    let maxLevel = -1;
    let entryPoint: string | null = null;

    for (const [id, node] of this.nodes) {
      if (node.maxLayer > maxLevel) {
        maxLevel = node.maxLayer;
        entryPoint = id;
      }
    }

    this.entryPointId = entryPoint;
    this.maxLevel = maxLevel;
  }

  private distanceToSimilarity(distance: number): number {
    switch (this.config.metric) {
      case "cosine":
        // Cosine distance = 1 - cosine similarity
        return 1 - distance;
      case "euclidean":
        // Convert euclidean distance to similarity (0-1 range)
        return 1 / (1 + distance);
      case "dot":
        // Dot product distance was negated
        return -distance;
      default:
        return 1 - distance;
    }
  }
}

/**
 * Create an HNSW index.
 */
export function createHNSWIndex(config: Partial<HNSWConfig> = {}): HNSWIndex {
  return new HNSWIndex(config);
}
