/**
 * Plugin Dependency Resolver
 *
 * Handles plugin dependency resolution, topological sorting,
 * and circular dependency detection.
 */

import { satisfiesVersion } from "./registry";
import type { PluginDependency, PluginInfo, PluginManifest } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface DependencyGraph {
  /** All plugin IDs in the graph */
  plugins: Set<string>;

  /** Adjacency list: plugin -> dependencies */
  dependencies: Map<string, Set<string>>;

  /** Reverse adjacency: plugin -> dependents */
  dependents: Map<string, Set<string>>;
}

export interface ResolutionResult {
  /** Whether resolution succeeded */
  success: boolean;

  /** Topologically sorted plugin IDs (load order) */
  loadOrder: string[];

  /** Missing dependencies */
  missing: MissingDependency[];

  /** Version conflicts */
  conflicts: VersionConflict[];

  /** Circular dependencies detected */
  circular: string[][];

  /** Optional dependencies that couldn't be resolved */
  optionalMissing: string[];
}

export interface MissingDependency {
  /** Plugin that requires the dependency */
  requiredBy: string;

  /** The missing dependency */
  dependency: PluginDependency;
}

export interface VersionConflict {
  /** Plugin ID with version conflict */
  pluginId: string;

  /** Required version range */
  requiredVersion: string;

  /** Actual version available */
  availableVersion: string;

  /** Plugin that requires this version */
  requiredBy: string;
}

// ============================================================================
// Dependency Resolver
// ============================================================================

/**
 * Resolves plugin dependencies and determines load order.
 */
export class PluginDependencyResolver {
  private readonly availablePlugins = new Map<string, PluginManifest>();
  private readonly loadedPlugins = new Map<string, PluginInfo>();

  /**
   * Register an available plugin manifest.
   */
  registerAvailable(manifest: PluginManifest): void {
    this.availablePlugins.set(manifest.id, manifest);
  }

  /**
   * Register a loaded plugin.
   */
  registerLoaded(info: PluginInfo): void {
    this.loadedPlugins.set(info.manifest.id, info);
  }

  /**
   * Unregister a plugin.
   */
  unregister(pluginId: string): void {
    this.availablePlugins.delete(pluginId);
    this.loadedPlugins.delete(pluginId);
  }

  /**
   * Resolve dependencies for a set of plugins.
   */
  resolve(pluginIds: string[]): ResolutionResult {
    const result: ResolutionResult = {
      success: true,
      loadOrder: [],
      missing: [],
      conflicts: [],
      circular: [],
      optionalMissing: [],
    };

    // Build dependency graph
    const graph = this.buildDependencyGraph(pluginIds, result);

    // Detect circular dependencies
    const cycles = this.detectCycles(graph);
    if (cycles.length > 0) {
      result.circular = cycles;
      result.success = false;
    }

    // Topological sort for load order
    if (result.success) {
      const sorted = this.topologicalSort(graph);
      if (sorted) {
        result.loadOrder = sorted;
      } else {
        result.success = false;
      }
    }

    // Check for missing required dependencies
    if (result.missing.length > 0) {
      result.success = false;
    }

    // Check for version conflicts
    if (result.conflicts.length > 0) {
      result.success = false;
    }

    return result;
  }

  /**
   * Check if a plugin can be loaded (all dependencies satisfied).
   */
  canLoad(pluginId: string): { canLoad: boolean; reason?: string } {
    const manifest = this.availablePlugins.get(pluginId);
    if (!manifest) {
      return { canLoad: false, reason: `Plugin ${pluginId} not found` };
    }

    if (!manifest.dependencies) {
      return { canLoad: true };
    }

    for (const dep of manifest.dependencies) {
      if (dep.optional) {
        continue;
      }

      const depInfo = this.loadedPlugins.get(dep.id);
      if (!depInfo) {
        return { canLoad: false, reason: `Required dependency ${dep.id} not loaded` };
      }

      if (!satisfiesVersion(depInfo.manifest.version, dep.version)) {
        return {
          canLoad: false,
          reason: `Dependency ${dep.id} version ${depInfo.manifest.version} does not satisfy ${dep.version}`,
        };
      }
    }

    return { canLoad: true };
  }

  /**
   * Get dependents of a plugin (plugins that depend on it).
   */
  getDependents(pluginId: string): string[] {
    const dependents: string[] = [];

    for (const [id, manifest] of this.availablePlugins) {
      if (manifest.dependencies?.some((d) => d.id === pluginId)) {
        dependents.push(id);
      }
    }

    return dependents;
  }

