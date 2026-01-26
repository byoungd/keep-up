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

type AccessMode = "read" | "write";

interface ResourceAccess {
  id: string;
  mode: AccessMode;
}

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
  /** Resource accesses (if applicable) */
  resourceAccesses: ResourceAccess[];
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
type ResourceExtractor = (call: MCPToolCall) => ResourceAccess[];

export type ToolConcurrencyHint = "parallel" | "exclusive";

export type ToolConcurrencyResolver = (toolName: string) => ToolConcurrencyHint | undefined;

export type DependencyAnalysisOptions = {
  resolveConcurrency?: ToolConcurrencyResolver;
};

// ============================================================================
// Resource Extractors
// ============================================================================

const RESOURCE_EXTRACTORS: Array<{ pattern: RegExp; extractor: ResourceExtractor }> = [
  {
    pattern: /^file:(read|list|info)$/,
    extractor: (call) => extractFileAccesses(call, "read"),
  },
  {
    pattern: /^file:(write|delete|move|copy|rename)$/,
    extractor: (call) => extractFileAccesses(call, "write"),
  },
  {
    pattern: /^lfcc:(update_block|delete_block|insert_block)$/,
    extractor: (call) => {
      const docId = call.arguments?.docId as string | undefined;
      const blockId = call.arguments?.blockId as string | undefined;
      return docId ? [{ id: `lfcc:${docId}${blockId ? `:${blockId}` : ""}`, mode: "write" }] : [];
    },
  },
  {
    pattern: /^git:(commit|push|merge|rebase|checkout|pull)$/,
    extractor: () => [{ id: "git:repository", mode: "write" }], // Mutating git ops serialize on repo
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
  constructor(private readonly resolveConcurrency?: ToolConcurrencyResolver) {}

  /**
   * Analyze dependencies and group for parallel execution.
   */
  analyze(calls: MCPToolCall[], options: DependencyAnalysisOptions = {}): DependencyAnalysis {
    if (calls.length === 0) {
      return {
        groups: [],
        graph: new Map(),
        cycles: [],
        conflicts: [],
      };
    }

    const resolveConcurrency = options.resolveConcurrency ?? this.resolveConcurrency;
    // Build dependency graph
    const graph = this.buildGraph(calls, resolveConcurrency);

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
  private buildGraph(
    calls: MCPToolCall[],
    resolveConcurrency?: ToolConcurrencyResolver
  ): Map<number, DependencyNode> {
    const graph = this.initializeNodes(calls);
    this.resolveDependencies(calls, graph, resolveConcurrency);
    return graph;
  }

  private initializeNodes(calls: MCPToolCall[]): Map<number, DependencyNode> {
    const graph = new Map<number, DependencyNode>();

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const resourceAccesses = this.extractResources(call);

      const node: DependencyNode = {
        call,
        index: i,
        dependencies: new Set(),
        dependents: new Set(),
        resourceAccesses,
        group: -1,
      };

      graph.set(i, node);
    }
    return graph;
  }

  private resolveDependencies(
    calls: MCPToolCall[],
    graph: Map<number, DependencyNode>,
    resolveConcurrency?: ToolConcurrencyResolver
  ): void {
    const resourceState = new Map<string, { reads: Set<number>; lastWrite?: number }>();
    let lastExclusiveIndex: number | undefined;

    for (let i = 0; i < calls.length; i++) {
      const node = graph.get(i);
      if (!node) {
        continue;
      }

      const call = calls[i];
      const concurrency = resolveConcurrency?.(call.name);
      const isExclusive = concurrency === "exclusive";
      const isParallel = concurrency === "parallel";
      const isSerialized = !isParallel && SERIALIZED_TOOLS.has(call.name);

      if (lastExclusiveIndex !== undefined && lastExclusiveIndex !== i) {
        node.dependencies.add(lastExclusiveIndex);
        graph.get(lastExclusiveIndex)?.dependents.add(i);
      }

      if (isExclusive) {
        this.addSerializedDependencies(i, node, graph);
        lastExclusiveIndex = i;
        continue;
      }

      if (isSerialized) {
        this.addSerializedDependencies(i, node, graph);
        continue;
      }

      for (const access of node.resourceAccesses) {
        this.applyResourceAccess(i, node, access, resourceState, graph);
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

  private addDependency(
    node: DependencyNode,
    currentIndex: number,
    dependencyIndex: number,
    graph: Map<number, DependencyNode>
  ): void {
    if (dependencyIndex >= currentIndex) {
      return;
    }
    node.dependencies.add(dependencyIndex);
    graph.get(dependencyIndex)?.dependents.add(currentIndex);
  }

  private applyResourceAccess(
    currentIndex: number,
    node: DependencyNode,
    access: ResourceAccess,
    resourceState: Map<string, { reads: Set<number>; lastWrite?: number }>,
    graph: Map<number, DependencyNode>
  ): void {
    const state = resourceState.get(access.id) ?? { reads: new Set<number>() };

    if (access.mode === "read") {
      this.applyReadAccess(currentIndex, node, state, graph);
    } else {
      this.applyWriteAccess(currentIndex, node, state, graph);
    }

    resourceState.set(access.id, state);
  }

  private applyReadAccess(
    currentIndex: number,
    node: DependencyNode,
    state: { reads: Set<number>; lastWrite?: number },
    graph: Map<number, DependencyNode>
  ): void {
    if (state.lastWrite !== undefined) {
      this.addDependency(node, currentIndex, state.lastWrite, graph);
    }
    state.reads.add(currentIndex);
  }

  private applyWriteAccess(
    currentIndex: number,
    node: DependencyNode,
    state: { reads: Set<number>; lastWrite?: number },
    graph: Map<number, DependencyNode>
  ): void {
    if (state.lastWrite !== undefined) {
      this.addDependency(node, currentIndex, state.lastWrite, graph);
    }
    for (const readIndex of state.reads) {
      this.addDependency(node, currentIndex, readIndex, graph);
    }
    state.reads.clear();
    state.lastWrite = currentIndex;
  }

  /**
   * Extract resource identifier from tool call.
   */
  private extractResources(call: MCPToolCall): ResourceAccess[] {
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
    const resourceMap = this.collectResourceConflicts(graph);
    return this.resolveConflictList(resourceMap);
  }

  private collectResourceConflicts(
    graph: Map<number, DependencyNode>
  ): Map<string, { indices: number[]; hasWrite: boolean }> {
    const resourceMap = new Map<string, { indices: number[]; hasWrite: boolean }>();

    for (const [index, node] of graph) {
      for (const access of node.resourceAccesses) {
        const entry = resourceMap.get(access.id) ?? { indices: [], hasWrite: false };
        entry.indices.push(index);
        if (access.mode === "write") {
          entry.hasWrite = true;
        }
        resourceMap.set(access.id, entry);
      }
    }

    return resourceMap;
  }

  private resolveConflictList(
    resourceMap: Map<string, { indices: number[]; hasWrite: boolean }>
  ): Array<{ resource: string; calls: number[] }> {
    const conflicts: Array<{ resource: string; calls: number[] }> = [];

    for (const [resource, entry] of resourceMap) {
      if (entry.indices.length > 1 && entry.hasWrite) {
        conflicts.push({ resource, calls: entry.indices });
      }
    }

    return conflicts;
  }
}

/**
 * Create a dependency analyzer.
 */
export function createDependencyAnalyzer(
  options: DependencyAnalysisOptions = {}
): DependencyAnalyzer {
  return new DependencyAnalyzer(options.resolveConcurrency);
}

function extractFileAccesses(call: MCPToolCall, mode: AccessMode): ResourceAccess[] {
  const resources = extractFilePaths(call);
  return resources.map((resource) => ({ id: resource, mode }));
}

function extractFilePaths(call: MCPToolCall): string[] {
  const resources: string[] = [];
  const args = call.arguments as Record<string, unknown>;

  const addPath = (value: unknown): void => {
    if (typeof value === "string" && value.length > 0) {
      resources.push(`file:${value}`);
    }
  };

  addPath(args.path);
  addPath(args.srcPath);
  addPath(args.sourcePath);
  addPath(args.destPath);
  addPath(args.targetPath);
  addPath(args.from);
  addPath(args.to);
  addPath(args.imagePath);
  addPath(args.audioPath);

  if (Array.isArray(args.paths)) {
    for (const entry of args.paths) {
      addPath(entry);
    }
  }

  return Array.from(new Set(resources));
}
