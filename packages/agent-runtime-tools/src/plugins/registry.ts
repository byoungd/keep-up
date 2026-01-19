/**
 * Plugin Registry
 *
 * Manages plugin discovery, storage, and marketplace-like operations.
 * Provides plugin search, versioning, and update capabilities.
 */

import type { PluginCapability, PluginInfo, PluginManifest, PluginType } from "./types";

// ============================================================================
// Registry Types
// ============================================================================

export interface PluginSearchQuery {
  /** Search by text (name, description, keywords) */
  text?: string;

  /** Filter by plugin type */
  type?: PluginType;

  /** Filter by required capabilities */
  capabilities?: PluginCapability[];

  /** Filter by author */
  author?: string;

  /** Filter by keywords */
  keywords?: string[];

  /** Pagination offset */
  offset?: number;

  /** Pagination limit */
  limit?: number;
}

export interface PluginSearchResult {
  /** Matching plugins */
  plugins: PluginRegistryEntry[];

  /** Total count (for pagination) */
  total: number;

  /** Search metadata */
  meta: {
    query: PluginSearchQuery;
    searchTimeMs: number;
  };
}

export interface PluginRegistryEntry {
  /** Plugin manifest */
  manifest: PluginManifest;

  /** Installation status */
  installed: boolean;

  /** Installed version (if installed) */
  installedVersion?: string;

  /** Available update version */
  updateAvailable?: string;

  /** Download count */
  downloads?: number;

  /** Rating (1-5) */
  rating?: number;

  /** Last updated timestamp */
  lastUpdated?: number;

  /** Source URL or path */
  source: string;

  /** Verified/trusted plugin */
  verified?: boolean;
}

export interface IPluginRegistry {
  /** Search for plugins */
  search(query: PluginSearchQuery): Promise<PluginSearchResult>;

  /** Get plugin by ID */
  get(pluginId: string): Promise<PluginRegistryEntry | undefined>;

  /** Register a local plugin */
  register(manifest: PluginManifest, source: string): Promise<void>;

  /** Unregister a plugin */
  unregister(pluginId: string): Promise<void>;

  /** Check for updates */
  checkUpdates(installedPlugins: PluginInfo[]): Promise<PluginRegistryEntry[]>;

  /** List all registered plugins */
  list(): Promise<PluginRegistryEntry[]>;
}

// ============================================================================
// In-Memory Registry Implementation
// ============================================================================

/**
 * Simple in-memory plugin registry.
 * Suitable for local development and testing.
 */
export class InMemoryPluginRegistry implements IPluginRegistry {
  private readonly plugins = new Map<string, PluginRegistryEntry>();

  async search(query: PluginSearchQuery): Promise<PluginSearchResult> {
    const startTime = Date.now();
    let results = Array.from(this.plugins.values());

    // Text search
    if (query.text) {
      const text = query.text.toLowerCase();
      results = results.filter(
        (p) =>
          p.manifest.name.toLowerCase().includes(text) ||
          p.manifest.description.toLowerCase().includes(text) ||
          p.manifest.keywords?.some((k) => k.toLowerCase().includes(text))
      );
    }

    // Type filter
    if (query.type) {
      results = results.filter((p) => p.manifest.type === query.type);
    }

    // Capabilities filter
    if (query.capabilities && query.capabilities.length > 0) {
      results = results.filter((p) =>
        query.capabilities?.every((cap) => p.manifest.capabilities.includes(cap))
      );
    }

    // Author filter
    if (query.author) {
      results = results.filter((p) => p.manifest.author === query.author);
    }

    // Keywords filter
    if (query.keywords && query.keywords.length > 0) {
      results = results.filter(
        (p) => p.manifest.keywords && query.keywords?.some((k) => p.manifest.keywords?.includes(k))
      );
    }

    const total = results.length;

    // Pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    results = results.slice(offset, offset + limit);

    return {
      plugins: results,
      total,
      meta: {
        query,
        searchTimeMs: Date.now() - startTime,
      },
    };
  }

  async get(pluginId: string): Promise<PluginRegistryEntry | undefined> {
    return this.plugins.get(pluginId);
  }

  async register(manifest: PluginManifest, source: string): Promise<void> {
    const existing = this.plugins.get(manifest.id);

    this.plugins.set(manifest.id, {
      manifest,
      installed: existing?.installed ?? false,
      installedVersion: existing?.installedVersion,
      source,
      lastUpdated: Date.now(),
      downloads: existing?.downloads ?? 0,
    });
  }

  async unregister(pluginId: string): Promise<void> {
    this.plugins.delete(pluginId);
  }

