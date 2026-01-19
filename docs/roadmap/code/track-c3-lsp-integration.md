# Track C3: Environment & LSP Integration

**Objective**: Give the Agent "IDE-Superpowers" by integrating real Language Server Protocols (LSP), allowing meaningful code navigation (Go to Definition, Find References) rather than just text search.

**Status**: Ready for Implementation
**Priority**: Medium (Advanced Optimization)
**Feature Branch**: `feat/code-lsp-integration`
**Depends On**: Track C1 (file operations)

---

## 1. Context & Design Philosophy

Text search is dumb. Code navigation is smart.

**Reference Implementation**: `opencode/internal/lsp/client.go` demonstrates a production-grade LSP client that:
- Spawns language servers as child processes (`tsserver`, `gopls`, `rust-analyzer`)
- Manages bidirectional JSON-RPC 2.0 communication
- Caches diagnostics for fast retrieval
- Handles server lifecycle (initialize, shutdown)

**Key Insight from `opencode`**:
- LSP is complex due to async initialization. Servers need time to "warm up" (especially TypeScript).
- Solution: Implement `WaitForServerReady()` with polling and key file opening.

---

## 2. File Structure

```
packages/agent-runtime/src/tools/code/lsp/
├── index.ts           # Public exports
├── client.ts          # LSP JSON-RPC client
├── transport.ts       # stdio transport layer
├── servers.ts         # Language server configurations
└── protocol.ts        # LSP protocol types (subset)
```

---

## 3. LSP Protocol Types (`protocol.ts`)

```typescript
// packages/agent-runtime/src/tools/code/lsp/protocol.ts

// Minimal subset of LSP types needed for code navigation

export interface Position {
  line: number;      // 0-indexed
  character: number; // 0-indexed
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;       // file:// URI
  range: Range;
}

export interface Diagnostic {
  range: Range;
  severity?: 1 | 2 | 3 | 4; // Error, Warning, Info, Hint
  code?: string | number;
  source?: string;
  message: string;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface SymbolInformation {
  name: string;
  kind: number;
  location: Location;
}

export interface DocumentSymbol {
  name: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}
```

---

## 4. JSON-RPC Transport (`transport.ts`)

Based on `opencode/internal/lsp/transport.go`:

```typescript
// packages/agent-runtime/src/tools/code/lsp/transport.ts

import { ChildProcess } from "node:child_process";

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface Transport {
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  close(): Promise<void>;
}

/**
 * Create a stdio-based transport for LSP communication.
 * Reads from stdout, writes to stdin of the child process.
 */
export function createStdioTransport(process: ChildProcess): Transport;
```

**Implementation Notes**:
- LSP messages are encoded with `Content-Length: N\r\n\r\n{json}` header.
- Use `readline` or buffer accumulation to parse incoming messages.
- Maintain a map of pending requests by ID for response correlation.

---

## 5. LSP Client (`client.ts`)

Reference: `opencode/internal/lsp/client.go` lines 22-115

```typescript
// packages/agent-runtime/src/tools/code/lsp/client.ts

import { spawn, ChildProcess } from "node:child_process";
import { Transport, createStdioTransport } from "./transport";
import type { Location, Diagnostic, DocumentSymbol, Position } from "./protocol";

export interface LSPClientOptions {
  /** Command to start the LSP server (e.g., "typescript-language-server") */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Timeout for requests in milliseconds. Default: 30000 */
  timeout?: number;
}

export interface LSPClient {
  /** Initialize the LSP server with the given root path */
  initialize(rootPath: string): Promise<void>;

  /** Wait for server to be ready (handles TypeScript slow startup) */
  waitForReady(): Promise<void>;

  /** Open a file in the server (required before queries) */
  openFile(path: string): Promise<void>;

  /** Close a file in the server */
  closeFile(path: string): Promise<void>;

  /** Go to definition at a position */
  goToDefinition(path: string, position: Position): Promise<Location[]>;

  /** Find all references to a symbol at a position */
  findReferences(path: string, position: Position): Promise<Location[]>;

  /** Get document symbols/outline */
  getDocumentSymbols(path: string): Promise<DocumentSymbol[]>;

  /** Get diagnostics (errors/warnings) for a file */
  getDiagnostics(path: string): Promise<Diagnostic[]>;

  /** Shutdown the server */
  shutdown(): Promise<void>;
}

export async function createLSPClient(options: LSPClientOptions): Promise<LSPClient>;
```

**Initialization Sequence** (from `opencode`):
1. Spawn process with command.
2. Send `initialize` request with `InitializeParams`.
3. Send `initialized` notification.
4. Register handlers for `textDocument/publishDiagnostics`.
5. For TypeScript: Open key config files (`tsconfig.json`, `package.json`).
6. Poll with `workspace/symbol` until server responds (ready check).

