/**
 * Tool Discovery System
 *
 * Enables on-demand tool loading to save context window tokens.
 * Based on Claude Code Agent pattern of loading tools only when needed.
 */

import type { MCPTool, MCPToolServer } from "../../types";

// ============================================================================
// Tool Discovery Types
// ============================================================================

/**
 * Tool search criteria.
 */
export interface ToolSearchCriteria {
  /** Query string for semantic search */
  query?: string;
  /** Tool category filter */
  category?: "core" | "knowledge" | "external";
  /** Required capabilities */
  capabilities?: string[];
  /** Maximum results to return */
  limit?: number;
}

/**
 * Tool search result.
 */
export interface ToolSearchResult {
  /** Matched tool */
  tool: MCPTool;
  /** Server providing this tool */
  server: MCPToolServer;
  /** Relevance score (0-1) */
  score: number;
  /** Why this tool matched */
  matchReason: string;
}

/**
 * Tool metadata for discovery.
 */
export interface ToolMetadata {
  /** Tool name */
  name: string;
  /** Server name */
  serverName: string;
  /** Categories */
  categories: string[];
  /** Keywords for search */
  keywords: string[];
  /** Usage examples */
  examples?: string[];
  /** Typical use cases */
  useCases?: string[];
}

// ============================================================================
// Tool Discovery Engine
// ============================================================================

/**
 * Tool discovery engine for on-demand tool loading.
 */
export class ToolDiscoveryEngine {
  private servers = new Map<string, MCPToolServer>();
  private metadata = new Map<string, ToolMetadata>();
  private loadedTools = new Set<string>();
  private toolCache = new Map<string, MCPTool>();

  /**
   * Register a tool server for discovery.
   */
  registerServer(server: MCPToolServer): void {
    this.servers.set(server.name, server);

    // Index tools from this server
    const tools = server.listTools();
    for (const tool of tools) {
      this.indexTool(tool, server);
    }
  }

  /**
   * Search for tools matching criteria.
   */
  search(criteria: ToolSearchCriteria): ToolSearchResult[] {
    const results: ToolSearchResult[] = [];
    const limit = criteria.limit ?? 10;

    for (const [toolName, metadata] of this.metadata.entries()) {
      const score = this.calculateRelevance(metadata, criteria);

      if (score > 0.3) {
        // Minimum relevance threshold
        const tool = this.getTool(toolName);
        const server = this.servers.get(metadata.serverName);

        if (tool && server) {
          results.push({
            tool,
            server,
            score,
            matchReason: this.explainMatch(metadata, criteria),
          });
        }
      }
    }

    // Sort by score and limit
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get tool by name (loads if not cached).
   */
  getTool(name: string): MCPTool | undefined {
    // Check cache first
    if (this.toolCache.has(name)) {
      return this.toolCache.get(name);
    }

    // Load from server
    const metadata = this.metadata.get(name);
    if (!metadata) {
      return undefined;
    }

    const server = this.servers.get(metadata.serverName);
    if (!server) {
      return undefined;
    }

    const tools = server.listTools();
    const tool = tools.find((t) => t.name === name);

    if (tool) {
      this.toolCache.set(name, tool);
      this.loadedTools.add(name);
    }

    return tool;
  }

  /**
   * Get all loaded tools.
   */
  getLoadedTools(): MCPTool[] {
    return Array.from(this.loadedTools)
      .map((name) => this.toolCache.get(name))
      .filter((t): t is MCPTool => t !== undefined);
  }

  /**
   * Recommend tools for a task description.
   */
  recommend(taskDescription: string, limit = 5): ToolSearchResult[] {
    return this.search({
      query: taskDescription,
      limit,
    });
  }

  /**
   * Get tools by category.
   */
  getByCategory(category: "core" | "knowledge" | "external"): MCPTool[] {
    const results: MCPTool[] = [];

    for (const [name, metadata] of this.metadata.entries()) {
      if (metadata.categories.includes(category)) {
        const tool = this.getTool(name);
        if (tool) {
          results.push(tool);
        }
      }
    }

    return results;
  }

  /**
   * Clear tool cache.
   */
  clearCache(): void {
    this.toolCache.clear();
    this.loadedTools.clear();
  }

  /**
   * Get statistics on tool usage.
   */
  getStats(): {
    totalTools: number;
    loadedTools: number;
    servers: number;
    cacheHitRate: number;
  } {
    return {
      totalTools: this.metadata.size,
      loadedTools: this.loadedTools.size,
      servers: this.servers.size,
      cacheHitRate: this.loadedTools.size / Math.max(this.metadata.size, 1),
    };
  }

  /**
   * Index a tool for discovery.
   */
  private indexTool(tool: MCPTool, server: MCPToolServer): void {
    const keywords = this.extractKeywords(tool);
    const categories = this.extractCategories(tool);

    this.metadata.set(tool.name, {
      name: tool.name,
      serverName: server.name,
      categories,
      keywords,
    });
  }

  /**
   * Calculate relevance score for search criteria.
   */
  private calculateRelevance(metadata: ToolMetadata, criteria: ToolSearchCriteria): number {
    let score = 0;

    // Query match (semantic)
    if (criteria.query) {
      const queryLower = criteria.query.toLowerCase();
      const nameMatch = metadata.name.toLowerCase().includes(queryLower);
      const keywordMatch = metadata.keywords.some((k) => k.toLowerCase().includes(queryLower));

      if (nameMatch) {
        score += 0.5;
      }
      if (keywordMatch) {
        score += 0.3;
      }
    }

    // Category match
    if (criteria.category) {
      if (metadata.categories.includes(criteria.category)) {
        score += 0.2;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Explain why a tool matched.
   */
  private explainMatch(metadata: ToolMetadata, criteria: ToolSearchCriteria): string {
    const reasons: string[] = [];

    if (criteria.query) {
      const queryLower = criteria.query.toLowerCase();
      if (metadata.name.toLowerCase().includes(queryLower)) {
        reasons.push("name matches query");
      }
      const matchedKeywords = metadata.keywords.filter((k) => k.toLowerCase().includes(queryLower));
      if (matchedKeywords.length > 0) {
        reasons.push(`keywords: ${matchedKeywords.join(", ")}`);
      }
    }

    if (criteria.category && metadata.categories.includes(criteria.category)) {
      reasons.push(`category: ${criteria.category}`);
    }

    return reasons.join("; ") || "general match";
  }

  /**
   * Extract keywords from tool definition.
   */
  private extractKeywords(tool: MCPTool): string[] {
    const keywords = new Set<string>();

    // From name
    keywords.add(tool.name);
    for (const part of tool.name.split(/[_-]/)) {
      keywords.add(part);
    }

    // From description
    const words = tool.description.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3) {
        // Skip short words
        keywords.add(word.replace(/[^a-z0-9]/g, ""));
      }
    }

    return Array.from(keywords);
  }

  /**
   * Extract categories from tool annotations.
   */
  private extractCategories(tool: MCPTool): string[] {
    const categories: string[] = [];

    if (tool.annotations?.category) {
      categories.push(tool.annotations.category);
    }

    return categories;
  }
}

/**
 * Create a tool discovery engine.
 */
export function createToolDiscoveryEngine(): ToolDiscoveryEngine {
  return new ToolDiscoveryEngine();
}
