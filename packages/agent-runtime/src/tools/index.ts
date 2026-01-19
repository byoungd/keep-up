/**
 * Tools Module
 *
 * Re-exports all tool-related modules.
 */

// Browser Tools
export * from "./browser";
// Code Interaction Tools (Explicit to avoid SearchOptions/SearchResult conflict)
// Re-export clashing types with prefix
export {
  applyPatch,
  CodeInteractionServer,
  createCodeInteractionServer,
  createLSPClient,
  createWindowViewer,
  deleteLines,
  editFile,
  fileExists,
  getFileStats,
  getOutline,
  insertAfterLine,
  listFiles,
  readFile,
  replaceLines,
  type SearchMatch as CodeSearchMatch,
  type SearchOptions as CodeSearchOptions,
  type SearchResult as CodeSearchResult,
  searchCode,
} from "./code";
// Core Tools
export * from "./core";
// Digest Tools
export * from "./digest";
// External Adapters
export * from "./external";
// Git Tools
export * from "./git";
// LFCC Tools
export * from "./lfcc";
// MCP
export * from "./mcp";
// Middleware
export * from "./middleware";
// Tool Naming (LFCC v0.9.1 compliance)
export * from "./naming";
// Sandbox Tools
export * from "./sandbox";
// Web Tools
export * from "./web";
