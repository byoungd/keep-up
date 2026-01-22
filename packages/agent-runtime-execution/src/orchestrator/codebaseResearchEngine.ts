/**
 * Codebase Research Engine
 *
 * Performs automated codebase exploration before plan creation.
 * Extracts relevant context, patterns, and dependencies to inform planning.
 *
 * Key capabilities:
 * 1. Analyze request to determine research strategy
 * 2. Search for relevant files, functions, and patterns
 * 3. Identify dependencies and affected areas
 * 4. Summarize findings for LLM context
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Type of research finding.
 */
export type FindingType =
  | "file" // Relevant file found
  | "function" // Relevant function/method
  | "class" // Relevant class/interface
  | "pattern" // Code pattern identified
  | "dependency" // External dependency
  | "test" // Related test file
  | "config" // Configuration file
  | "documentation"; // Related documentation

/**
 * Relevance level of a finding.
 */
export type RelevanceLevel = "high" | "medium" | "low";

/**
 * A single research finding.
 */
export interface ResearchFinding {
  /** Unique finding ID */
  id: string;

  /** Type of finding */
  type: FindingType;

  /** File path (relative to workspace) */
  path: string;

  /** Human-readable summary */
  summary: string;

  /** Relevance level */
  relevance: RelevanceLevel;

  /** Code snippet (if applicable) */
  codeSnippet?: string;

  /** Line range in file */
  lineRange?: { start: number; end: number };

  /** Why this finding is relevant */
  reason?: string;

  /** Related finding IDs */
  relatedTo?: string[];
}

/**
 * Research strategy definition.
 */
export interface ResearchStrategy {
  /** Search queries to execute */
  searchQueries: string[];

  /** File patterns to look for */
  filePatterns: string[];

  /** Symbol names to search for */
  symbolNames: string[];

  /** Directories to prioritize */
  priorityDirs: string[];

  /** Directories to exclude */
  excludeDirs: string[];

  /** Maximum files to analyze */
  maxFiles: number;

  /** Focus areas */
  focusAreas: Array<"code" | "tests" | "config" | "docs">;
}

/**
 * Configuration for the research engine.
 */
export interface CodebaseResearchConfig {
  /** Maximum findings to return */
  maxFindings: number;

  /** Maximum file size to analyze (bytes) */
  maxFileSize: number;

  /** Maximum code snippet length (chars) */
  maxSnippetLength: number;

  /** Include test files in research */
  includeTests: boolean;

  /** Include documentation in research */
  includeDocs: boolean;

  /** Default directories to exclude */
  defaultExcludeDirs: string[];

  /** Timeout for research operations (ms) */
  timeoutMs: number;
}

export const DEFAULT_RESEARCH_CONFIG: CodebaseResearchConfig = {
  maxFindings: 20,
  maxFileSize: 100_000,
  maxSnippetLength: 500,
  includeTests: true,
  includeDocs: true,
  defaultExcludeDirs: ["node_modules", ".git", "dist", "build", ".next", "coverage"],
  timeoutMs: 60_000,
};

// ============================================================================
// Codebase Research Engine
// ============================================================================

/**
 * Interface for codebase research engine.
 */
export interface CodebaseResearchEngine {
  analyzeRequest(request: string, clarificationContext?: string): Promise<ResearchStrategy>;
  executeResearch(strategy: ResearchStrategy): Promise<ResearchFinding[]>;
  summarizeFindings(): string;
  getFindings(): ResearchFinding[];
  clear(): void;
}

/**
 * Implementation of the codebase research engine.
 *
 * Note: This is a framework that defines the interface and logic.
 * The actual search operations (grep, file reading, symbol lookup)
 * are delegated to tool executors provided at runtime.
 */
export class CodebaseResearchEngineImpl implements CodebaseResearchEngine {
  private readonly config: CodebaseResearchConfig;
  private findings: ResearchFinding[] = [];
  private summary = "";

  constructor(config: Partial<CodebaseResearchConfig> = {}) {
    this.config = { ...DEFAULT_RESEARCH_CONFIG, ...config };
  }

