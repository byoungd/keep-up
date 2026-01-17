/**
 * AGENTS.md Generator
 *
 * Generates a markdown document with project context for AI agents.
 * Inspired by OpenCode's AGENTS.md and Claude Code's CLAUDE.md patterns.
 */

import type {
  CodingConvention,
  CustomInstruction,
  DirectoryNode,
  GenerateOptions,
  ProjectAnalysis,
  ProjectContext,
  ProjectPattern,
  TechStackItem,
} from "./types";
import { DEFAULT_GENERATE_OPTIONS } from "./types";

const CUSTOM_SECTION_START = "<!-- cowork:custom:start -->";
const CUSTOM_SECTION_END = "<!-- cowork:custom:end -->";
const NOTES_SECTION_START = "<!-- cowork:notes:start -->";
const NOTES_SECTION_END = "<!-- cowork:notes:end -->";

/**
 * Generate AGENTS.md content from project analysis
 */
export function generateAgentsMd(context: ProjectContext, options: GenerateOptions = {}): string {
  const opts = { ...DEFAULT_GENERATE_OPTIONS, ...options };
  const { analysis, customInstructions } = context;

  const sections: string[] = [];

  // Header
  sections.push(`# Project: ${analysis.name}\n`);

  if (analysis.description) {
    sections.push(`${analysis.description}\n`);
  }

  // Tech Stack
  if (opts.includeTechStack && analysis.techStack.length > 0) {
    sections.push(generateTechStackSection(analysis.techStack));
  }

  // Directory Structure
  if (opts.includeStructure) {
    sections.push(generateStructureSection(analysis.structure));
  }

  // Coding Conventions
  if (opts.includeConventions && analysis.conventions.length > 0) {
    sections.push(generateConventionsSection(analysis.conventions));
  }

  // Detected Patterns
  if (opts.includePatterns && analysis.patterns.length > 0) {
    sections.push(generatePatternsSection(analysis.patterns));
  }

  // Custom Instructions (user-editable)
  const enabledInstructions = customInstructions.filter((i) => i.enabled);
  if (enabledInstructions.length > 0) {
    sections.push(generateCustomInstructionsSection(enabledInstructions));
  }

  if (context.notes !== undefined) {
    sections.push(generateNotesSection(context.notes));
  }

  // Footer with metadata
  sections.push(generateFooter(context));

  return sections.join("\n---\n\n");
}

/**
 * Generate tech stack section
 */
