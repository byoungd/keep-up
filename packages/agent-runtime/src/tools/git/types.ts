/**
 * Git Intelligence Types
 *
 * Type definitions for intelligent git operations.
 */

// ============================================================================
// Git Configuration
// ============================================================================

/**
 * Configuration for git operations.
 */
export interface GitConfig {
  /** Enable git integration */
  enabled: boolean;

  /** Auto-stage changes */
  autoStage: boolean;

  /** Preview changes before commit */
  previewChanges: boolean;

  /** Conflict resolution strategy */
  conflictResolution: "auto" | "prompt" | "manual";

  /** Working directory */
  workingDirectory?: string;

  /** Generate commit messages */
  generateCommitMessages: boolean;
}

/**
 * Default git configuration.
 */
export const DEFAULT_GIT_CONFIG: GitConfig = {
  enabled: true,
  autoStage: false,
  previewChanges: true,
  conflictResolution: "prompt",
  generateCommitMessages: true,
};

// ============================================================================
// Diff Types
// ============================================================================

/**
 * File status in git.
 */
export type GitFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored";

/**
 * A diff hunk.
 */
export interface DiffHunk {
  /** Starting line in old file */
  oldStart: number;

  /** Number of lines in old file */
  oldLines: number;

  /** Starting line in new file */
  newStart: number;

  /** Number of lines in new file */
  newLines: number;

  /** Section header (function name, etc.) */
  header?: string;

  /** Lines in the hunk */
  lines: DiffLine[];
}

/**
 * A single line in a diff.
 */
export interface DiffLine {
  /** Line type */
  type: "context" | "add" | "remove";

  /** Line content (without +/- prefix) */
  content: string;

  /** Line number in old file */
  oldLineNo?: number;

  /** Line number in new file */
  newLineNo?: number;
}

/**
 * A complete file diff.
 */
export interface GitDiff {
  /** File path */
  file: string;

  /** File status */
  status: GitFileStatus;

  /** Diff hunks */
  hunks: DiffHunk[];

  /** Whether file is binary */
  binary: boolean;

  /** Old path (for renames) */
  oldPath?: string;

  /** Lines added */
  additions: number;

  /** Lines removed */
  deletions: number;
}

// ============================================================================
// Commit Types
// ============================================================================

/**
 * Commit information.
 */
export interface GitCommit {
  /** Commit hash */
  hash: string;

  /** Short hash */
  shortHash: string;

  /** Commit message */
  message: string;

  /** Author name */
  author: string;

  /** Author email */
  authorEmail: string;

  /** Commit date */
  date: Date;

  /** Parent hashes */
  parents: string[];

  /** Files changed */
  files?: string[];
}

/**
 * Commit options.
 */
export interface CommitOptions {
  /** Commit message */
  message: string;

  /** Stage all changes */
  all?: boolean;

  /** Amend previous commit */
  amend?: boolean;

  /** Skip hooks */
  noVerify?: boolean;

  /** Sign commit */
  sign?: boolean;
}

// ============================================================================
// Branch Types
// ============================================================================

/**
 * Branch information.
 */
export interface GitBranch {
  /** Branch name */
  name: string;

  /** Is current branch */
  current: boolean;

  /** Tracking remote */
  remote?: string;

  /** Upstream branch */
  upstream?: string;

  /** Ahead/behind counts */
  ahead?: number;
  behind?: number;

  /** Last commit hash */
  lastCommit?: string;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * Repository status.
 */
export interface GitStatus {
  /** Current branch */
  branch: string;

  /** Upstream branch */
  upstream?: string;

  /** Ahead/behind counts */
  ahead: number;
  behind: number;

  /** Staged files */
  staged: GitStatusFile[];

  /** Modified files */
  modified: GitStatusFile[];

  /** Untracked files */
  untracked: string[];

  /** Conflicted files */
  conflicted: GitStatusFile[];

  /** Is clean (no changes) */
  clean: boolean;

  /** Is rebasing */
  rebasing: boolean;

  /** Is merging */
  merging: boolean;
}

/**
 * File in status.
 */
export interface GitStatusFile {
  /** File path */
  path: string;