  /**
   * Analyze request to generate a research strategy.
   */
  async analyzeRequest(request: string, _clarificationContext?: string): Promise<ResearchStrategy> {
    const strategy: ResearchStrategy = {
      searchQueries: [],
      filePatterns: [],
      symbolNames: [],
      priorityDirs: ["src", "lib", "packages"],
      excludeDirs: [...this.config.defaultExcludeDirs],
      maxFiles: 50,
      focusAreas: ["code"],
    };

    // Extract potential search terms from request
    const words = request.toLowerCase().split(/\s+/);

    // Look for technical terms
    const techTerms = [
      "api",
      "endpoint",
      "component",
      "function",
      "class",
      "interface",
      "type",
      "test",
      "config",
      "database",
      "auth",
      "user",
      "login",
      "payment",
    ];

    for (const word of words) {
      if (techTerms.includes(word) || word.length > 4) {
        strategy.searchQueries.push(word);
      }
    }

    // Detect file type hints
    if (/\b(react|component|jsx|tsx)\b/i.test(request)) {
      strategy.filePatterns.push("*.tsx", "*.jsx");
      strategy.priorityDirs.push("components", "app");
    }

    if (/\b(api|endpoint|route|handler)\b/i.test(request)) {
      strategy.filePatterns.push("*.ts", "*.js");
      strategy.priorityDirs.push("api", "routes", "handlers");
    }

    if (/\b(test|spec)\b/i.test(request)) {
      strategy.focusAreas.push("tests");
      strategy.filePatterns.push("*.test.ts", "*.spec.ts");
    }

    if (/\b(config|setting|environment)\b/i.test(request)) {
      strategy.focusAreas.push("config");
      strategy.filePatterns.push("*.config.*", "*.json", "*.yaml");
    }

    // Extract potential symbol names (CamelCase or snake_case patterns)
    const symbolPattern = /\b([A-Z][a-zA-Z0-9]*|[a-z]+_[a-z_]+)\b/g;
    const matches = request.match(symbolPattern);
    if (matches) {
      strategy.symbolNames = Array.from(new Set(matches)).slice(0, 10);
    }

    return strategy;
  }

  /**
   * Execute research based on strategy.
   *
   * This method provides the framework for research. The actual
   * file operations should be performed by the orchestrator using
   * available tools (grep, view_file, etc.).
   */
  async executeResearch(_strategy: ResearchStrategy): Promise<ResearchFinding[]> {
    // This is a stub implementation. In practice, the orchestrator
    // would call this engine and then use tools to execute searches,
    // feeding results back via addFinding().
    //
    // The actual research flow:
    // 1. Orchestrator calls analyzeRequest() to get strategy
    // 2. Orchestrator uses grep_search, view_file, etc. based on strategy
    // 3. Orchestrator calls addFinding() for each relevant result
    // 4. Orchestrator calls summarizeFindings() to get final context

    return this.findings;
  }

  /**
   * Add a research finding.
   */
  addFinding(finding: Omit<ResearchFinding, "id">): ResearchFinding {
    if (this.findings.length >= this.config.maxFindings) {
      // Replace low relevance findings if at capacity
      const lowRelevanceIdx = this.findings.findIndex((f) => f.relevance === "low");
      if (lowRelevanceIdx !== -1 && finding.relevance !== "low") {
        this.findings.splice(lowRelevanceIdx, 1);
      } else {
        return { ...finding, id: "" }; // Don't add
      }
    }

    const fullFinding: ResearchFinding = {
      ...finding,
      id: crypto.randomUUID(),
      codeSnippet: finding.codeSnippet?.slice(0, this.config.maxSnippetLength),
    };

    this.findings.push(fullFinding);
    return fullFinding;
  }

  /**
   * Summarize all findings as context for LLM.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Finding categorization requires grouping logic
  summarizeFindings(): string {
    if (this.findings.length === 0) {
      this.summary = "";
      return this.summary;
    }

    const lines: string[] = ["## Codebase Research Findings", ""];

    // Group by type
    const byType = new Map<FindingType, ResearchFinding[]>();
    for (const f of this.findings) {
      const list = byType.get(f.type) ?? [];
      list.push(f);
      byType.set(f.type, list);
    }

    // Format each group
    const typeLabels: Record<FindingType, string> = {
      file: "Relevant Files",
      function: "Relevant Functions",
      class: "Relevant Classes/Interfaces",
      pattern: "Code Patterns",
      dependency: "Dependencies",
      test: "Related Tests",
      config: "Configuration",
      documentation: "Documentation",
    };

    for (const [type, findings] of byType) {
      lines.push(`### ${typeLabels[type]}`);
      lines.push("");

      for (const f of findings.sort((a, b) => {
        const order: Record<RelevanceLevel, number> = { high: 0, medium: 1, low: 2 };
        return order[a.relevance] - order[b.relevance];
      })) {
        const relevanceIcon =
          f.relevance === "high" ? "🔴" : f.relevance === "medium" ? "🟡" : "⚪";
        lines.push(`${relevanceIcon} **${f.path}**`);
        lines.push(`   ${f.summary}`);

        if (f.codeSnippet) {
          lines.push("   ```");
          lines.push(`   ${f.codeSnippet.split("\n").join("\n   ")}`);
          lines.push("   ```");
        }

        lines.push("");
      }
    }

    this.summary = lines.join("\n");
    return this.summary;
  }

  /**
   * Get all findings.
   */
  getFindings(): ResearchFinding[] {
    return [...this.findings];
  }

  /**
   * Get findings by type.
   */
  getFindingsByType(type: FindingType): ResearchFinding[] {
    return this.findings.filter((f) => f.type === type);
  }

  /**
   * Get high-relevance findings.
   */
  getHighRelevanceFindings(): ResearchFinding[] {
    return this.findings.filter((f) => f.relevance === "high");
  }

  /**
   * Clear all findings.
   */
  clear(): void {
    this.findings = [];
    this.summary = "";
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a codebase research engine.
 */
export function createCodebaseResearchEngine(
  config?: Partial<CodebaseResearchConfig>
): CodebaseResearchEngineImpl {
  return new CodebaseResearchEngineImpl(config);
}
