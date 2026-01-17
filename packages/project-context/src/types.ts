/**
 * Project Context Types
 *
 * Defines the schema for project analysis and AGENTS.md generation.
 * Inspired by OpenCode's AGENTS.md and Claude Code's CLAUDE.md patterns.
 */

/**
 * Detected technology in the project
 */
export interface TechStackItem {
  /** Category: language, framework, testing, linting, bundler, etc. */
  category: TechCategory;
  /** Name of the technology */
  name: string;
  /** Version if detected */
  version?: string;
  /** Source file where detected */
  detectedFrom: string;
}

export type TechCategory =
  | "language"
  | "framework"
  | "testing"
  | "linting"
  | "bundler"
  | "database"
  | "runtime"
  | "package-manager"
  | "other";

/**
 * Directory structure node
 */
export interface DirectoryNode {
  /** Name of file or directory */
  name: string;
  /** Type */
  type: "file" | "directory";
  /** Children (for directories) */
  children?: DirectoryNode[];
  /** Optional description */
  description?: string;
}

/**
 * Coding convention extracted from config files
 */
export interface CodingConvention {
  /** Rule category */
  category: string;
  /** Rule description */
  rule: string;
  /** Source file */
  source: string;
}

/**
 * Detected project pattern
 */
export interface ProjectPattern {
  /** Pattern name */
  name: string;
  /** Description */
  description: string;
  /** Example files */
  examples: string[];
}

/**
 * Custom instruction section (user-editable)
 */
export interface CustomInstruction {
  /** Section identifier */
  id: string;
  /** Section title */
  title: string;
  /** Content (markdown) */
  content: string;
  /** Whether this section is enabled */
  enabled: boolean;
}

/**
 * Complete project analysis result
 */
export interface ProjectAnalysis {
  /** Project name */
  name: string;
  /** Root path */
  rootPath: string;
  /** Project description (from package.json or README) */
  description?: string;
  /** Detected tech stack */
  techStack: TechStackItem[];
  /** Directory structure (depth-limited) */
  structure: DirectoryNode;
  /** Extracted coding conventions */
  conventions: CodingConvention[];
  /** Detected patterns */
  patterns: ProjectPattern[];
  /** Config files found */
  configFiles: ConfigFile[];
  /** Analysis timestamp */
  analyzedAt: number;
}

/**
 * Configuration file info
 */
export interface ConfigFile {
  /** File name */
  name: string;
  /** Relative path */
  path: string;
  /** File type */
  type: ConfigFileType;
}

export type ConfigFileType =
  | "package-json"
  | "tsconfig"
  | "biome"
  | "eslint"
  | "prettier"
  | "vite"
  | "webpack"
  | "turbo"
  | "docker"
  | "ci"
  | "other";

/**
 * Project context document (AGENTS.md content)
 */
export interface ProjectContext {
  /** Project analysis */
  analysis: ProjectAnalysis;
  /** Custom instructions (user-editable sections) */
  customInstructions: CustomInstruction[];
  /** Last updated timestamp */
  updatedAt: number;
  /** Version for migrations */
  version: number;
}

/**
 * Options for project analysis
 */
export interface AnalyzeOptions {
  /** Maximum directory depth for structure */
  maxDepth?: number;
  /** Directories to exclude */
  excludeDirs?: string[];
  /** Whether to include file contents for pattern detection */
  includeFileContents?: boolean;
}

/**
 * Options for AGENTS.md generation
 */
export interface GenerateOptions {
  /** Include tech stack section */
  includeTechStack?: boolean;
  /** Include directory structure */
  includeStructure?: boolean;
  /** Include coding conventions */
  includeConventions?: boolean;
  /** Include detected patterns */
  includePatterns?: boolean;
  /** Custom sections to include */
  customSections?: string[];
}

/**
 * Default analysis options
 */
export const DEFAULT_ANALYZE_OPTIONS: Required<AnalyzeOptions> = {
  maxDepth: 3,
  excludeDirs: ["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage", ".cache"],
  includeFileContents: false,
};

/**
 * Default generation options
 */
export const DEFAULT_GENERATE_OPTIONS: Required<GenerateOptions> = {
  includeTechStack: true,
  includeStructure: true,
  includeConventions: true,
  includePatterns: true,
  customSections: [],
};