  /**
   * Check if a plugin can be unloaded (no active dependents).
   */
  canUnload(pluginId: string): { canUnload: boolean; blockedBy?: string[] } {
    const activeDependents: string[] = [];

    for (const [id, info] of this.loadedPlugins) {
      if (info.state !== "active") {
        continue;
      }

      const manifest = this.availablePlugins.get(id);
      if (manifest?.dependencies?.some((d) => d.id === pluginId && !d.optional)) {
        activeDependents.push(id);
      }
    }

    if (activeDependents.length > 0) {
      return { canUnload: false, blockedBy: activeDependents };
    }

    return { canUnload: true };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: builds plugin dependency graph with multiple validation steps
  private buildDependencyGraph(pluginIds: string[], result: ResolutionResult): DependencyGraph {
    const graph: DependencyGraph = {
      plugins: new Set(),
      dependencies: new Map(),
      dependents: new Map(),
    };

    const toProcess = [...pluginIds];
    const processed = new Set<string>();

    while (toProcess.length > 0) {
      const pluginId = toProcess.pop();
      if (!pluginId || processed.has(pluginId)) {
        continue;
      }

      processed.add(pluginId);
      graph.plugins.add(pluginId);

      if (!graph.dependencies.has(pluginId)) {
        graph.dependencies.set(pluginId, new Set());
      }

      const manifest = this.availablePlugins.get(pluginId);
      if (!manifest) {
        // Plugin not found, but might be already loaded
        const loaded = this.loadedPlugins.get(pluginId);
        if (!loaded) {
          result.missing.push({
            requiredBy: pluginId,
            dependency: { id: pluginId, version: "*" },
          });
        }
        continue;
      }

      if (!manifest.dependencies) {
        continue;
      }

      for (const dep of manifest.dependencies) {
        // Check if dependency is available
        const depManifest = this.availablePlugins.get(dep.id);
        const depLoaded = this.loadedPlugins.get(dep.id);

        if (!depManifest && !depLoaded) {
          if (dep.optional) {
            result.optionalMissing.push(dep.id);
          } else {
            result.missing.push({ requiredBy: pluginId, dependency: dep });
          }
          continue;
        }

        // Check version compatibility
        const availableVersion = depLoaded?.manifest.version ?? depManifest?.version;
        if (availableVersion && !satisfiesVersion(availableVersion, dep.version)) {
          result.conflicts.push({
            pluginId: dep.id,
            requiredVersion: dep.version,
            availableVersion,
            requiredBy: pluginId,
          });
        }

        // Add to graph
        graph.dependencies.get(pluginId)?.add(dep.id);

        if (!graph.dependents.has(dep.id)) {
          graph.dependents.set(dep.id, new Set());
        }
        graph.dependents.get(dep.id)?.add(pluginId);

        // Process dependency's dependencies
        if (!processed.has(dep.id)) {
          toProcess.push(dep.id);
        }
      }
    }

    return graph;
  }

  private detectCycles(graph: DependencyGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const deps = graph.dependencies.get(node) ?? new Set();
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep);
        } else if (recursionStack.has(dep)) {
          // Found cycle
          const cycleStart = path.indexOf(dep);
          cycles.push([...path.slice(cycleStart), dep]);
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    for (const plugin of graph.plugins) {
      if (!visited.has(plugin)) {
        dfs(plugin);
      }
    }

    return cycles;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: topo sort balances dependencies and cycles detection
  private topologicalSort(graph: DependencyGraph): string[] | null {
    const inDegree = new Map<string, number>();
    const result: string[] = [];

    // Initialize in-degrees
    for (const plugin of graph.plugins) {
      inDegree.set(plugin, 0);
    }

    // Calculate in-degrees
    for (const [, deps] of graph.dependencies) {
      for (const dep of deps) {
        if (graph.plugins.has(dep)) {
          inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
        }
      }
    }

    // Find nodes with no incoming edges
    const queue: string[] = [];
    for (const [plugin, degree] of inDegree) {
      if (degree === 0) {
        queue.push(plugin);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) {
        break;
      }

      result.push(node);

      // For topological sort, we want dependencies loaded first
      // So we need to reverse the direction
      const dependents = graph.dependents.get(node) ?? new Set();
      for (const dependent of dependents) {
        const newDegree = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check if all nodes were processed (no cycles)
    if (result.length !== graph.plugins.size) {
      return null;
    }

    // Reverse to get correct load order (dependencies first)
    return result.reverse();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a plugin dependency resolver.
 */
export function createDependencyResolver(): PluginDependencyResolver {
  return new PluginDependencyResolver();
}
