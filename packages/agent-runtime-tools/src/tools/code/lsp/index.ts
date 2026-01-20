/**
 * LSP tooling exports.
 */

export {
  createLSPClient,
  type LSPClient,
  LSPClientImpl,
  type LSPClientOptions,
  lspLocationToPath,
} from "./client";
export type {
  Diagnostic,
  DocumentSymbol,
  Location,
  Position,
  Range,
  SymbolInformation,
  TextDocumentEdit,
  TextDocumentIdentifier,
  TextDocumentPositionParams,
  TextEdit,
  WorkspaceEdit,
} from "./protocol";
export {
  type DetectedLanguageServer,
  detectLanguageServer,
  detectLanguageServerForPath,
  isServerAvailable,
  LANGUAGE_SERVERS,
  resolveLanguageServerCommand,
  resolveLanguageServerConfig,
  type ServerConfig,
} from "./servers";
export { createStdioTransport, type JsonRpcMessage, type Transport } from "./transport";
export {
  type AppliedWorkspaceEdit,
  type ApplyWorkspaceEditResult,
  applyWorkspaceEdit,
  collectWorkspaceChanges,
} from "./workspaceEdit";
