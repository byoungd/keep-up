/**
 * LSP Tool Server
 *
 * Provides semantic code intelligence tools for the agent runtime.
 * Tools: lsp_find_references, lsp_rename, lsp_document_symbols, lsp_diagnostics
 */

import type { LspClient } from "../client";
import type { LspLocation, LspSymbol, LspWorkspaceEdit } from "../types";

// Import types from agent-runtime (avoid circular dependency)
type MCPTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  annotations?: {
    requiresConfirmation?: boolean;
    readOnly?: boolean;
  };
};

type MCPToolResult = {
  success: boolean;
  content: Array<{ type: "text"; text: string }>;
  error?: { code: string; message: string };
};

type ToolContext = Record<string, unknown>;

type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<MCPToolResult>;

interface ToolDefinition {
  tool: MCPTool;
  handler: ToolHandler;
}

/**
 * LSP Tool Server for semantic code intelligence
 */
export class LspToolServer {
  readonly name = "lsp";
  readonly description = "Language Server Protocol tools for semantic code intelligence";

  private readonly tools = new Map<string, ToolDefinition>();
  private client: LspClient | null = null;

  constructor(private readonly clientFactory: () => Promise<LspClient>) {
    this.registerTools();
  }

  private registerTools(): void {
    // lsp_find_references
    this.tools.set("lsp_find_references", {
      tool: {
        name: "lsp_find_references",
        description:
          "Find all references to a symbol at a given location. Returns accurate locations across all files in the project. Use this instead of grep for finding symbol usages.",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "Absolute path to the file containing the symbol",
            },
            line: { type: "number", description: "Line number (1-indexed)" },
            column: { type: "number", description: "Column number (1-indexed)" },
          },
          required: ["file", "line", "column"],
        },
        annotations: { readOnly: true },
      },
      handler: this.handleFindReferences.bind(this),
    });

    // lsp_rename
    this.tools.set("lsp_rename", {
      tool: {
        name: "lsp_rename",
        description:
          "Rename a symbol across all files in the project. Returns a workspace edit with all changes needed. This is safer and more accurate than find-and-replace.",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "Absolute path to the file containing the symbol",
            },
            line: { type: "number", description: "Line number (1-indexed)" },
            column: { type: "number", description: "Column number (1-indexed)" },
            newName: { type: "string", description: "New name for the symbol" },
          },
          required: ["file", "line", "column", "newName"],
        },
        annotations: { requiresConfirmation: true },
      },
      handler: this.handleRename.bind(this),
    });

    // lsp_document_symbols
    this.tools.set("lsp_document_symbols", {
      tool: {
        name: "lsp_document_symbols",
        description:
          "Get all symbols (classes, functions, variables, etc.) defined in a file. Returns a hierarchical structure of the file's contents.",
        inputSchema: {
          type: "object",
          properties: {
            file: { type: "string", description: "Absolute path to the file" },
          },
          required: ["file"],
        },
        annotations: { readOnly: true },
      },
      handler: this.handleDocumentSymbols.bind(this),
    });

    // lsp_diagnostics
    this.tools.set("lsp_diagnostics", {
      tool: {
        name: "lsp_diagnostics",
        description:
          "Get diagnostics (errors, warnings) for a file. This is faster than running a full build and provides accurate error locations.",
        inputSchema: {
          type: "object",
          properties: {
            file: { type: "string", description: "Absolute path to the file" },
          },
          required: ["file"],
        },
        annotations: { readOnly: true },
      },
      handler: this.handleDiagnostics.bind(this),
    });
  }

  /**
   * List all available tools
   */
  listTools(): MCPTool[] {
    return Array.from(this.tools.values()).map((def) => def.tool);
  }

  /**
   * Call a tool by name
   */
  async callTool(
    call: { name: string; arguments: Record<string, unknown> },
    context: ToolContext
  ): Promise<MCPToolResult> {
    const definition = this.tools.get(call.name);
    if (!definition) {
      return {
        success: false,
        content: [{ type: "text", text: `Tool "${call.name}" not found` }],
        error: { code: "RESOURCE_NOT_FOUND", message: `Tool not found: ${call.name}` },
      };
    }

    return definition.handler(call.arguments, context);
  }

  /**
   * Initialize the LSP client
   */
  async initialize(): Promise<void> {
    if (!this.client) {
      this.client = await this.clientFactory();
      await this.client.start();
    }
  }

  /**
   * Dispose the LSP client
   */
  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = null;
    }
  }

  // --- Tool Handlers ---

  private async handleFindReferences(args: Record<string, unknown>): Promise<MCPToolResult> {
    const client = await this.ensureClient();
    const { file, line, column } = args as { file: string; line: number; column: number };

    try {
      const refs = await client.findReferences(file, line, column);
      return this.successResult(this.formatReferences(refs));
    } catch (error) {
      return this.errorResult("INTERNAL_ERROR", `Failed to find references: ${error}`);
    }
  }

  private async handleRename(args: Record<string, unknown>): Promise<MCPToolResult> {
    const client = await this.ensureClient();
    const { file, line, column, newName } = args as {
      file: string;
      line: number;
      column: number;
      newName: string;
    };

    try {
      const edit = await client.rename(file, line, column, newName);
      if (!edit) {
        return this.errorResult("OPERATION_FAILED", "Rename not possible at this location");
      }
      return this.successResult(this.formatWorkspaceEdit(edit));
    } catch (error) {
      return this.errorResult("INTERNAL_ERROR", `Failed to rename: ${error}`);
    }
  }

  private async handleDocumentSymbols(args: Record<string, unknown>): Promise<MCPToolResult> {
    const client = await this.ensureClient();
    const { file } = args as { file: string };

    try {
      const symbols = await client.getDocumentSymbols(file);
      return this.successResult(this.formatSymbols(symbols));
    } catch (error) {
      return this.errorResult("INTERNAL_ERROR", `Failed to get symbols: ${error}`);
    }
  }

  private async handleDiagnostics(args: Record<string, unknown>): Promise<MCPToolResult> {
    const client = await this.ensureClient();
    const { file } = args as { file: string };

    try {
      // Open the document to trigger diagnostics
      await client.openDocument(file);

      // Wait a bit for diagnostics to be computed
      await new Promise((resolve) => setTimeout(resolve, 500));

      // TODO: Collect diagnostics from the client's event emitter
      return this.successResult("Diagnostics requested. Check the diagnostics event for results.");
    } catch (error) {
      return this.errorResult("INTERNAL_ERROR", `Failed to get diagnostics: ${error}`);
    }
  }

  // --- Helpers ---

  private async ensureClient(): Promise<LspClient> {
    if (!this.client || !this.client.isReady()) {
      await this.initialize();
    }
    if (!this.client) {
      throw new Error("LSP client failed to initialize");
    }
    return this.client;
  }

  private successResult(text: string): MCPToolResult {
    return { success: true, content: [{ type: "text", text }] };
  }

  private errorResult(code: string, message: string): MCPToolResult {
    return {
      success: false,
      content: [{ type: "text", text: message }],
      error: { code, message },
    };
  }

  private formatReferences(refs: LspLocation[]): string {
    if (refs.length === 0) {
      return "No references found.";
    }

    const lines = [`Found ${refs.length} reference(s):\n`];
    for (const ref of refs) {
      lines.push(`  ${ref.file}:${ref.line}:${ref.column}`);
    }
    return lines.join("\n");
  }

  private formatWorkspaceEdit(edit: LspWorkspaceEdit): string {
    const lines = [`Workspace edit with ${edit.changes.length} file(s):\n`];
    for (const change of edit.changes) {
      lines.push(`\n${change.file}:`);
      for (const e of change.edits) {
        lines.push(
          `  L${e.range.start.line}:${e.range.start.column} - L${e.range.end.line}:${e.range.end.column}`
        );
        lines.push(`    → "${e.newText}"`);
      }
    }
    return lines.join("\n");
  }

  private formatSymbols(symbols: LspSymbol[], indent = 0): string {
    const prefix = "  ".repeat(indent);
    const lines: string[] = [];

    for (const sym of symbols) {
      lines.push(`${prefix}${sym.kind}: ${sym.name} (L${sym.line})`);
      if (sym.children) {
        lines.push(this.formatSymbols(sym.children, indent + 1));
      }
    }

    return lines.join("\n");
  }
}

/**
 * Factory function to create an LSP tool server
 */
export function createLspToolServer(clientFactory: () => Promise<LspClient>): LspToolServer {
  return new LspToolServer(clientFactory);
}
