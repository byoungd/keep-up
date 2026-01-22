/**
 * YAML Frontmatter Parser
 *
 * Parse YAML frontmatter from markdown files using gray-matter.
 * Used for skill files, prompts, and configuration.
 */

import matter from "gray-matter";

/**
 * Parsed frontmatter result
 */
export interface FrontmatterResult<T = Record<string, unknown>> {
  /** Parsed frontmatter data */
  data: T;
  /** Content after frontmatter */
  content: string;
  /** Whether frontmatter was present */
  hasFrontmatter: boolean;
  /** Raw frontmatter string (if any) */
  raw?: string;
}

/**
 * Generic skill metadata from frontmatter
 * (Note: For parsing skills, use SkillFrontmatter from skills module)
 */
export interface GenericSkillMeta {
  name: string;
  description?: string;
  version?: string;
  triggers?: string[];
  requires?: string[];
  category?: string;
}

/**
 * Prompt template frontmatter
 */
export interface PromptTemplateMeta {
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tags?: string[];
}

/**
 * Parse frontmatter from a string
 */
export function parseFrontmatter<T = Record<string, unknown>>(input: string): FrontmatterResult<T> {
  const result = matter(input);

  return {
    data: result.data as T,
    content: result.content,
    hasFrontmatter: Object.keys(result.data).length > 0,
    raw: result.matter,
  };
}

/**
 * Parse generic skill metadata from frontmatter
 */
export function parseGenericSkillMeta(input: string): FrontmatterResult<GenericSkillMeta> {
  return parseFrontmatter<GenericSkillMeta>(input);
}

/**
 * Parse prompt template frontmatter
 */
export function parsePromptTemplate(input: string): FrontmatterResult<PromptTemplateMeta> {
  return parseFrontmatter<PromptTemplateMeta>(input);
}

/**
 * Stringify data with frontmatter
 */
export function stringifyWithFrontmatter<T extends Record<string, unknown>>(
  content: string,
  data: T
): string {
  return matter.stringify(content, data);
}

/**
 * Extract just the frontmatter data without parsing full content
 */
export function extractFrontmatter<T = Record<string, unknown>>(input: string): T | null {
  try {
    const result = matter(input);
    return Object.keys(result.data).length > 0 ? (result.data as T) : null;
  } catch {
    return null;
  }
}

// Re-export gray-matter for advanced usage
export { matter as grayMatter };
