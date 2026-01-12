/**
 * Consistent Hashing for Horizontal Scaling
 *
 * Implements consistent hashing with virtual nodes for even distribution
 * of documents across server instances.
 *
 * Features:
 * - Virtual nodes for better load distribution
 * - Minimal key remapping on node changes
 * - Weighted nodes for heterogeneous servers
 * - Health-aware routing
 */

// ============================================================================
// Types
// ============================================================================

/** Server node */
export interface ServerNode {
  /** Unique server ID */
  id: string;
  /** Server address (host:port) */
  address: string;
  /** Weight for load balancing (default: 1) */
  weight: number;
  /** Whether the node is healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastHealthCheck: number;
  /** Current load (connections or requests) */
  currentLoad: number;
  /** Maximum capacity */
  maxCapacity: number;
  /** Node metadata */
  metadata?: Record<string, unknown>;
}

/** Hash ring configuration */
export interface HashRingConfig {
  /** Number of virtual nodes per physical node (default: 150) */
  virtualNodes: number;
  /** Hash algorithm (default: "fnv1a") */
  hashAlgorithm: "fnv1a" | "murmur3" | "xxhash";
  /** Replication factor (default: 1) */
  replicationFactor: number;
  /** Enable sticky routing (default: true) */
  stickyRouting: boolean;
}

/** Virtual node on the ring */
interface VirtualNode {
  /** Hash position on the ring */
  hash: number;
  /** Physical node ID */
  nodeId: string;
  /** Virtual node index */
  index: number;
}

/** Routing result */
export interface RoutingResult {
  /** Primary node */
  primary: ServerNode;
  /** Replica nodes (if replication enabled) */
  replicas: ServerNode[];
  /** Hash value of the key */
  hash: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HashRingConfig = {
  virtualNodes: 150,
  hashAlgorithm: "fnv1a",
  replicationFactor: 1,
  stickyRouting: true,
};

// ============================================================================
// Hash Functions
// ============================================================================

/**
 * FNV-1a hash function (fast, good distribution).
 */
function fnv1aHash(input: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, convert to unsigned
  }
  return hash;
}

/**
 * MurmurHash3-like simplified implementation.
 */
