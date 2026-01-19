/**
 * Code Tools Module
 *
 * Provides code file operations for agents: reading, editing, and navigation.
 */

// Tool server
export { CodeToolServer, createCodeToolServer } from "./codeServer";

// Editor operations
export {
  deleteLines,
  type EditChunk,
  type EditOptions,
  type EditResult,
  editFile,
  insertAfterLine,
  replaceLines,
} from "./editor";
// File system operations
export {
  type FileEntry,
  fileExists,
  getFileStats,
  type ListFilesOptions,
  listFiles,
  type ReadFileOptions,
  type ReadFileResult,
  readFile,
} from "./fileSystem";
// LSP operations
export {
  createLSPClient,
  type DetectedLanguageServer,
  type Diagnostic,
  type DocumentSymbol,
  detectLanguageServer,
  detectLanguageServerForPath,
  isServerAvailable,
  type Location,
  type LSPClient,
  type LSPClientOptions,
  type Position,
  type Range,
  type ServerConfig,
  type SymbolInformation,
} from "./lsp";
// Patch operations
export { type ApplyPatchResult, applyPatch } from "./patch";
// Code search
export { type SearchMatch, type SearchOptions, type SearchResult, searchCode } from "./search";
// Outline extraction
export { getOutline, type OutlineItem, type OutlineResult } from "./skeleton";
// Windowed viewer
export {
  createWindowViewer,
  type WindowState,
  type WindowViewResult,
} from "./window";
