/**
 * @ku0/tool-lsp
 *
 * Language Server Protocol integration for semantic code intelligence.
 * Provides accurate code navigation, refactoring, and diagnostics.
 */

export { LspClient, type LspClientOptions } from "./client";
export { createLspToolServer } from "./tools";
export type {
  LspCapabilities,
  LspDiagnostic,
  LspLocation,
  LspProvider,
  LspSymbol,
  LspWorkspaceEdit,
} from "./types";