function murmur3Hash(input: string, seed = 0): number {
  let h = seed;
  for (let i = 0; i < input.length; i++) {
    let k = input.charCodeAt(i);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }
  h ^= input.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * xxHash-like simplified implementation.
 */
function xxHash(input: string, seed = 0): number {
  const prime1 = 2654435761;
  const prime2 = 2246822519;
  const prime3 = 3266489917;
  const prime4 = 668265263;
  const prime5 = 374761393;

  let h = seed + prime5;
  let i = 0;

  while (i + 4 <= input.length) {
    let k =
      input.charCodeAt(i) |
      (input.charCodeAt(i + 1) << 8) |
      (input.charCodeAt(i + 2) << 16) |
      (input.charCodeAt(i + 3) << 24);
    k = Math.imul(k, prime3);
    k = (k << 17) | (k >>> 15);
    k = Math.imul(k, prime4);
    h ^= k;
    h = (h << 11) | (h >>> 21);
    h = Math.imul(h, prime1) + prime4;
    i += 4;
  }

  while (i < input.length) {
    h ^= Math.imul(input.charCodeAt(i), prime5);
    h = (h << 11) | (h >>> 21);
    h = Math.imul(h, prime1);
    i++;
  }

  h ^= h >>> 15;
  h = Math.imul(h, prime2);
  h ^= h >>> 13;
  h = Math.imul(h, prime3);
  h ^= h >>> 16;

  return h >>> 0;
}

function getHashFunction(algorithm: HashRingConfig["hashAlgorithm"]): (input: string) => number {
  switch (algorithm) {
    case "fnv1a":
      return fnv1aHash;
    case "murmur3":
      return murmur3Hash;
    case "xxhash":
      return xxHash;
  }
}

// ============================================================================
// Consistent Hash Ring
// ============================================================================

/**
 * Consistent Hash Ring
 *
 * Implements consistent hashing for distributing keys across server nodes.
 */
export class ConsistentHashRing {
  private readonly config: HashRingConfig;
  private readonly hash: (input: string) => number;
  private readonly nodes = new Map<string, ServerNode>();
  private ring: VirtualNode[] = [];
  private dirty = false;

  constructor(config: Partial<HashRingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hash = getHashFunction(this.config.hashAlgorithm);
  }

  /**
   * Add a node to the ring.
   */
  addNode(node: ServerNode): void {
    if (this.nodes.has(node.id)) {
      // Update existing node
      this.nodes.set(node.id, node);
    } else {
      this.nodes.set(node.id, node);
    }
    this.dirty = true;
  }

  /**
   * Remove a node from the ring.
   */
  removeNode(nodeId: string): boolean {
    const removed = this.nodes.delete(nodeId);
    if (removed) {
      this.dirty = true;
    }
    return removed;
  }

  /**
   * Update node health status.
   */
  updateNodeHealth(nodeId: string, healthy: boolean): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.healthy = healthy;
      node.lastHealthCheck = Date.now();
    }
  }

  /**
   * Update node load.
   */
  updateNodeLoad(nodeId: string, load: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.currentLoad = load;
    }
  }

  /**
   * Get the node responsible for a key.
   */
  getNode(key: string): RoutingResult | null {
    this.ensureRingBuilt();

    if (this.ring.length === 0) {
      return null;
    }

    const hash = this.hash(key);
    const primaryVNode = this.findVirtualNode(hash);

    if (!primaryVNode) {
      return null;
    }

    const primary = this.nodes.get(primaryVNode.nodeId);
    if (!primary) {
      return null;
    }

    const replicas = this.selectReplicas(primaryVNode, primary);

    return { primary, replicas, hash };
  }

  private selectReplicas(
    primaryVNode: (typeof this.ring)[number],
    primary: ServerNode
  ): ServerNode[] {
    if (this.config.replicationFactor <= 1) {
      return [];
    }

    const replicas: ServerNode[] = [];
    const seenNodes = new Set([primary.id]);
    const startIndex = this.ring.indexOf(primaryVNode);
    let pos = startIndex;

    while (replicas.length < this.config.replicationFactor - 1) {
      pos = (pos + 1) % this.ring.length;
      if (pos === startIndex) {
        break;
      }

      const vnode = this.ring[pos];
      if (seenNodes.has(vnode.nodeId)) {
        continue;
      }

      const node = this.nodes.get(vnode.nodeId);
      if (node?.healthy) {
        replicas.push(node);
        seenNodes.add(vnode.nodeId);
      }
    }

    return replicas;
  }

  /**
   * Get node with health-aware routing.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: walks consistent hash ring with replica selection and health checks
  getNodeHealthy(key: string): RoutingResult | null {
    this.ensureRingBuilt();

    if (this.ring.length === 0) {
      return null;
    }

    const hash = this.hash(key);
    let startPos = this.findVirtualNodeIndex(hash);
    let attempts = 0;

    // Walk the ring until we find a healthy node
    while (attempts < this.ring.length) {
      const vnode = this.ring[startPos];
      const node = this.nodes.get(vnode.nodeId);

      if (node?.healthy) {
        const replicas: ServerNode[] = [];
        // Find healthy replicas
        if (this.config.replicationFactor > 1) {
          const seenNodes = new Set([node.id]);
          let pos = startPos;

          while (replicas.length < this.config.replicationFactor - 1) {
            pos = (pos + 1) % this.ring.length;
            const replicaVNode = this.ring[pos];

            if (!seenNodes.has(replicaVNode.nodeId)) {
              const replicaNode = this.nodes.get(replicaVNode.nodeId);
              if (replicaNode?.healthy) {
                replicas.push(replicaNode);
                seenNodes.add(replicaVNode.nodeId);
              }
            }

            if (pos === startPos) {
              break;
            }
          }
        }

        return { primary: node, replicas, hash };
      }

      startPos = (startPos + 1) % this.ring.length;
      attempts++;
    }

    return null;
  }

  /**
   * Get node with load balancing (least connections).
   */
  getNodeLoadBalanced(key: string): RoutingResult | null {
    this.ensureRingBuilt();

    if (this.nodes.size === 0) {
      return null;
    }

    const hash = this.hash(key);

    // Find healthy nodes sorted by load
    const healthyNodes = Array.from(this.nodes.values())
      .filter((n) => n.healthy && n.currentLoad < n.maxCapacity)
      .sort((a, b) => {
        // Sort by load ratio (current/max)
        const ratioA = a.currentLoad / a.maxCapacity;
        const ratioB = b.currentLoad / b.maxCapacity;
        return ratioA - ratioB;
      });

    if (healthyNodes.length === 0) {
      // Fallback to any available node
      return this.getNodeHealthy(key);
    }

    const primary = healthyNodes[0];
    const replicas = healthyNodes.slice(1, this.config.replicationFactor);

    return { primary, replicas, hash };
  }

  /**
   * Get all nodes.
   */
  getNodes(): ServerNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get healthy nodes.
   */
  getHealthyNodes(): ServerNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.healthy);
  }

  /**
   * Get node by ID.
   */
  getNodeById(nodeId: string): ServerNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get ring statistics.
   */
  getStats(): {
    nodeCount: number;
    healthyNodeCount: number;
    virtualNodeCount: number;
    averageLoad: number;
    loadDistribution: Map<string, number>;
  } {
    this.ensureRingBuilt();

    const nodes = Array.from(this.nodes.values());
    const healthyNodes = nodes.filter((n) => n.healthy);
    const totalLoad = nodes.reduce((sum, n) => sum + n.currentLoad, 0);

    const loadDistribution = new Map<string, number>();
    for (const node of nodes) {
      loadDistribution.set(node.id, node.currentLoad);
    }

    return {
      nodeCount: nodes.length,
      healthyNodeCount: healthyNodes.length,
      virtualNodeCount: this.ring.length,
      averageLoad: nodes.length > 0 ? totalLoad / nodes.length : 0,
      loadDistribution,
    };
  }

  /**
   * Simulate key distribution across nodes.
   */
  simulateDistribution(keyCount: number): Map<string, number> {
    const distribution = new Map<string, number>();

    for (let i = 0; i < keyCount; i++) {
      const key = `test-key-${i}`;
      const result = this.getNode(key);

      if (result) {
        const current = distribution.get(result.primary.id) || 0;
        distribution.set(result.primary.id, current + 1);
      }
    }

    return distribution;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureRingBuilt(): void {
    if (!this.dirty && this.ring.length > 0) {
      return;
    }

    this.buildRing();
    this.dirty = false;
  }

  private buildRing(): void {
    this.ring = [];

    for (const [nodeId, node] of this.nodes) {
      // Adjust virtual nodes based on weight
      const vnodeCount = Math.round(this.config.virtualNodes * node.weight);

      for (let i = 0; i < vnodeCount; i++) {
        const key = `${nodeId}#${i}`;
        const hash = this.hash(key);

        this.ring.push({
          hash,
          nodeId,
          index: i,
        });
      }
    }

    // Sort ring by hash
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  private findVirtualNode(hash: number): VirtualNode | null {
    if (this.ring.length === 0) {
      return null;
    }

    const index = this.findVirtualNodeIndex(hash);
    return this.ring[index];
  }

  private findVirtualNodeIndex(hash: number): number {
    if (this.ring.length === 0) {
      return 0;
    }

    // Binary search for the first vnode with hash >= target
    let low = 0;
    let high = this.ring.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ring[mid].hash < hash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    // Wrap around if hash is greater than all vnodes
    if (this.ring[low].hash < hash) {
      return 0;
    }

    return low;
  }
}

/**
 * Create a consistent hash ring.
 */
export function createHashRing(config: Partial<HashRingConfig> = {}): ConsistentHashRing {
  return new ConsistentHashRing(config);
}

/**
 * Create a server node.
 */
export function createServerNode(
  id: string,
  address: string,
  options: Partial<Omit<ServerNode, "id" | "address">> = {}
): ServerNode {
  return {
    id,
    address,
    weight: options.weight ?? 1,
    healthy: options.healthy ?? true,
    lastHealthCheck: options.lastHealthCheck ?? Date.now(),
    currentLoad: options.currentLoad ?? 0,
    maxCapacity: options.maxCapacity ?? 1000,
    metadata: options.metadata,
  };
}
