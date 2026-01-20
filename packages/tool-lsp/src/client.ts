/**
 * LSP Client
 *
 * Manages the lifecycle of a Language Server Protocol connection.
 * Handles JSON-RPC transport over stdio and provides high-level API.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createMessageConnection,
  type MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";

import type {
  LspCapabilities,
  LspClientState,
  LspDiagnostic,
  LspLocation,
  LspProvider,
  LspSymbol,
  LspWorkspaceEdit,
} from "./types";

export interface LspClientOptions {
  /** Root path of the project */
  rootPath: string;

  /** LSP Provider configuration */
  provider: LspProvider;

  /** Timeout for requests in ms (default: 30000) */
  timeout?: number;

  /** Logger for debug output */
  logger?: Pick<Console, "info" | "warn" | "error" | "debug">;
}

interface DiagnosticParams {
  uri: string;
  diagnostics: DiagnosticItem[];
}

interface DiagnosticItem {
  range: RangeDescriptor;
  severity?: number;
  message: string;
  code?: string | number;
  source?: string;
}

interface RangeDescriptor {
  start: PositionDescriptor;
  end: PositionDescriptor;
}

interface PositionDescriptor {
  line: number;
  character: number;
}

interface LocationDescriptor {
  uri: string;
  range: RangeDescriptor;
}

interface WorkspaceEditDescriptor {
  changes?: Record<string, TextEditDescriptor[]>;
}

interface TextEditDescriptor {
  range: RangeDescriptor;
  newText: string;
}

interface DocumentSymbolDescriptor {
  name: string;
  kind: number;
  detail?: string;
  range?: RangeDescriptor;
  location?: LocationDescriptor;
  children?: DocumentSymbolDescriptor[];
}

interface InitializeResultDescriptor {
  capabilities: {
    referencesProvider?: boolean | object;
    renameProvider?: boolean | object;
    documentSymbolProvider?: boolean | object;
    hoverProvider?: boolean | object;
    definitionProvider?: boolean | object;
    completionProvider?: object;
  };
}

/**
 * LSP Client for semantic code intelligence
 */
export class LspClient extends EventEmitter {
  private readonly options: Required<LspClientOptions>;
  private process: ChildProcess | null = null;
  private connection: MessageConnection | null = null;
  private state: LspClientState = "idle";
  private capabilities: LspCapabilities | null = null;
  private openDocuments = new Set<string>();

  constructor(options: LspClientOptions) {
    super();
    this.options = {
      timeout: 30000,
      logger: console,
      ...options,
    };
  }

  getState(): LspClientState {
    return this.state;
  }

  isReady(): boolean {
    return this.state === "ready";
  }

  getCapabilities(): LspCapabilities | null {
    return this.capabilities;
  }

  async start(): Promise<void> {
    if (this.state !== "idle" && this.state !== "stopped") {
      throw new Error(`Cannot start client in state: ${this.state}`);
    }

    this.setState("starting");

    try {
      const { command, args } = this.options.provider;
      this.process = spawn(command, [...args], {
        cwd: this.options.rootPath,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "production" },
      });

      if (!this.process.stdout || !this.process.stdin) {
        throw new Error("Failed to create language server process streams");
      }

      this.connection = createMessageConnection(
        new StreamMessageReader(this.process.stdout),
        new StreamMessageWriter(this.process.stdin)
      );

      this.connection.onNotification(
        "textDocument/publishDiagnostics",
        (params: DiagnosticParams) => {
          const diagnostics = params.diagnostics.map((d) => this.convertDiagnostic(params.uri, d));
          this.emit("diagnostics", fileURLToPath(params.uri), diagnostics);
        }
      );

      this.process.on("error", (error) => {
        this.options.logger.error("LSP process error:", error);
        this.setState("error");
        this.emit("error", error);
      });

      this.process.on("exit", (code) => {
        if (this.state !== "stopped") {
          this.options.logger.warn(`LSP process exited unexpectedly with code ${code}`);
          this.setState("error");
        }
      });

      this.connection.listen();

      const initParams = {
        processId: process.pid,
        rootUri: pathToFileURL(this.options.rootPath).href,
        capabilities: {
          textDocument: {
            synchronization: { dynamicRegistration: false, didSave: true },
            references: { dynamicRegistration: false },
            documentSymbol: { dynamicRegistration: false },
            rename: { dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: true },
          },
          workspace: { workspaceFolders: true },
        },
        workspaceFolders: [{ uri: pathToFileURL(this.options.rootPath).href, name: "workspace" }],
        initializationOptions: this.options.provider.initOptions,
      };

      const result = await this.connection.sendRequest<InitializeResultDescriptor>(
        "initialize",
        initParams
      );

      this.capabilities = {
        references: !!result.capabilities.referencesProvider,
        rename: !!result.capabilities.renameProvider,
        documentSymbol: !!result.capabilities.documentSymbolProvider,
        diagnostics: true,
        hover: !!result.capabilities.hoverProvider,
        definition: !!result.capabilities.definitionProvider,
        completion: !!result.capabilities.completionProvider,
      };

      this.connection.sendNotification("initialized", {});
      this.setState("ready");
      this.options.logger.info("LSP client ready");
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.connection || !this.process) {
      this.setState("stopped");
      return;
    }

