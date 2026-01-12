/**
 * Git Tools Module
 *
 * Intelligent git operations with semantic diff analysis.
 */

// Types
export type {
  CommitOptions,
  ConflictInfo,
  ConflictMarker,
  ConflictStrategy,
  DiffCategory,
  DiffHunk,
  DiffLine,
  GeneratedCommitMessage,
  GitBranch,
  GitCommit,
  GitConfig,
  GitDiff,
  GitFileStatus,
  GitStash,
  GitStatus,
  GitStatusFile,
  IGitOperations,
  SemanticDiffAnalysis,
} from "./types";

export { DEFAULT_GIT_CONFIG } from "./types";

// Git Tool Server
export type { IGitExecutor } from "./gitServer";
export {
  GitToolServer,
  MockGitExecutor,
  createGitToolServer,
} from "./gitServer";
