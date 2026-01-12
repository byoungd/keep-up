/**
 * Knowledge Module
 *
 * Provides scoped, conditional knowledge injection for agents.
 * Inspired by Manus's pattern where knowledge items are only adopted when conditions are met.
 *
 * Directory: .agent/knowledge/
 *
 * Features:
 * - Scoped knowledge items with conditions
 * - File pattern matching (only inject when touching certain files)
 * - Topic/keyword matching
 * - Priority-based selection when multiple items match
 * - User-definable knowledge in project directory
 *
 * Knowledge is injected into the system prompt when conditions match,
 * providing context-aware guidance without bloating every request.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * A knowledge item with scoped conditions.
 */
export interface KnowledgeItem {
  /** Unique identifier */
  id: string;

  /** Human-readable title */
  title: string;

  /** The knowledge content to inject */
  content: string;

  /** Scope conditions - knowledge is injected when conditions match */
  scope: KnowledgeScope;

  /** Priority for ordering when multiple items match (higher = more important) */
  priority: "high" | "medium" | "low";

  /** Source of this knowledge item */
  source: "builtin" | "project" | "user";

  /** Optional expiry timestamp */
  expiresAt?: number;
}

/**
 * Scope conditions for knowledge injection.
 */
export interface KnowledgeScope {
  /**
   * Natural language description of when this knowledge applies.
   * Used for semantic matching against the user's query.
   * Example: "implementing authentication or authorization"
   */
  when?: string;

  /**
   * Keywords that trigger this knowledge.
   * Example: ["auth", "jwt", "login", "session"]
   */
  keywords?: string[];

  /**
   * File patterns - inject when these files are being touched.
   * Uses glob patterns.
   * Example: ["src/auth/**", "src/middleware/auth*"]
   */
  files?: string[];

  /**
   * Agent types this knowledge is relevant for.
   * Example: ["code", "plan", "implementer"]
   */
  agents?: string[];

  /**
   * Exclude conditions - don't inject if these match.
   */
  excludeKeywords?: string[];
}

/**
 * Context for matching knowledge items.
 */
export interface KnowledgeMatchContext {
  /** The user's query or task description */
  query: string;

  /** Files being accessed or modified */
  touchedFiles?: string[];

  /** Current agent type */
  agentType?: string;

  /** Maximum items to return */
  maxItems?: number;
}

/**
 * Result of knowledge matching.
 */
export interface KnowledgeMatchResult {
  /** Matched knowledge items, sorted by relevance */
  items: KnowledgeItem[];

  /** Total matches before limit */
  totalMatches: number;

  /** Formatted content ready for injection */
  formattedContent: string;
}

// ============================================================================
// Knowledge Registry
// ============================================================================

export class KnowledgeRegistry {
  private readonly items = new Map<string, KnowledgeItem>();
  private readonly projectDir?: string;

  constructor(projectDir?: string) {
    this.projectDir = projectDir;
  }

  /**
   * Register a knowledge item.
   */
  register(item: KnowledgeItem): void {
    this.items.set(item.id, item);
  }

  /**
   * Register multiple knowledge items.
   */
  registerAll(items: KnowledgeItem[]): void {
    for (const item of items) {
      this.register(item);
    }
  }

  /**
   * Remove a knowledge item.
   */
  unregister(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * Get all registered items.
   */
  getAll(): KnowledgeItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Load knowledge items from project directory.
   */
  async loadFromProject(): Promise<number> {
    if (!this.projectDir) {
      return 0;
    }

    const knowledgeDir = path.join(this.projectDir, ".agent", "knowledge");

    try {
      const files = await fs.readdir(knowledgeDir);
      const mdFiles = files.filter((f) => f.endsWith(".md"));
      let loaded = 0;

      for (const file of mdFiles) {
        const filePath = path.join(knowledgeDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const item = this.parseKnowledgeFile(file, content);

        if (item) {
          item.source = "project";
          this.register(item);
          loaded++;
        }
      }

      return loaded;
    } catch {
      // Directory doesn't exist or can't be read
      return 0;
    }
  }

  /**
   * Parse a knowledge markdown file.
   *
   * Expected format:
   * ```markdown
   * ---
   * title: Authentication Patterns
   * priority: high
   * keywords: [auth, jwt, login]
   * files: [src/auth/**, src/middleware/auth*]
   * when: implementing authentication
   * ---
   *
   * Content here...
   * ```
   */
  private parseKnowledgeFile(filename: string, content: string): KnowledgeItem | null {
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      // No frontmatter, treat entire file as content
      return {
        id: filename.replace(".md", ""),
        title: filename.replace(".md", "").replace(/-/g, " "),
        content: content.trim(),
        scope: {},
        priority: "medium",
        source: "project",
      };
    }

    const [, frontmatter, body] = frontmatterMatch;

    // Parse simple YAML-like frontmatter
    const metadata: Record<string, unknown> = {};
    for (const line of frontmatter.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) {
        continue;
      }

      const key = line.slice(0, colonIdx).trim();
      let value: unknown = line.slice(colonIdx + 1).trim();

      // Parse arrays [item1, item2]
      if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        value = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim());
      }

