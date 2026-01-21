/**
 * Optimized Dependency Analyzer
 *
 * Efficiently analyzes tool call dependencies for parallel execution.
 * Uses graph-based algorithms for O(n) complexity instead of O(n²).
 *
 * Features:
 * - Graph-based dependency resolution
 * - Topological sorting for execution order
 * - Cycle detection
 * - Resource conflict detection
 */

import type { MCPToolCall } from "../types";

// ============================================================================
// Types
// ============================================================================

/** Dependency graph node */
interface DependencyNode {
  /** Tool call */
  call: MCPToolCall;
  /** Index in original array */
  index: number;
  /** Dependencies (indices) */
  dependencies: Set<number>;
  /** Dependents (indices) */
  dependents: Set<number>;
  /** Resource identifier (if applicable) */
  resources: string[];
  /** Execution group */
  group: number;
}

/** Dependency analysis result */
export interface DependencyAnalysis {
  /** Execution groups (each group can run in parallel) */
  groups: MCPToolCall[][];
  /** Dependency graph */
  graph: Map<number, DependencyNode>;
  /** Detected cycles */
  cycles: number[][];
  /** Resource conflicts */
  conflicts: Array<{ resource: string; calls: number[] }>;
}

/** Resource extractor function */
type ResourceExtractor = (call: MCPToolCall) => string[];

// ============================================================================
// Resource Extractors
// ============================================================================

const RESOURCE_EXTRACTORS: Array<{ pattern: RegExp; extractor: ResourceExtractor }> = [
  {
    pattern: /^file:(write|delete|move|copy|rename)$/,
    extractor: (call) => extractFileResources(call),
  },
  {
    pattern: /^lfcc:(update_block|delete_block|insert_block)$/,
    extractor: (call) => {
      const docId = call.arguments?.docId as string | undefined;
      const blockId = call.arguments?.blockId as string | undefined;
      return docId ? [`lfcc:${docId}${blockId ? `:${blockId}` : ""}`] : [];
    },
  },
  {
    pattern: /^git:(commit|push|merge|rebase|checkout|pull)$/,
    extractor: () => ["git:repository"], // Mutating git ops serialize on repo
  },
];

/**
 * Tools that always serialize (must execute one at a time).
 *
 * These tools have side effects that could conflict if run in parallel.
 * Read-only tools like `git:status`, `git:log`, `file:read` are NOT here
 * and can safely run in parallel.
 *
 * @example
 * ```ts
 * // Extend with custom serialized tools
 * SERIALIZED_TOOLS.add('custom:dangerous-op');
 * ```
 */
export const SERIALIZED_TOOLS = new Set([
  "bash:execute",
  "git:commit",
  "git:push",
  "git:merge",
  "git:rebase",
  "git:checkout",
  "git:pull",
]);

// ============================================================================
// Dependency Analyzer
// ============================================================================

/**
 * Optimized Dependency Analyzer
 *
 * Analyzes tool call dependencies using graph algorithms.
 */
export class DependencyAnalyzer {
  /**
   * Analyze dependencies and group for parallel execution.
   */
  analyze(calls: MCPToolCall[]): DependencyAnalysis {
    if (calls.length === 0) {
      return {
        groups: [],
        graph: new Map(),
        cycles: [],
        conflicts: [],
      };
    }

    // Build dependency graph
    const graph = this.buildGraph(calls);

    // Detect cycles
    const cycles = this.detectCycles(graph);

    // Topological sort to determine execution groups
    const groups = this.topologicalGroup(graph, calls);

    // Detect resource conflicts
    const conflicts = this.detectConflicts(graph);

    return {
      groups,
      graph,
      cycles,
      conflicts,
    };
  }

  /**
   * Build dependency graph from tool calls.
   */
  private buildGraph(calls: MCPToolCall[]): Map<number, DependencyNode> {
    const { graph, resourceMap } = this.initializeNodes(calls);
    this.resolveDependencies(calls, graph, resourceMap);
    return graph;
  }

