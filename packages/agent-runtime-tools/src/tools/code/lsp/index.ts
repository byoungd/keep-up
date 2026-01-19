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
  TextDocumentIdentifier,
  TextDocumentPositionParams,
} from "./protocol";
export {
  type DetectedLanguageServer,
  detectLanguageServer,
  detectLanguageServerForPath,
  isServerAvailable,
  LANGUAGE_SERVERS,
  type ServerConfig,
} from "./servers";
export { createStdioTransport, type JsonRpcMessage, type Transport } from "./transport";
