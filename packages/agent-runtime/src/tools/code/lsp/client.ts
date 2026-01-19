/**
 * LSP client implementation over JSON-RPC stdio transport.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  Diagnostic,
  DocumentSymbol,
  Location,
  Position,
  Range,
  SymbolInformation,
} from "./protocol";
import { createStdioTransport, type JsonRpcMessage, type Transport } from "./transport";

export interface LSPClientOptions {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
}

export interface LSPClient {
  initialize(rootPath: string): Promise<void>;
  waitForReady(): Promise<void>;
  openFile(path: string): Promise<void>;
  closeFile(path: string): Promise<void>;
  goToDefinition(path: string, position: Position): Promise<Location[]>;
  findReferences(path: string, position: Position): Promise<Location[]>;
  getDocumentSymbols(path: string): Promise<DocumentSymbol[]>;
  getDiagnostics(path: string): Promise<Diagnostic[]>;
  shutdown(): Promise<void>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface LocationLink {
  targetUri: string;
  targetRange: Range;
  targetSelectionRange?: Range;
}

interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: Diagnostic[];
}

interface WorkspaceConfigurationParams {
  items?: Array<{ section?: string }>;
}

interface WorkspaceSymbolParams {
  query: string;
}

type ResolvedLspClientOptions = Omit<LSPClientOptions, "args" | "timeout"> & {
  args: string[];
  timeout: number;
};

export class LSPClientImpl implements LSPClient {
  private readonly options: ResolvedLspClientOptions;
  private process: ChildProcess | null = null;
  private transport: Transport | null = null;
  private rootPath: string | null = null;
  private rootUri: string | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private openDocuments = new Map<string, number>();
  private diagnosticsByUri = new Map<string, Diagnostic[]>();
  private diagnosticsWaiters = new Map<string, Set<(diagnostics: Diagnostic[]) => void>>();
  private initializePromise: Promise<void> | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(options: LSPClientOptions) {
    this.options = {
      ...options,
      args: options.args ?? [],
      timeout: options.timeout ?? 30_000,
    };
  }

  async initialize(rootPath: string): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.initializeInternal(rootPath);
    try {
      await this.initializePromise;
    } catch (error) {
      this.initializePromise = null;
      throw error;
    }
  }

  async waitForReady(): Promise<void> {
    if (!this.initializePromise) {
      throw new Error("LSP client is not initialized");
    }

    if (!this.readyPromise) {
      this.readyPromise = this.waitForReadyInternal();
    }
    return this.readyPromise;
  }

  async openFile(filePath: string): Promise<void> {
    const transport = this.ensureTransport();
    const absolutePath = path.resolve(filePath);
    const uri = pathToFileURL(absolutePath).href;
    if (this.openDocuments.has(uri)) {
      return;
    }

    const content = await fs.readFile(absolutePath, "utf8");
    const languageId = getLanguageId(absolutePath);
    const version = 1;

    await transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri,
          languageId,
          version,
          text: content,
        },
      },
    });

    this.openDocuments.set(uri, version);
  }

  async closeFile(filePath: string): Promise<void> {
    const transport = this.ensureTransport();
    const absolutePath = path.resolve(filePath);
    const uri = pathToFileURL(absolutePath).href;

    if (!this.openDocuments.has(uri)) {
      return;
    }

    await transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: {
        textDocument: { uri },
      },
    });

    this.openDocuments.delete(uri);
  }

  async goToDefinition(filePath: string, position: Position): Promise<Location[]> {
    await this.openFile(filePath);
    const uri = pathToFileURL(path.resolve(filePath)).href;

    const result = await this.sendRequest<Location | Location[] | LocationLink[] | null>(
      "textDocument/definition",
      {
        textDocument: { uri },
        position,
      }
    );

    return normalizeLocations(result);
  }

  async findReferences(filePath: string, position: Position): Promise<Location[]> {
    await this.openFile(filePath);
    const uri = pathToFileURL(path.resolve(filePath)).href;

    const result = await this.sendRequest<Location[] | null>("textDocument/references", {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    });

    return result ?? [];
  }

  async getDocumentSymbols(filePath: string): Promise<DocumentSymbol[]> {
    await this.openFile(filePath);
    const uri = pathToFileURL(path.resolve(filePath)).href;

    const result = await this.sendRequest<Array<DocumentSymbol | SymbolInformation> | null>(
      "textDocument/documentSymbol",
      {
        textDocument: { uri },
      }
    );

    if (!result || result.length === 0) {
      return [];
    }

    if (isSymbolInformation(result[0])) {
      return (result as SymbolInformation[]).map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind,
        range: symbol.location.range,
        selectionRange: symbol.location.range,
      }));
    }

    return result as DocumentSymbol[];
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    await this.openFile(filePath);
    const uri = pathToFileURL(path.resolve(filePath)).href;
    const cached = this.diagnosticsByUri.get(uri);
    if (cached) {
      return cached;
    }

    return this.waitForDiagnostics(uri, Math.min(this.options.timeout, 5000));
  }

  async shutdown(): Promise<void> {
    const transport = this.transport;
    if (!transport || !this.process) {
      return;
    }

    try {
      const openUris = Array.from(this.openDocuments.keys());
      for (const uri of openUris) {
        await this.closeFile(fileURLToPath(uri));
      }
      await this.sendRequest("shutdown", {});
      await transport.send({ jsonrpc: "2.0", method: "exit" });
    } catch {
      // Ignore shutdown errors.
    } finally {
      await transport.close();
      if (!this.process.killed) {
        this.process.kill("SIGTERM");
      }
      this.resetState();
    }
  }

  // --------------------------------------------------------------------------
  // Internal Helpers
  // --------------------------------------------------------------------------

  private async initializeInternal(rootPath: string): Promise<void> {
    this.rootPath = path.resolve(rootPath);
    this.rootUri = pathToFileURL(this.rootPath).href;

    this.process = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd ?? this.rootPath,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.on("error", (error) => {
      this.failPendingRequests(error instanceof Error ? error : new Error(String(error)));
    });

    this.process.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        this.failPendingRequests(new Error(`LSP server exited with code ${code}`));
      }
    });

    this.transport = createStdioTransport(this.process);
    this.transport.onMessage(this.handleMessage);

    const initParams = {
      processId: process.pid,
      rootUri: this.rootUri,
      rootPath: this.rootPath,
      capabilities: {
        workspace: {
          workspaceFolders: true,
        },
        textDocument: {
          synchronization: {
            didSave: true,
          },
        },
      },
      workspaceFolders: [{ uri: this.rootUri, name: path.basename(this.rootPath) }],
    };

    await this.sendRequest("initialize", initParams);
    await this.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} });
  }

  private async waitForReadyInternal(): Promise<void> {
    await this.openWarmupFiles();
    const deadline = Date.now() + this.options.timeout;

    while (Date.now() < deadline) {
      try {
        await this.sendRequest<unknown>(
          "workspace/symbol",
          { query: "" } satisfies WorkspaceSymbolParams,
          2000
        );
        return;
      } catch (error) {
        if (error instanceof Error && /method.*not found/i.test(error.message)) {
          return;
        }
        await delay(500);
      }
    }

    throw new Error("LSP server did not become ready in time");
  }

  private async openWarmupFiles(): Promise<void> {
    if (!this.rootPath) {
      return;
    }

    const warmupFiles = ["tsconfig.json", "jsconfig.json", "package.json"];
    for (const file of warmupFiles) {
      const filePath = path.join(this.rootPath, file);
      if (await fileExists(filePath)) {
        await this.openFile(filePath);
      }
    }
  }

  private handleMessage = (message: JsonRpcMessage) => {
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as PublishDiagnosticsParams | undefined;
      if (params?.uri) {
        this.diagnosticsByUri.set(params.uri, params.diagnostics ?? []);
        this.resolveDiagnosticsWaiters(params.uri);
      }
      return;
    }

    if (message.id !== undefined && message.method) {
      this.handleServerRequest(message);
      return;
    }

    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  };

  private handleServerRequest(message: JsonRpcMessage): void {
    if (message.id === undefined || !this.transport) {
      return;
    }

    let result: unknown = null;
    if (message.method === "workspace/configuration") {
      const params = message.params as WorkspaceConfigurationParams | undefined;
      const items = params?.items ?? [];
      result = items.map(() => ({}));
    } else if (message.method === "workspace/workspaceFolders") {
      if (this.rootUri && this.rootPath) {
        result = [{ uri: this.rootUri, name: path.basename(this.rootPath) }];
      } else {
        result = [];
      }
    }

    this.transport
      .send({
        jsonrpc: "2.0",
        id: message.id,
        result,
      })
      .catch(() => {
        // Ignore response errors.
      });
  }

  private async sendRequest<T>(
    method: string,
    params: unknown,
    timeoutOverride?: number
  ): Promise<T> {
    const transport = this.ensureTransport();
    const id = this.requestId++;
    const timeoutMs = timeoutOverride ?? this.options.timeout;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, timeoutMs);

      const resolveUnknown = (value: unknown) => resolve(value as T);
      this.pendingRequests.set(id, { resolve: resolveUnknown, reject, timeoutId });
      transport
        .send({
          jsonrpc: "2.0",
          id,
          method,
          params,
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private ensureTransport(): Transport {
    if (!this.transport) {
      throw new Error("LSP transport not initialized");
    }
    return this.transport;
  }

  private waitForDiagnostics(uri: string, timeoutMs: number): Promise<Diagnostic[]> {
    const cached = this.diagnosticsByUri.get(uri);
    if (cached) {
      return Promise.resolve(cached);
    }

    return new Promise((resolve) => {
      const waiters = this.diagnosticsWaiters.get(uri) ?? new Set();
      const resolver = (diagnostics: Diagnostic[]) => {
        clearTimeout(timeoutId);
        waiters.delete(resolver);
        resolve(diagnostics);
      };
      const timeoutId = setTimeout(() => {
        waiters.delete(resolver);
        resolve(this.diagnosticsByUri.get(uri) ?? []);
      }, timeoutMs);

      waiters.add(resolver);
      this.diagnosticsWaiters.set(uri, waiters);
    });
  }

  private resolveDiagnosticsWaiters(uri: string): void {
    const diagnostics = this.diagnosticsByUri.get(uri) ?? [];
    const waiters = this.diagnosticsWaiters.get(uri);
    if (!waiters || waiters.size === 0) {
      return;
    }

    for (const waiter of Array.from(waiters)) {
      waiter(diagnostics);
    }
    waiters.clear();
  }

  private failPendingRequests(error: Error): void {
    for (const pending of Array.from(this.pendingRequests.values())) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private resetState(): void {
    this.transport = null;
    this.process = null;
    this.openDocuments.clear();
    this.pendingRequests.clear();
    this.diagnosticsByUri.clear();
    this.diagnosticsWaiters.clear();
    this.initializePromise = null;
    this.readyPromise = null;
  }
}

export async function createLSPClient(options: LSPClientOptions): Promise<LSPClient> {
  return new LSPClientImpl(options);
}

function normalizeLocations(result: Location | Location[] | LocationLink[] | null): Location[] {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result
      .map((item) => normalizeLocation(item))
      .filter((item): item is Location => item !== null);
  }

  const normalized = normalizeLocation(result);
  return normalized ? [normalized] : [];
}

function normalizeLocation(item: Location | LocationLink): Location | null {
  if (isLocation(item)) {
    return item;
  }

  if ("targetUri" in item && item.targetUri && item.targetRange) {
    return {
      uri: item.targetUri,
      range: item.targetRange,
    };
  }

  return null;
}

function isLocation(value: Location | LocationLink): value is Location {
  return "uri" in value;
}

function isSymbolInformation(
  value: DocumentSymbol | SymbolInformation
): value is SymbolInformation {
  return "location" in value;
}

function getLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "typescriptreact";
    case ".js":
      return "javascript";
    case ".jsx":
      return "javascriptreact";
    case ".json":
      return "json";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    case ".py":
      return "python";
    default:
      return "plaintext";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function lspLocationToPath(location: Location): string {
  return fileURLToPath(location.uri);
}
