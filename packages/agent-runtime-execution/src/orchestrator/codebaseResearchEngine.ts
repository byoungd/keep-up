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

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";

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

  /** Optional workspace root override */
  workspaceRoot?: string;
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
  async executeResearch(strategy: ResearchStrategy): Promise<ResearchFinding[]> {
    const startTime = Date.now();
    const rootDir = this.config.workspaceRoot ?? process.cwd();
    const excludeDirs = new Set(strategy.excludeDirs.map((dir) => dir.toLowerCase()));

    const searchTerms = new Set(
      [...strategy.searchQueries, ...strategy.symbolNames]
        .map((term) => term.trim())
        .filter(Boolean)
    );
    const symbolTerms = new Set(strategy.symbolNames.filter(Boolean));
    const allowTests = this.config.includeTests && strategy.focusAreas.includes("tests");
    const allowDocs = this.config.includeDocs && strategy.focusAreas.includes("docs");
    const allowConfig = strategy.focusAreas.includes("config");
    const patterns = strategy.filePatterns.filter(Boolean);

    const isTimedOut = () => Date.now() - startTime > this.config.timeoutMs;

    const isTestFile = (filePath: string) =>
      /(?:^|\/)(__tests__|__test__|test|spec)(?:\/|\.|$)/i.test(filePath) ||
      /\.(test|spec)\./i.test(filePath);

    const isDocFile = (filePath: string) =>
      /(?:^|\/)docs?\//i.test(filePath) ||
      /readme/i.test(basename(filePath)) ||
      /\.md$/i.test(filePath);

    const isConfigFile = (filePath: string) =>
      /(?:^|\/)config\//i.test(filePath) ||
      /\.config\./i.test(filePath) ||
      /\.(json|ya?ml|toml)$/i.test(filePath);

    const matchesPatterns = (filePath: string) => {
      if (patterns.length === 0) {
        return /\.(ts|tsx|js|jsx|json|ya?ml|toml|md|mdx|css|scss|html)$/i.test(filePath);
      }
      return patterns.some((pattern) => {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        const regex = new RegExp(`^${escaped}$`, "i");
        return regex.test(basename(filePath));
      });
    };

    const shouldIncludeFile = (filePath: string) => {
      if (!matchesPatterns(filePath)) {
        return false;
      }
      if (!allowTests && isTestFile(filePath)) {
        return false;
      }
      if (!allowDocs && isDocFile(filePath)) {
        return false;
      }
      if (!allowConfig && isConfigFile(filePath)) {
        return false;
      }
      return true;
    };

    const findFirstMatch = (content: string) => {
      let matchIndex = -1;
      let matchedTerm = "";
      let relevance: RelevanceLevel = "low";

      for (const term of symbolTerms) {
        const idx = content.indexOf(term);
        if (idx !== -1) {
          matchIndex = idx;
          matchedTerm = term;
          relevance = "high";
          break;
        }
      }

      if (matchIndex === -1) {
        const lower = content.toLowerCase();
        for (const term of searchTerms) {
          const idx = lower.indexOf(term.toLowerCase());
          if (idx !== -1) {
            matchIndex = idx;
            matchedTerm = term;
            relevance = "medium";
            break;
          }
        }
      }

      return { matchIndex, matchedTerm, relevance };
    };

    const buildSnippet = (content: string, matchIndex: number) => {
      if (matchIndex < 0) {
        return { snippet: undefined, lineRange: undefined };
      }
      const lineStart = content.lastIndexOf("\n", matchIndex) + 1;
      const lineEnd = content.indexOf("\n", matchIndex);
      const end = lineEnd === -1 ? content.length : lineEnd;
      const snippet = content.slice(lineStart, end).trim();
      const lineRange = {
        start: content.slice(0, lineStart).split("\n").length,
        end: content.slice(0, end).split("\n").length,
      };
      return { snippet, lineRange };
    };

    const findings: ResearchFinding[] = [];
    const visited = new Set<string>();
    let scannedFiles = 0;

    const shouldStop = () =>
      isTimedOut() ||
      scannedFiles >= strategy.maxFiles ||
      findings.length >= this.config.maxFindings;

    const readDirSafe = async (dir: string) => {
      try {
        return await readdir(dir, { withFileTypes: true });
      } catch {
        return [];
      }
    };

    const statSafe = async (filePath: string) => {
      try {
        return await stat(filePath);
      } catch {
        return null;
      }
    };

    const readFileSafe = async (filePath: string) => {
      try {
        return await readFile(filePath, "utf8");
      } catch {
        return null;
      }
    };

    const shouldProcessFile = (filePath: string) =>
      shouldIncludeFile(filePath) && !visited.has(filePath);

    const withinSizeLimit = async (filePath: string) => {
      const fileStat = await statSafe(filePath);
      if (!fileStat) {
        return false;
      }
      return fileStat.size <= this.config.maxFileSize;
    };

    const resolveFindingType = (filePath: string): FindingType => {
      if (isTestFile(filePath)) {
        return "test";
      }
      if (isConfigFile(filePath)) {
        return "config";
      }
      if (isDocFile(filePath)) {
        return "documentation";
      }
      return "file";
    };

    const buildSummary = (relativePath: string, matchedTerm: string) =>
      matchedTerm.length > 0
        ? `Matched "${matchedTerm}" in ${relativePath}`
        : `Relevant file ${relativePath}`;

    const createFindingFromContent = (filePath: string, content: string) => {
      const match = findFirstMatch(content);
      if (match.matchIndex === -1 && searchTerms.size > 0) {
        return null;
      }

      const { snippet, lineRange } = buildSnippet(content, match.matchIndex);
      const relativePath = relative(rootDir, filePath);
      const summary = buildSummary(relativePath, match.matchedTerm);
      const finding = this.addFinding({
        type: resolveFindingType(filePath),
        path: relativePath,
        summary,
        relevance: match.relevance,
        codeSnippet: snippet,
        lineRange,
        reason: match.matchedTerm ? `Contains "${match.matchedTerm}"` : undefined,
      });

      return finding.id ? finding : null;
    };

    const scanFileIfEligible = async (filePath: string) => {
      if (!shouldProcessFile(filePath)) {
        return null;
      }

      visited.add(filePath);
      scannedFiles += 1;

      const isWithinLimit = await withinSizeLimit(filePath);
      if (!isWithinLimit) {
        return null;
      }

      const content = await readFileSafe(filePath);
      if (!content) {
        return null;
      }

      const finding = createFindingFromContent(filePath, content);
      if (!finding) {
        return null;
      }

      findings.push(finding);
      return finding;
    };

    const scanEntry = async (
      dir: string,
      entry: { name: string; isDirectory: () => boolean; isFile: () => boolean }
    ) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const lowerName = entry.name.toLowerCase();
        if (!excludeDirs.has(lowerName)) {
          await scanDirectory(fullPath);
        }
        return;
      }
      if (entry.isFile()) {
        await scanFileIfEligible(fullPath);
      }
    };

    const scanDirectory = async (dir: string): Promise<void> => {
      if (shouldStop()) {
        return;
      }
      const entries = await readDirSafe(dir);
      for (const entry of entries) {
        if (shouldStop()) {
          return;
        }
        await scanEntry(dir, entry);
      }
    };

    const priorityDirs = strategy.priorityDirs.filter(Boolean);
    if (priorityDirs.length > 0) {
      for (const dir of priorityDirs) {
        const fullDir = join(rootDir, dir);
        await scanDirectory(fullDir);
        if (shouldStop()) {
          break;
        }
      }
    } else {
      await scanDirectory(rootDir);
    }

    return findings.length > 0 ? findings : this.findings;
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