  private initializeNodes(calls: MCPToolCall[]): {
    graph: Map<number, DependencyNode>;
    resourceMap: Map<string, number[]>;
  } {
    const graph = new Map<number, DependencyNode>();
    const resourceMap = new Map<string, number[]>();

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const resources = this.extractResources(call);

      const node: DependencyNode = {
        call,
        index: i,
        dependencies: new Set(),
        dependents: new Set(),
        resources,
        group: -1,
      };

      graph.set(i, node);

      if (resources.length > 0) {
        for (const resource of resources) {
          if (!resourceMap.has(resource)) {
            resourceMap.set(resource, []);
          }
          resourceMap.get(resource)?.push(i);
        }
      }
    }
    return { graph, resourceMap };
  }

  private resolveDependencies(
    calls: MCPToolCall[],
    graph: Map<number, DependencyNode>,
    resourceMap: Map<string, number[]>
  ): void {
    for (let i = 0; i < calls.length; i++) {
      const node = graph.get(i);
      if (!node) {
        continue;
      }

      const call = calls[i];
      const isSerialized = SERIALIZED_TOOLS.has(call.name);

      if (isSerialized) {
        this.addSerializedDependencies(i, node, graph);
      } else if (node.resources.length > 0) {
        for (const resource of node.resources) {
          this.addResourceDependencies(i, node, resource, resourceMap, graph);
        }
      }
    }
  }

  private addSerializedDependencies(
    currentIndex: number,
    node: DependencyNode,
    graph: Map<number, DependencyNode>
  ): void {
    for (let j = 0; j < currentIndex; j++) {
      node.dependencies.add(j);
      graph.get(j)?.dependents.add(currentIndex);
    }
  }

  private addResourceDependencies(
    currentIndex: number,
    node: DependencyNode,
    resource: string,
    resourceMap: Map<string, number[]>,
    graph: Map<number, DependencyNode>
  ): void {
    const resourceCalls = resourceMap.get(resource) || [];
    for (const j of resourceCalls) {
      if (j < currentIndex) {
        node.dependencies.add(j);
        graph.get(j)?.dependents.add(currentIndex);
      }
    }
  }

  /**
   * Extract resource identifier from tool call.
   */
  private extractResources(call: MCPToolCall): string[] {
    for (const { pattern, extractor } of RESOURCE_EXTRACTORS) {
      if (pattern.test(call.name)) {
        return extractor(call);
      }
    }
    return [];
  }

  /**
   * Detect cycles in dependency graph.
   */
  private detectCycles(graph: Map<number, DependencyNode>): number[][] {
    const cycles: number[][] = [];
    const visited = new Set<number>();
    const recStack = new Set<number>();

    const dfs = (nodeIndex: number, path: number[]): void => {
      if (recStack.has(nodeIndex)) {
        // Cycle detected
        const cycleStart = path.indexOf(nodeIndex);
        cycles.push(path.slice(cycleStart));
        return;
      }

      if (visited.has(nodeIndex)) {
        return;
      }

      visited.add(nodeIndex);
      recStack.add(nodeIndex);

      const node = graph.get(nodeIndex);
      if (node) {
        for (const dep of node.dependencies) {
          dfs(dep, [...path, nodeIndex]);
        }
      }

      recStack.delete(nodeIndex);
    };

    for (const index of graph.keys()) {
      if (!visited.has(index)) {
        dfs(index, []);
      }
    }

    return cycles;
  }

  /**
   * Topological sort to determine execution groups.
   */
  private topologicalGroup(
    graph: Map<number, DependencyNode>,
    _calls: MCPToolCall[]
  ): MCPToolCall[][] {
    const groups: MCPToolCall[][] = [];
    const { inDegree, queue } = this.calculateInDegrees(graph);

    // Process nodes level by level (each level = one group)
    while (queue.length > 0) {
      const currentGroup = this.processLevel(queue, graph, inDegree, groups.length);
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
    }

    // Handle remaining nodes (cycles or errors)
    this.handleRemainingNodes(graph, groups);

    return groups;
  }

  private processLevel(
    queue: number[],
    graph: Map<number, DependencyNode>,
    inDegree: Map<number, number>,
    groupId: number
  ): MCPToolCall[] {
    const currentGroup: MCPToolCall[] = [];
    const currentLevelSize = queue.length;

    for (let i = 0; i < currentLevelSize; i++) {
      const index = queue.shift();
      if (index === undefined) {
        continue;
      }

      const node = graph.get(index);
      if (!node) {
        continue;
      }

      currentGroup.push(node.call);
      node.group = groupId;

      // Update dependents
      for (const dependent of node.dependents) {
        const depInDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, depInDegree);

        if (depInDegree === 0) {
          queue.push(dependent);
        }
      }
    }
    return currentGroup;
  }

  private calculateInDegrees(graph: Map<number, DependencyNode>): {
    inDegree: Map<number, number>;
    queue: number[];
  } {
    const inDegree = new Map<number, number>();
    const queue: number[] = [];

    for (const [index, node] of graph) {
      inDegree.set(index, node.dependencies.size);
      if (node.dependencies.size === 0) {
        queue.push(index);
      }
    }
    return { inDegree, queue };
  }

  private handleRemainingNodes(graph: Map<number, DependencyNode>, groups: MCPToolCall[][]): void {
    for (const [_index, node] of graph) {
      if (node.group === -1) {
        // Put in a separate group
        if (groups.length === 0 || groups[groups.length - 1].length > 0) {
          groups.push([]);
        }
        groups[groups.length - 1].push(node.call);
        node.group = groups.length - 1;
      }
    }
  }

  /**
   * Detect resource conflicts.
   */
  private detectConflicts(graph: Map<number, DependencyNode>): Array<{
    resource: string;
    calls: number[];
  }> {
    const resourceMap = new Map<string, number[]>();

    for (const [index, node] of graph) {
      for (const resource of node.resources) {
        if (!resourceMap.has(resource)) {
          resourceMap.set(resource, []);
        }
        resourceMap.get(resource)?.push(index);
      }
    }

    const conflicts: Array<{ resource: string; calls: number[] }> = [];

    for (const [resource, indices] of resourceMap) {
      if (indices.length > 1) {
        conflicts.push({ resource, calls: indices });
      }
    }

    return conflicts;
  }
}

/**
 * Create a dependency analyzer.
 */
export function createDependencyAnalyzer(): DependencyAnalyzer {
  return new DependencyAnalyzer();
}

function extractFileResources(call: MCPToolCall): string[] {
  const resources: string[] = [];
  const args = call.arguments as Record<string, unknown>;

  const addPath = (value: unknown): void => {
    if (typeof value === "string" && value.length > 0) {
      resources.push(`file:${value}`);
    }
  };

  addPath(args.path);
  addPath(args.srcPath);
  addPath(args.destPath);
  addPath(args.from);
  addPath(args.to);

  if (Array.isArray(args.paths)) {
    for (const entry of args.paths) {
      addPath(entry);
    }
  }

  return Array.from(new Set(resources));
}
