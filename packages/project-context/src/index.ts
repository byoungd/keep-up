/**
 * @ku0/project-context
 *
 * Project context analysis and AGENTS.md generation for AI agents.
 * Inspired by OpenCode's AGENTS.md and Claude Code's CLAUDE.md patterns.
 */

export { analyzeProject } from "./analyzer";
export {
  createDefaultInstructions,
  createProjectContext,
  generateAgentsMd,
  parseCustomInstructions,
  parseNotes,
} from "./generator";
export type {
  AnalyzeOptions,
  CodingConvention,
  ConfigFile,
  ConfigFileType,
  CustomInstruction,
  DirectoryNode,
  GenerateOptions,
  ProjectAnalysis,
  ProjectContext,
  ProjectPattern,
  TechCategory,
  TechStackItem,
} from "./types";
export { DEFAULT_ANALYZE_OPTIONS, DEFAULT_GENERATE_OPTIONS } from "./types";