  /** Status */
  status: GitFileStatus;

  /** Original path (for renames) */
  originalPath?: string;
}

// ============================================================================
// Conflict Types
// ============================================================================

/**
 * Merge conflict information.
 */
export interface ConflictInfo {
  /** File with conflict */
  file: string;

  /** Conflict markers */
  markers: ConflictMarker[];

  /** Our version (current branch) */
  ours: string;

  /** Their version (merging branch) */
  theirs: string;

  /** Base version (common ancestor) */
  base?: string;
}

/**
 * Conflict marker in file.
 */
export interface ConflictMarker {
  /** Start line */
  start: number;

  /** End line */
  end: number;

  /** Ours content */
  ours: string;

  /** Theirs content */
  theirs: string;
}

/**
 * Conflict resolution strategy.
 */
export type ConflictStrategy = "ours" | "theirs" | "merge" | "manual";

// ============================================================================
// Stash Types
// ============================================================================

/**
 * Stash entry.
 */
export interface GitStash {
  /** Stash index */
  index: number;

  /** Stash message */
  message: string;

  /** Branch where stash was created */
  branch: string;

  /** Creation date */
  date: Date;
}

// ============================================================================
// Semantic Analysis Types
// ============================================================================

/**
 * Semantic diff analysis result.
 */
export interface SemanticDiffAnalysis {
  /** Summary of changes */
  summary: string;

  /** Change categories */
  categories: DiffCategory[];

  /** Affected functions/classes */
  affectedSymbols: string[];

  /** Risk level */
  riskLevel: "low" | "medium" | "high";

  /** Suggested reviewers (based on git blame) */
  suggestedReviewers?: string[];
}

/**
 * Change category.
 */
export interface DiffCategory {
  /** Category name */
  name: string;

  /** Files in category */
  files: string[];

  /** Change type */
  type: "feature" | "bugfix" | "refactor" | "style" | "docs" | "test" | "chore";
}

// ============================================================================
// Commit Message Types
// ============================================================================

/**
 * Generated commit message.
 */
export interface GeneratedCommitMessage {
  /** Suggested subject line */
  subject: string;

  /** Suggested body */
  body?: string;

  /** Confidence score */
  confidence: number;

  /** Conventional commit type */
  type?: "feat" | "fix" | "docs" | "style" | "refactor" | "test" | "chore";

  /** Scope (component/module affected) */
  scope?: string;

  /** Breaking change */
  breaking?: boolean;
}

// ============================================================================
// Git Tool Interface
// ============================================================================

/**
 * Git tool operations interface.
 */
export interface IGitOperations {
  /** Get repository status */
  status(): Promise<GitStatus>;

  /** Get diff (working tree or staged) */
  diff(options?: { staged?: boolean; file?: string }): Promise<GitDiff[]>;

  /** Stage files */
  add(files: string | string[]): Promise<void>;

  /** Unstage files */
  reset(files: string | string[]): Promise<void>;

  /** Commit changes */
  commit(options: CommitOptions): Promise<GitCommit>;

  /** Get commit log */
  log(options?: { limit?: number; file?: string }): Promise<GitCommit[]>;

  /** List branches */
  branches(): Promise<GitBranch[]>;

  /** Switch branch */
  checkout(branch: string, options?: { create?: boolean }): Promise<void>;

  /** Pull changes */
  pull(options?: { rebase?: boolean }): Promise<void>;

  /** Push changes */
  push(options?: { force?: boolean; setUpstream?: string }): Promise<void>;

  /** Stash changes */
  stash(message?: string): Promise<GitStash>;

  /** Apply stash */
  stashPop(index?: number): Promise<void>;

  /** Get semantic diff analysis */
  semanticDiff(options?: { staged?: boolean }): Promise<SemanticDiffAnalysis>;

  /** Generate commit message suggestion */
  suggestCommitMessage(diffs?: GitDiff[]): Promise<GeneratedCommitMessage>;

  /** Detect conflicts */
  detectConflicts(): Promise<ConflictInfo[]>;

  /** Resolve conflict */
  resolveConflict(file: string, strategy: ConflictStrategy): Promise<void>;
}