    try {
      for (const uri of Array.from(this.openDocuments)) {
        await this.closeDocument(fileURLToPath(uri));
      }
      await this.connection.sendRequest("shutdown");
      this.connection.sendNotification("exit");
      this.connection.dispose();
    } catch (error) {
      this.options.logger.warn("Error during LSP shutdown:", error);
    } finally {
      if (this.process && !this.process.killed) {
        this.process.kill("SIGTERM");
      }
      this.connection = null;
      this.process = null;
      this.openDocuments.clear();
      this.setState("stopped");
    }
  }

  async openDocument(filePath: string): Promise<void> {
    this.assertReady();
    const uri = pathToFileURL(filePath).href;
    if (this.openDocuments.has(uri)) {
      return;
    }

    const content = await readFile(filePath, "utf-8");
    this.getConnection().sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: this.getLanguageId(filePath),
        version: 1,
        text: content,
      },
    });
    this.openDocuments.add(uri);
  }

  async closeDocument(filePath: string): Promise<void> {
    this.assertReady();
    const uri = pathToFileURL(filePath).href;
    if (!this.openDocuments.has(uri)) {
      return;
    }

    this.getConnection().sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });
    this.openDocuments.delete(uri);
  }

  async findReferences(filePath: string, line: number, column: number): Promise<LspLocation[]> {
    this.assertReady();
    await this.openDocument(filePath);

    const params = {
      textDocument: { uri: pathToFileURL(filePath).href },
      position: { line: line - 1, character: column - 1 },
      context: { includeDeclaration: true },
    };

    const result = await this.getConnection().sendRequest<LocationDescriptor[] | null>(
      "textDocument/references",
      params
    );

    if (!result) {
      return [];
    }
    return result.map((loc) => this.convertLocation(loc));
  }

  async rename(
    filePath: string,
    line: number,
    column: number,
    newName: string
  ): Promise<LspWorkspaceEdit | null> {
    this.assertReady();
    await this.openDocument(filePath);

    const params = {
      textDocument: { uri: pathToFileURL(filePath).href },
      position: { line: line - 1, character: column - 1 },
      newName,
    };

    const result = await this.getConnection().sendRequest<WorkspaceEditDescriptor | null>(
      "textDocument/rename",
      params
    );

    if (!result) {
      return null;
    }
    return this.convertWorkspaceEdit(result);
  }

  async getDocumentSymbols(filePath: string): Promise<LspSymbol[]> {
    this.assertReady();
    await this.openDocument(filePath);

    const params = { textDocument: { uri: pathToFileURL(filePath).href } };
    const result = await this.getConnection().sendRequest<DocumentSymbolDescriptor[] | null>(
      "textDocument/documentSymbol",
      params
    );

    if (!result || result.length === 0) {
      return [];
    }

    if (result[0].range) {
      return result.map((s) => this.convertDocumentSymbol(filePath, s));
    }

    return result.map((s) => ({
      name: s.name,
      kind: this.getSymbolKindName(s.kind),
      detail: s.detail,
      file: s.location ? fileURLToPath(s.location.uri) : filePath,
      line: (s.location?.range.start.line ?? 0) + 1,
      column: (s.location?.range.start.character ?? 0) + 1,
      endLine: (s.location?.range.end.line ?? 0) + 1,
      endColumn: (s.location?.range.end.character ?? 0) + 1,
    }));
  }

  // --- Private Methods ---

  private setState(state: LspClientState): void {
    this.state = state;
    this.emit("stateChange", state);
  }

  private assertReady(): void {
    if (!this.isReady() || !this.connection) {
      throw new Error("LSP client is not ready");
    }
  }

  private getConnection(): MessageConnection {
    if (!this.connection) {
      throw new Error("LSP connection not established");
    }
    return this.connection;
  }

  private getLanguageId(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "json":
        return "json";
      default:
        return "plaintext";
    }
  }

  private convertLocation(loc: LocationDescriptor): LspLocation {
    return {
      file: fileURLToPath(loc.uri),
      line: loc.range.start.line + 1,
      column: loc.range.start.character + 1,
      endLine: loc.range.end.line + 1,
      endColumn: loc.range.end.character + 1,
    };
  }

  private convertDiagnostic(uri: string, diag: DiagnosticItem): LspDiagnostic {
    const severityMap: Record<number, LspDiagnostic["severity"]> = {
      1: "error",
      2: "warning",
      3: "info",
      4: "hint",
    };

    return {
      file: fileURLToPath(uri),
      line: diag.range.start.line + 1,
      column: diag.range.start.character + 1,
      endLine: diag.range.end.line + 1,
      endColumn: diag.range.end.character + 1,
      severity: severityMap[diag.severity ?? 3] ?? "info",
      message: diag.message,
      code: diag.code,
      source: diag.source,
    };
  }

  private convertWorkspaceEdit(edit: WorkspaceEditDescriptor): LspWorkspaceEdit {
    const changes: LspWorkspaceEdit["changes"] = [];

    if (edit.changes) {
      for (const [uri, edits] of Object.entries(edit.changes)) {
        changes.push({
          file: fileURLToPath(uri),
          edits: edits.map((e) => ({
            range: {
              start: {
                line: e.range.start.line + 1,
                column: e.range.start.character + 1,
              },
              end: {
                line: e.range.end.line + 1,
                column: e.range.end.character + 1,
              },
            },
            newText: e.newText,
          })),
        });
      }
    }

    return { changes };
  }

  private convertDocumentSymbol(filePath: string, symbol: DocumentSymbolDescriptor): LspSymbol {
    const range = symbol.range ?? {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
    const result: LspSymbol = {
      name: symbol.name,
      kind: this.getSymbolKindName(symbol.kind),
      file: filePath,
      line: range.start.line + 1,
      column: range.start.character + 1,
      endLine: range.end.line + 1,
      endColumn: range.end.character + 1,
      detail: symbol.detail,
    };

    if (symbol.children && symbol.children.length > 0) {
      result.children = symbol.children.map((c) => this.convertDocumentSymbol(filePath, c));
    }

    return result;
  }

  private getSymbolKindName(kind: number): string {
    const kinds: Record<number, string> = {
      1: "File",
      2: "Module",
      3: "Namespace",
      4: "Package",
      5: "Class",
      6: "Method",
      7: "Property",
      8: "Field",
      9: "Constructor",
      10: "Enum",
      11: "Interface",
      12: "Function",
      13: "Variable",
      14: "Constant",
      15: "String",
      16: "Number",
      17: "Boolean",
      18: "Array",
      19: "Object",
      20: "Key",
      21: "Null",
      22: "EnumMember",
      23: "Struct",
      24: "Event",
      25: "Operator",
      26: "TypeParameter",
    };
    return kinds[kind] ?? "Unknown";
  }
}