  async checkUpdates(installedPlugins: PluginInfo[]): Promise<PluginRegistryEntry[]> {
    const updates: PluginRegistryEntry[] = [];

    for (const installed of installedPlugins) {
      const registry = this.plugins.get(installed.manifest.id);
      if (registry && isNewerVersion(registry.manifest.version, installed.manifest.version)) {
        updates.push({
          ...registry,
          installed: true,
          installedVersion: installed.manifest.version,
          updateAvailable: registry.manifest.version,
        });
      }
    }

    return updates;
  }

  async list(): Promise<PluginRegistryEntry[]> {
    return Array.from(this.plugins.values());
  }

  /**
   * Mark a plugin as installed (for testing/internal use).
   */
  markInstalled(pluginId: string, version: string): void {
    const entry = this.plugins.get(pluginId);
    if (entry) {
      entry.installed = true;
      entry.installedVersion = version;
    }
  }

  /**
   * Increment download count (for testing/internal use).
   */
  incrementDownloads(pluginId: string): void {
    const entry = this.plugins.get(pluginId);
    if (entry) {
      entry.downloads = (entry.downloads ?? 0) + 1;
    }
  }
}

// ============================================================================
// Plugin Resolver
// ============================================================================

/**
 * Resolves plugin sources to loadable modules.
 */
export interface IPluginResolver {
  /** Resolve a plugin source to a loadable module */
  resolve(source: string): Promise<unknown>;

  /** Check if a source is valid */
  validate(source: string): Promise<boolean>;
}

/**
 * File system plugin resolver.
 * Loads plugins from local file paths.
 */
export class FileSystemPluginResolver implements IPluginResolver {
  async resolve(source: string): Promise<unknown> {
    // In a real implementation, this would:
    // 1. Validate the path
    // 2. Load the module dynamically
    // 3. Validate the exported plugin interface
    throw new Error(`File system resolution not implemented: ${source}`);
  }

  async validate(source: string): Promise<boolean> {
    // Check if path exists and is a valid plugin
    return source.startsWith("/") || source.startsWith("./");
  }
}

/**
 * NPM package plugin resolver.
 * Loads plugins from npm packages.
 */
export class NPMPluginResolver implements IPluginResolver {
  async resolve(source: string): Promise<unknown> {
    // In a real implementation, this would:
    // 1. Parse the package spec
    // 2. Check if installed, install if not
    // 3. Require the package
    throw new Error(`NPM resolution not implemented: ${source}`);
  }

  async validate(source: string): Promise<boolean> {
    // Check if it looks like an npm package
    return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@.*)?$/.test(source);
  }
}

// ============================================================================
// Version Utilities
// ============================================================================

/**
 * Check if version a is newer than version b.
 * Simple semver comparison.
 */
function isNewerVersion(a: string, b: string): boolean {
  const parseVersion = (v: string): number[] => {
    return v
      .replace(/^v/, "")
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0);
  };

  const vA = parseVersion(a);
  const vB = parseVersion(b);

  for (let i = 0; i < Math.max(vA.length, vB.length); i++) {
    const partA = vA[i] ?? 0;
    const partB = vB[i] ?? 0;
    if (partA > partB) {
      return true;
    }
    if (partA < partB) {
      return false;
    }
  }

  return false;
}

/**
 * Check if a version satisfies a semver range.
 * Simplified implementation supporting: exact, ^, ~, >=, >, <=, <
 */
export function satisfiesVersion(version: string, range: string): boolean {
  const parseVersion = (v: string): number[] => {
    return v
      .replace(/^[v^~>=<]+/, "")
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0);
  };

  const compareVersions = (a: number[], b: number[]): number => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const partA = a[i] ?? 0;
      const partB = b[i] ?? 0;
      if (partA > partB) {
        return 1;
      }
      if (partA < partB) {
        return -1;
      }
    }
    return 0;
  };

  const v = parseVersion(version);
  const r = parseVersion(range);
  const cmp = compareVersions(v, r);

  // Caret (^) - allows minor and patch updates
  if (range.startsWith("^")) {
    return v[0] === r[0] && (v[1] > r[1] || (v[1] === r[1] && v[2] >= r[2]));
  }

  // Tilde (~) - allows patch updates
  if (range.startsWith("~")) {
    return v[0] === r[0] && v[1] === r[1] && v[2] >= r[2];
  }

  // Greater than or equal
  if (range.startsWith(">=")) {
    return cmp >= 0;
  }

  // Greater than
  if (range.startsWith(">")) {
    return cmp > 0;
  }

  // Less than or equal
  if (range.startsWith("<=")) {
    return cmp <= 0;
  }

  // Less than
  if (range.startsWith("<")) {
    return cmp < 0;
  }

  // Exact match
  return cmp === 0;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an in-memory plugin registry.
 */
export function createPluginRegistry(): InMemoryPluginRegistry {
  return new InMemoryPluginRegistry();
}
