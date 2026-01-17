/**
 * Shared application constants
 */

/**
 * Maximum size for artifact files (512 KB)
 */
export const MAX_ARTIFACT_BYTES = 512 * 1024;

/**
 * File extensions that can be previewed as artifacts
 */
export const PREVIEWABLE_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".txt"]);

/**
 * Default token budget for project context injection
 */
export const DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET = 4000;

/**
 * Risk tags for approval system
 */
export const RISK_TAGS = new Set(["delete", "overwrite", "network", "connector", "batch"] as const);

/**
 * Type for risk tags
 */
export type RiskTag = typeof RISK_TAGS extends Set<infer T> ? T : never;