---

## 6. Language Server Configurations (`servers.ts`)

```typescript
// packages/agent-runtime/src/tools/code/lsp/servers.ts

export interface ServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  /** File patterns this server handles */
  filePatterns: string[];
  /** Files to check for auto-detection */
  projectMarkers: string[];
}

export const LANGUAGE_SERVERS: ServerConfig[] = [
  {
    id: "typescript",
    name: "TypeScript Language Server",
    command: "typescript-language-server",
    args: ["--stdio"],
    filePatterns: ["*.ts", "*.tsx", "*.js", "*.jsx"],
    projectMarkers: ["tsconfig.json", "jsconfig.json", "package.json"]
  },
  {
    id: "go",
    name: "gopls",
    command: "gopls",
    args: ["serve"],
    filePatterns: ["*.go"],
    projectMarkers: ["go.mod"]
  },
  {
    id: "rust",
    name: "rust-analyzer",
    command: "rust-analyzer",
    args: [],
    filePatterns: ["*.rs"],
    projectMarkers: ["Cargo.toml"]
  },
  {
    id: "python",
    name: "pyright",
    command: "pyright-langserver",
    args: ["--stdio"],
    filePatterns: ["*.py"],
    projectMarkers: ["pyproject.toml", "setup.py", "requirements.txt"]
  }
];

/**
 * Detect the appropriate language server for a project.
 */
export function detectLanguageServer(rootPath: string): ServerConfig | null;

/**
 * Check if a language server is available on the system.
 */
export async function isServerAvailable(config: ServerConfig): Promise<boolean>;
```

---

## 7. Tool Definitions (MCP)

```typescript
// Tool: go_to_definition
{
  name: "go_to_definition",
  description: "Find the definition of a symbol at a given position in a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the source file" },
      line: { type: "number", description: "1-indexed line number" },
      character: { type: "number", description: "1-indexed character position" }
    },
    required: ["path", "line", "character"]
  }
}

// Tool: find_references
{
  name: "find_references",
  description: "Find all references to a symbol at a given position.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the source file" },
      line: { type: "number", description: "1-indexed line number" },
      character: { type: "number", description: "1-indexed character position" }
    },
    required: ["path", "line", "character"]
  }
}

// Tool: get_diagnostics
{
  name: "get_diagnostics",
  description: "Get compiler errors and warnings for a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the source file" }
    },
    required: ["path"]
  }
}
```

---

## 8. Verification Plan

### Integration Tests

```typescript
// packages/agent-runtime/src/tools/code/lsp/__tests__/client.test.ts
import { createLSPClient } from "../client";
import { LANGUAGE_SERVERS } from "../servers";
import * as path from "node:path";

describe("LSPClient (TypeScript)", () => {
  const tsConfig = LANGUAGE_SERVERS.find(s => s.id === "typescript")!;

  it("should initialize and get document symbols", async () => {
    const client = await createLSPClient({
      command: tsConfig.command,
      args: tsConfig.args,
      cwd: path.resolve("./fixtures/sample-ts-project")
    });

    await client.initialize("./fixtures/sample-ts-project");
    await client.waitForReady();
    await client.openFile("./fixtures/sample-ts-project/src/index.ts");

    const symbols = await client.getDocumentSymbols("./fixtures/sample-ts-project/src/index.ts");
    expect(symbols.length).toBeGreaterThan(0);

    await client.shutdown();
  }, 60000); // Long timeout for server startup
});
```

---

## 9. Implementation Checklist

1. [ ] Implement `protocol.ts` with LSP type definitions
2. [ ] Implement `transport.ts` with stdio JSON-RPC handling
3. [ ] Implement `client.ts` with full lifecycle management
4. [ ] Implement `servers.ts` with auto-detection
5. [ ] Add LSP tools to `codeServer.ts`
6. [ ] Handle graceful degradation (if no LSP available, return informative error)
7. [ ] Write integration tests with a real TypeScript project
8. [ ] Run `pnpm typecheck` and `pnpm test`
9. [ ] Commit to `feat/code-lsp-integration` and create PR

---

## 10. Best Practices from `opencode`

1. **Lazy Initialization**: Don't start LSP until first query.
2. **File Caching**: Keep track of open files to avoid re-opening.
3. **Diagnostic Subscription**: Cache diagnostics pushed by server.
4. **Graceful Shutdown**: Always call `shutdown` before killing process.
5. **Timeout Handling**: TypeScript can take 10+ seconds to initialize.