function generateTechStackSection(techStack: TechStackItem[]): string {
  const lines: string[] = ["## Tech Stack\n"];

  // Group by category
  const byCategory = new Map<string, TechStackItem[]>();
  for (const item of techStack) {
    const existing = byCategory.get(item.category) ?? [];
    existing.push(item);
    byCategory.set(item.category, existing);
  }

  const categoryOrder = [
    "language",
    "framework",
    "runtime",
    "testing",
    "linting",
    "bundler",
    "package-manager",
    "database",
    "other",
  ];

  for (const category of categoryOrder) {
    const items = byCategory.get(category);
    if (!items || items.length === 0) {
      continue;
    }

    const categoryLabel = formatCategoryLabel(category);
    const itemList = items.map((i) => (i.version ? `${i.name} (${i.version})` : i.name)).join(", ");

    lines.push(`- **${categoryLabel}**: ${itemList}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    language: "Language",
    framework: "Framework",
    runtime: "Runtime",
    testing: "Testing",
    linting: "Linting",
    bundler: "Bundler",
    "package-manager": "Package Manager",
    database: "Database",
    other: "Other",
  };
  return labels[category] ?? category;
}

/**
 * Generate directory structure section
 */
function generateStructureSection(structure: DirectoryNode): string {
  const lines: string[] = ["## Directory Structure\n", "```"];

  renderDirectoryTree(structure, lines, "");

  lines.push("```\n");
  return lines.join("\n");
}

function renderDirectoryTree(
  node: DirectoryNode,
  lines: string[],
  prefix: string,
  isLast = true
): void {
  const connector = isLast ? "└── " : "├── ";
  const suffix = node.type === "directory" ? "/" : "";

  if (prefix === "") {
    // Root node
    lines.push(`${node.name}/`);
  } else {
    lines.push(`${prefix}${connector}${node.name}${suffix}`);
  }

  if (node.children && node.children.length > 0) {
    const childPrefix = prefix + (isLast ? "    " : "│   ");

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const childIsLast = i === node.children.length - 1;
      renderDirectoryTree(child, lines, childPrefix, childIsLast);
    }
  }
}

/**
 * Generate coding conventions section
 */
function generateConventionsSection(conventions: CodingConvention[]): string {
  const lines: string[] = ["## Coding Conventions\n"];

  // Group by category
  const byCategory = new Map<string, CodingConvention[]>();
  for (const conv of conventions) {
    const existing = byCategory.get(conv.category) ?? [];
    existing.push(conv);
    byCategory.set(conv.category, existing);
  }

  for (const [category, items] of byCategory.entries()) {
    lines.push(`### ${category}\n`);
    for (const item of items) {
      lines.push(`- ${item.rule}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate patterns section
 */
function generatePatternsSection(patterns: ProjectPattern[]): string {
  const lines: string[] = ["## Project Patterns\n"];

  for (const pattern of patterns) {
    lines.push(`### ${pattern.name}\n`);
    lines.push(pattern.description);
    if (pattern.examples.length > 0) {
      lines.push(`\n**Examples**: ${pattern.examples.map((e) => `\`${e}\``).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate custom instructions section
 */
function generateCustomInstructionsSection(instructions: CustomInstruction[]): string {
  const lines: string[] = ["## Custom Instructions\n", CUSTOM_SECTION_START];

  for (const instruction of instructions) {
    lines.push(`### ${instruction.title}\n`);
    lines.push(instruction.content);
    lines.push("");
  }

  lines.push(CUSTOM_SECTION_END, "");
  return lines.join("\n");
}

function generateNotesSection(notes?: string): string {
  const lines: string[] = ["## Notes\n", NOTES_SECTION_START];
  if (notes && notes.trim().length > 0) {
    lines.push(notes.trim());
  }
  lines.push(NOTES_SECTION_END, "");
  return lines.join("\n");
}

function extractMarkedSection(content: string, start: string, end: string): string | null {
  const startIndex = content.indexOf(start);
  if (startIndex === -1) {
    return null;
  }
  const endIndex = content.indexOf(end, startIndex + start.length);
  if (endIndex === -1) {
    return null;
  }
  return content.slice(startIndex + start.length, endIndex).trim();
}

/**
 * Generate footer with metadata
 */
function generateFooter(context: ProjectContext): string {
  const date = new Date(context.updatedAt).toISOString().split("T")[0];

  return `## Metadata

> This file was auto-generated by Keep-Up Cowork.
> Last updated: ${date}
> Version: ${context.version}

*Edit the "Custom Instructions" section to add project-specific guidance for AI agents.*
`;
}

/**
 * Create default custom instructions
 */
export function createDefaultInstructions(): CustomInstruction[] {
  return [
    {
      id: "general",
      title: "General Guidelines",
      content: `- Follow existing code patterns and conventions
- Write clear, self-documenting code
- Add comments for complex logic
- Keep functions focused and small`,
      enabled: true,
    },
    {
      id: "testing",
      title: "Testing",
      content: `- Write unit tests for new functionality
- Maintain test coverage
- Use descriptive test names`,
      enabled: true,
    },
  ];
}

/**
 * Create a new ProjectContext from analysis
 */
export function createProjectContext(analysis: ProjectAnalysis): ProjectContext {
  return {
    analysis,
    customInstructions: createDefaultInstructions(),
    notes: "",
    updatedAt: Date.now(),
    version: 1,
  };
}

/**
 * Parse AGENTS.md content to extract custom instructions
 * (preserves user edits during regeneration)
 */
export function parseCustomInstructions(content: string): CustomInstruction[] {
  const instructions: CustomInstruction[] = [];

  const markedContent =
    extractMarkedSection(content, CUSTOM_SECTION_START, CUSTOM_SECTION_END) ??
    content.match(/## Custom Instructions\n\n([\s\S]*?)(?=\n---\n|## Metadata|$)/)?.[1];

  if (!markedContent) {
    return instructions;
  }

  // Split by ### headers
  const sections = markedContent.split(/(?=### )/);

  for (const section of sections) {
    const headerMatch = section.match(/^### (.+)\n\n([\s\S]*)/);
    if (headerMatch) {
      instructions.push({
        id: headerMatch[1].toLowerCase().replace(/\s+/g, "-"),
        title: headerMatch[1],
        content: headerMatch[2].trim(),
        enabled: true,
      });
    }
  }

  if (instructions.length === 0 && markedContent.trim().length > 0) {
    instructions.push({
      id: "custom",
      title: "Custom Instructions",
      content: markedContent.trim(),
      enabled: true,
    });
  }

  return instructions;
}

export function parseNotes(content: string): string | undefined {
  const marked = extractMarkedSection(content, NOTES_SECTION_START, NOTES_SECTION_END);
  if (marked === null) {
    return undefined;
  }
  return marked.trim();
}