      metadata[key] = value;
    }

    return {
      id: filename.replace(".md", ""),
      title: (metadata.title as string) ?? filename.replace(".md", ""),
      content: body.trim(),
      scope: {
        when: metadata.when as string,
        keywords: metadata.keywords as string[],
        files: metadata.files as string[],
        agents: metadata.agents as string[],
      },
      priority: (metadata.priority as KnowledgeItem["priority"]) ?? "medium",
      source: "project",
    };
  }

  /**
   * Match knowledge items against context.
   */
  match(context: KnowledgeMatchContext): KnowledgeMatchResult {
    const maxItems = context.maxItems ?? 5;
    const queryLower = context.query.toLowerCase();
    const matches: Array<{ item: KnowledgeItem; score: number }> = [];

    for (const item of this.items.values()) {
      // Check expiry
      if (item.expiresAt && Date.now() > item.expiresAt) {
        continue;
      }

      const score = this.calculateMatchScore(item, context, queryLower);

      if (score > 0) {
        matches.push({ item, score });
      }
    }

    // Sort by score (descending) then priority
    matches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.item.priority] - priorityOrder[b.item.priority];
    });

    const selectedItems = matches.slice(0, maxItems).map((m) => m.item);

    return {
      items: selectedItems,
      totalMatches: matches.length,
      formattedContent: this.formatKnowledgeContent(selectedItems),
    };
  }

  /**
   * Calculate match score for a knowledge item.
   */
  private calculateMatchScore(
    item: KnowledgeItem,
    context: KnowledgeMatchContext,
    queryLower: string
  ): number {
    const scope = item.scope;

    // Check exclusions first
    if (this.isExcluded(scope, queryLower, context.agentType)) {
      return 0;
    }

    // Calculate component scores
    let score = 0;
    score += this.scoreKeywords(scope.keywords, queryLower);
    score += this.scoreWhenCondition(scope.when, queryLower);
    score += this.scoreFilePatterns(scope.files, context.touchedFiles);
    score += this.scorePriority(item.priority, score);

    return score;
  }

  /** Check if item should be excluded based on scope. */
  private isExcluded(scope: KnowledgeScope, queryLower: string, agentType?: string): boolean {
    // Check exclude keywords
    if (scope.excludeKeywords) {
      const excluded = scope.excludeKeywords.some((kw) => queryLower.includes(kw.toLowerCase()));
      if (excluded) {
        return true;
      }
    }

    // Check agent type restriction
    if (scope.agents && scope.agents.length > 0 && agentType) {
      if (!scope.agents.includes(agentType)) {
        return true;
      }
    }

    return false;
  }

  /** Score keyword matches. */
  private scoreKeywords(keywords: string[] | undefined, queryLower: string): number {
    if (!keywords || keywords.length === 0) {
      return 0;
    }
    return keywords.filter((kw) => queryLower.includes(kw.toLowerCase())).length * 10;
  }

  /** Score "when" condition matches. */
  private scoreWhenCondition(when: string | undefined, queryLower: string): number {
    if (!when) {
      return 0;
    }
    const words = when.toLowerCase().split(/\s+/);
    return words.filter((w) => w.length > 3 && queryLower.includes(w)).length * 5;
  }

  /** Score file pattern matches. */
  private scoreFilePatterns(
    patterns: string[] | undefined,
    touchedFiles: string[] | undefined
  ): number {
    if (!patterns || patterns.length === 0 || !touchedFiles) {
      return 0;
    }
    let score = 0;
    for (const pattern of patterns) {
      for (const file of touchedFiles) {
        if (this.matchFilePattern(file, pattern)) {
          score += 15;
        }
      }
    }
    return score;
  }

  /** Add priority boost if there's a base score. */
  private scorePriority(priority: KnowledgeItem["priority"], baseScore: number): number {
    if (baseScore === 0) {
      return 0;
    }
    const boosts: Record<string, number> = { high: 3, medium: 1, low: 0 };
    return boosts[priority] ?? 0;
  }

  /**
   * Simple file pattern matching.
   */
  private matchFilePattern(file: string, pattern: string): boolean {
    // Convert glob pattern to regex (simplified)
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*");

    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(file);
    } catch {
      return file.includes(pattern.replace(/\*/g, ""));
    }
  }

  /**
   * Format matched knowledge items for injection.
   */
  private formatKnowledgeContent(items: KnowledgeItem[]): string {
    if (items.length === 0) {
      return "";
    }

    const lines = ["## Relevant Knowledge", ""];

    for (const item of items) {
      lines.push(`### ${item.title}`);
      lines.push("");
      lines.push(item.content);
      lines.push("");
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Built-in Knowledge Items
// ============================================================================

/**
 * Built-in knowledge items for common patterns.
 */
export const BUILTIN_KNOWLEDGE: KnowledgeItem[] = [
  {
    id: "error-handling",
    title: "Error Handling Best Practices",
    content: `When implementing error handling:
- Use Result types or explicit error returns over exceptions where possible
- Log errors with context (correlation ID, user ID, operation)
- Provide user-friendly error messages separate from technical details
- Consider retry logic for transient failures
- Fail fast for unrecoverable errors`,
    scope: {
      keywords: ["error", "exception", "catch", "try", "throw", "failure"],
      when: "implementing error handling or recovery",
    },
    priority: "medium",
    source: "builtin",
  },
  {
    id: "testing-patterns",
    title: "Testing Patterns",
    content: `When writing tests:
- Use Arrange-Act-Assert (AAA) pattern
- Keep tests independent and isolated
- Name tests descriptively: should_[expected]_when_[condition]
- Mock external dependencies
- Test edge cases and error paths
- Aim for behavior testing over implementation testing`,
    scope: {
      keywords: ["test", "spec", "mock", "assert", "expect", "vitest", "jest"],
      files: ["**/*.test.*", "**/*.spec.*", "**/tests/**"],
      when: "writing tests",
    },
    priority: "medium",
    source: "builtin",
  },
  {
    id: "security-basics",
    title: "Security Considerations",
    content: `Security checklist:
- Never log sensitive data (passwords, tokens, PII)
- Validate and sanitize all user input
- Use parameterized queries for database operations
- Apply principle of least privilege
- Secure secrets in environment variables, not code
- Be cautious with eval(), innerHTML, and similar constructs`,
    scope: {
      keywords: ["security", "auth", "password", "token", "secret", "credential"],
      files: ["**/auth/**", "**/security/**", "**/*.env*"],
      when: "implementing security-sensitive features",
    },
    priority: "high",
    source: "builtin",
  },
];

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a knowledge registry with optional project directory.
 *
 * @example
 * ```typescript
 * const registry = createKnowledgeRegistry('/path/to/project');
 *
 * // Load project-specific knowledge
 * await registry.loadFromProject();
 *
 * // Match knowledge for a query
 * const result = registry.match({
 *   query: 'implement JWT authentication',
 *   touchedFiles: ['src/auth/jwt.ts'],
 *   agentType: 'code',
 * });
 *
 * console.log(result.formattedContent);
 * // Injects relevant auth knowledge into the prompt
 * ```
 */
export function createKnowledgeRegistry(projectDir?: string): KnowledgeRegistry {
  const registry = new KnowledgeRegistry(projectDir);

  // Register built-in knowledge
  registry.registerAll(BUILTIN_KNOWLEDGE);

  return registry;
}
