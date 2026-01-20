/**
 * LSP Type Definitions
 *
 * Simplified types for LSP integration, mapped from vscode-languageserver-protocol.
 */

import type {
  Diagnostic,
  DocumentSymbol,
  Location,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";

// Re-export useful types from LSP protocol
export type { Diagnostic, DocumentSymbol, Location, Position, Range, TextEdit, WorkspaceEdit };

/**
 * Simplified diagnostic for tool output
 */
export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  code?: string | number;
  source?: string;
}

/**
 * Simplified location for tool output
 */
export interface LspLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/**
 * Simplified symbol for tool output
 */
export interface LspSymbol {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  detail?: string;
  children?: LspSymbol[];
}

/**
 * Simplified workspace edit for tool output
 */
export interface LspWorkspaceEdit {
  changes: Array<{
    file: string;
    edits: Array<{
      range: { start: { line: number; column: number }; end: { line: number; column: number } };
      newText: string;
    }>;
  }>;
}

/**
 * LSP Provider capabilities
 */
export interface LspCapabilities {
  references: boolean;
  rename: boolean;
  documentSymbol: boolean;
  diagnostics: boolean;
  hover: boolean;
  definition: boolean;
  completion: boolean;
}

/**
 * LSP Provider interface for different language servers
 */
export interface LspProvider {
  /** Unique identifier for this provider */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** File extensions this provider supports */
  readonly extensions: readonly string[];

  /** Command to start the language server */
  readonly command: string;

  /** Arguments for the command */
  readonly args: readonly string[];

  /** Capabilities this provider supports */
  readonly capabilities: LspCapabilities;

  /** Optional initialization options */
  initOptions?: Record<string, unknown>;
}

/**
 * LSP Client state
 */
export type LspClientState = "idle" | "starting" | "ready" | "error" | "stopped";

/**
 * LSP Client events
 */
export interface LspClientEvents {
  stateChange: (state: LspClientState) => void;
  error: (error: Error) => void;
  diagnostics: (file: string, diagnostics: LspDiagnostic[]) => void;
}
