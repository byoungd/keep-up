/**
 * Code Tool Server
 *
 * MCP server providing code file operations: read, edit, list.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { MCPTool, MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";
import * as editor from "./editor";
import * as fileSystem from "./fileSystem";
import {
  createLSPClient,
  type Diagnostic,
  type DocumentSymbol,
  detectLanguageServerForPath,
  isServerAvailable,
  type Location,
  type LSPClient,
  lspLocationToPath,
  type ServerConfig,
} from "./lsp";
import {
  type ApplyWorkspaceEditResult,
  applyWorkspaceEdit,
  collectWorkspaceChanges,
} from "./lsp/workspaceEdit";
import * as patch from "./patch";
import { type SearchResult, searchCode } from "./search";
import { getOutline, type OutlineItem, type OutlineResult } from "./skeleton";
import { createWindowViewer, type WindowViewResult } from "./window";

// ============================================================================
// Tool Server
// ============================================================================

class LspUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LspUnavailableError";
  }
}

class LspProjectNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LspProjectNotFoundError";
  }
}

interface LspSession {
  client: LSPClient;
  config: ServerConfig;
  rootPath: string;
}

interface LspWarmupSummary {
  opened: number;
  total: number;
  truncated: boolean;
}

export class CodeInteractionServer extends BaseToolServer {
  readonly name = "code_interaction";
  readonly description = "Code file reading, editing, and navigation tools";

  private readonly windowViewer = createWindowViewer();
  private readonly lspSessions = new Map<string, Promise<LspSession>>();
  private readonly lspWarmups = new Map<string, Promise<LspWarmupSummary | null>>();

  constructor() {
    super();
    this.registerTool(this.createReadFileTool(), this.handleReadFile.bind(this));
    this.registerTool(this.createListFilesTool(), this.handleListFiles.bind(this));
    this.registerTool(this.createEditFileTool(), this.handleEditFile.bind(this));
    this.registerTool(this.createApplyPatchTool(), this.handleApplyPatch.bind(this));
    this.registerTool(this.createViewOutlineTool(), this.handleViewOutline.bind(this));
    this.registerTool(this.createSearchCodeTool(), this.handleSearchCode.bind(this));
    this.registerTool(this.createScrollFileTool(), this.handleScrollFile.bind(this));
    this.registerTool(this.createGoToDefinitionTool(), this.handleGoToDefinition.bind(this));
    this.registerTool(this.createFindReferencesTool(), this.handleFindReferences.bind(this));
    this.registerTool(this.createNavDefTool(), this.handleGoToDefinition.bind(this));
    this.registerTool(this.createNavRefsTool(), this.handleFindReferences.bind(this));
    this.registerTool(this.createNavSymbolsTool(), this.handleNavSymbols.bind(this));
    this.registerTool(this.createRenameSymbolTool(), this.handleRenameSymbol.bind(this));
    this.registerTool(this.createDiagnosticsTool(), this.handleDiagnostics.bind(this));
  }

  // --------------------------------------------------------------------------
  // Tool Definitions
  // --------------------------------------------------------------------------

  private createReadFileTool(): MCPTool {
    return {
      name: "read_file",
      description:
        "Read a file's content with optional line range. Returns content with line numbers for easy reference.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative file path",
          },
          start_line: {
            type: "number",
            description: "1-indexed start line (inclusive). Omit to start from beginning.",
          },
          end_line: {
            type: "number",
            description: "1-indexed end line (inclusive). Omit to read to end.",
          },
          with_line_numbers: {
            type: "boolean",
            description: "Include line numbers in output (default: true)",
          },
        },
        required: ["path"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createListFilesTool(): MCPTool {
    return {
      name: "list_files",
      description:
        "List files in a directory. Respects .gitignore by default. Use this to explore the codebase structure.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Directory path to list",
          },
          max_depth: {
            type: "number",
            description: "Maximum recursion depth (default: unlimited)",
          },
          include_hidden: {
            type: "boolean",
            description: "Include hidden files/directories (default: false)",
          },
        },
        required: ["path"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createEditFileTool(): MCPTool {
    return {
      name: "edit_file",
      description:
        "Edit a file by replacing lines. Supports multiple edits in one call. Automatically validates syntax and rolls back on errors.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "File path to edit",
          },
          edits: {
            type: "array",
            description: "List of edits to apply",
            items: {
              type: "object",
              properties: {
                start_line: {
                  type: "number",
                  description: "1-indexed start line (inclusive)",
                },
                end_line: {
                  type: "number",
                  description: "1-indexed end line (inclusive)",
                },
                replacement: {
                  type: "string",
                  description: "Replacement content",
                },
              },
              required: ["start_line", "end_line", "replacement"],
            },
          },
          dry_run: {
            type: "boolean",
            description: "If true, show diff without applying changes (default: false)",
          },
          validate_syntax: {
            type: "boolean",
            description: "Run syntax validation after edit (default: true for known languages)",
          },
        },
        required: ["path", "edits"],
      },
      annotations: {
        requiresConfirmation: true,
        readOnly: false,
        policyAction: "file.write",
      },
    };
  }

  private createApplyPatchTool(): MCPTool {
    return {
      name: "apply_patch",
      description:
        "Apply a unified diff patch to one or more files. Uses fuzzy matching to tolerate minor whitespace mismatches.",
      inputSchema: {
        type: "object" as const,
        properties: {
          patch: {
            type: "string",
            description: "Unified diff patch content",
          },
          base_path: {
            type: "string",
            description: "Base path for relative patch file paths (default: cwd)",
          },
        },
        required: ["patch"],
      },
      annotations: {
        requiresConfirmation: true,
        readOnly: false,
        policyAction: "file.write",
      },
    };
  }

  private createViewOutlineTool(): MCPTool {
    return {
      name: "view_outline",
      description:
        "Get the structure/skeleton of a source file (classes, functions, etc.) without implementation details.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "Path to the source file" },
        },
        required: ["path"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createSearchCodeTool(): MCPTool {
    return {
      name: "search_code",
      description: "Search for text or patterns across the codebase using ripgrep.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search term or regex pattern" },
          path: { type: "string", description: "Limit search to this file or directory" },
          is_regex: { type: "boolean", description: "Treat query as regex (default: false)" },
          case_sensitive: {
            type: "boolean",
            description: "Case-sensitive search (default: false)",
          },
          max_results: { type: "number", description: "Maximum results to return (default: 50)" },
          include_extensions: {
            type: "array",
            description: "File extensions to include (e.g., ['.ts', '.tsx'])",
            items: { type: "string" },
          },
          exclude_patterns: {
            type: "array",
            description: "Glob patterns to exclude (e.g., ['**/node_modules/**'])",
            items: { type: "string" },
          },
        },
        required: ["query"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createScrollFileTool(): MCPTool {
    return {
      name: "scroll_file",
      description: "Navigate through the currently open file (scroll up, down, or go to a line).",
      inputSchema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["open", "scroll_up", "scroll_down", "goto"],
            description: "Navigation action",
          },
          path: { type: "string", description: "File to open (required for 'open')" },
          line: { type: "number", description: "Line number (required for 'goto')" },
        },
        required: ["action"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  private getStaleEditResult(filePaths: string[], context: ToolContext): MCPToolResult | null {
    const fileContext = context.fileContext;
    if (!fileContext) {
      return null;
    }

    const uniquePaths = Array.from(new Set(filePaths));
    const stale = uniquePaths.filter((filePath) => fileContext.isStale(filePath));
    if (stale.length === 0) {
      return null;
    }

    const staleList = stale.map((filePath) => fileContext.getEntry(filePath)?.path ?? filePath);
    const message = `Stale file context detected. Reload before editing:\n${staleList
      .map((entry) => `- ${entry}`)
      .join("\n")}`;

    return errorResult("CONFLICT", message);
  }

  private ensureWriteAccess(context: ToolContext): MCPToolResult | null {
    const filePermission = context.security?.permissions?.file;
    if (filePermission === "read" || filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system write access is disabled");
    }
    return null;
  }

  private resolveEditRequest(args: Record<string, unknown>):
    | {
        filePath: string;
        edits: Array<{ start_line: number; end_line: number; replacement: string }>;
      }
    | MCPToolResult {
    const filePath = args.path as string | undefined;
    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }

    const edits = args.edits as
      | Array<{
          start_line: number;
          end_line: number;
          replacement: string;
        }>
      | undefined;

    if (!edits || !Array.isArray(edits) || edits.length === 0) {
      return errorResult("INVALID_ARGUMENTS", "edits array is required and must not be empty");
    }

    return { filePath, edits };
  }

  private isToolResult(
    value:
      | {
          filePath: string;
          edits: Array<{ start_line: number; end_line: number; replacement: string }>;
        }
      | MCPToolResult
  ): value is MCPToolResult {
    return "success" in value;
  }

  private markRead(filePath: string, context: ToolContext): void {
    context.fileContext?.markRead(filePath);
  }

  private markWrite(filePath: string, context: ToolContext): void {
    context.fileContext?.markWrite(filePath);
  }

  private async handleReadFile(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string | undefined;
    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }

    // Check file permission
    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const result = await fileSystem.readFile(filePath, {
        startLine: args.start_line as number | undefined,
        endLine: args.end_line as number | undefined,
        withLineNumbers: (args.with_line_numbers as boolean | undefined) ?? true,
      });

      this.markRead(result.path, context);

      const header = `[File: ${result.path}] (${result.totalLines} lines total, showing ${result.range[0]}-${result.range[1]})`;
      return textResult(`${header}\n\n${result.content}`);
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleListFiles(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const dirPath = args.path as string | undefined;
    if (!dirPath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const entries = await fileSystem.listFiles(dirPath, {
        maxDepth: args.max_depth as number | undefined,
        includeHidden: (args.include_hidden as boolean | undefined) ?? false,
      });

      if (entries.length === 0) {
        return textResult(`No files found in: ${dirPath}`);
      }

      // Format as tree-like structure
      const formatted = entries
        .map((e) => {
          const icon = e.type === "directory" ? "📁" : "📄";
          const size = e.size !== undefined ? ` (${formatBytes(e.size)})` : "";
          return `${icon} ${e.path}${size}`;
        })
        .join("\n");

      const output = `## Files in ${dirPath}\n\n${formatted}`;
      const maxOutputBytes = context.security?.limits?.maxOutputBytes;
      if (maxOutputBytes && Buffer.byteLength(output) > maxOutputBytes) {
        const truncated = Buffer.from(output).subarray(0, maxOutputBytes).toString();
        return textResult(`${truncated}\n\n[Output truncated at ${maxOutputBytes} bytes]`);
      }

      return textResult(output);
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Failed to list files: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleEditFile(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const request = this.resolveEditRequest(args);
    if (this.isToolResult(request)) {
      return request;
    }

    const permissionResult = this.ensureWriteAccess(context);
    if (permissionResult) {
      return permissionResult;
    }

    const staleResult = this.getStaleEditResult([request.filePath], context);
    if (staleResult) {
      return staleResult;
    }

    const dryRun = (args.dry_run as boolean | undefined) ?? false;
    const validateSyntax = (args.validate_syntax as boolean | undefined) ?? true;

    try {
      const result = await editor.editFile(
        request.filePath,
        request.edits.map((e) => ({
          startLine: e.start_line,
          endLine: e.end_line,
          replacement: e.replacement,
        })),
        {
          dryRun,
          validateSyntax,
        }
      );

      if (!result.success) {
        const rollbackMsg = result.rolledBack ? "\n\n⚠️ Changes have been rolled back." : "";
        return errorResult(
          "EXECUTION_FAILED",
          `Edit failed: ${result.syntaxError}${rollbackMsg}\n\n**Diff (not applied):**\n\`\`\`diff\n${result.diff}\n\`\`\``
        );
      }

      const dryRunNote = dryRun ? " (dry run - not applied)" : "";
      if (!dryRun) {
        this.markWrite(request.filePath, context);
      }
      return textResult(
        `✅ Edit successful${dryRunNote}\n\n**Diff:**\n\`\`\`diff\n${result.diff}\n\`\`\`\n\nNew file has ${result.newTotalLines} lines.`
      );
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Failed to edit file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleApplyPatch(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const patchContent = args.patch as string | undefined;
    if (!patchContent) {
      return errorResult("INVALID_ARGUMENTS", "patch is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "read" || filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system write access is disabled");
    }

    try {
      const patchPaths = patch.getPatchFilePaths(
        patchContent,
        args.base_path as string | undefined
      );
      if (!patchPaths.success) {
        return errorResult("INVALID_ARGUMENTS", patchPaths.error);
      }

      const staleResult = this.getStaleEditResult(patchPaths.filePaths, context);
      if (staleResult) {
        return staleResult;
      }

      const result = await patch.applyPatch(patchContent, args.base_path as string | undefined);
      if (!result.success) {
        return errorResult("EXECUTION_FAILED", result.error ?? "Failed to apply patch");
      }

      for (const filePath of result.filesModified) {
        this.markWrite(filePath, context);
      }

      const fuzzNote = result.fuzzLevel === 0 ? "exact match" : `fuzz level ${result.fuzzLevel}`;
      const filesList =
        result.filesModified.length > 0 ? `\n\n${result.filesModified.join("\n")}` : "";
      return textResult(
        `Patch applied (${fuzzNote}) to ${result.filesModified.length} file(s).${filesList}`
      );
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Failed to apply patch: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleViewOutline(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string | undefined;
    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const outline = await getOutline(filePath);
      const formatted = formatOutline(outline);
      this.markRead(filePath, context);
      return textResult(formatted);
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Failed to get outline: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleSearchCode(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const query = args.query as string | undefined;
    if (!query) {
      return errorResult("INVALID_ARGUMENTS", "query is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const result = await searchCode(query, {
        path: args.path as string | undefined,
        isRegex: (args.is_regex as boolean | undefined) ?? false,
        caseSensitive: (args.case_sensitive as boolean | undefined) ?? false,
        maxResults: args.max_results as number | undefined,
        includeExtensions: args.include_extensions as string[] | undefined,
        excludePatterns: args.exclude_patterns as string[] | undefined,
      });

      const formatted = formatSearchResult(result);
      return textResult(formatted);
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Search failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleScrollFile(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const action = args.action as string | undefined;
    if (!action) {
      return errorResult("INVALID_ARGUMENTS", "action is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      let result: WindowViewResult;
      switch (action) {
        case "open": {
          const filePath = args.path as string | undefined;
          if (!filePath) {
            return errorResult("INVALID_ARGUMENTS", "path is required for action 'open'");
          }
          result = await this.windowViewer.open(filePath, args.line as number | undefined);
          break;
        }
        case "scroll_up":
          result = await this.windowViewer.scrollUp();
          break;
        case "scroll_down":
          result = await this.windowViewer.scrollDown();
          break;
        case "goto": {
          const line = args.line as number | undefined;
          if (!line) {
            return errorResult("INVALID_ARGUMENTS", "line is required for action 'goto'");
          }
          result = await this.windowViewer.goto(line);
          break;
        }
        default:
          return errorResult("INVALID_ARGUMENTS", `Unknown action: ${action}`);
      }

      this.markRead(result.path, context);

      const header = `[File: ${result.path}] (${result.totalLines} lines total, showing ${result.viewportStart}-${result.viewportEnd})`;
      const stats = `Lines above: ${result.linesAbove}, lines below: ${result.linesBelow}`;
      return textResult(`${header}\n${stats}\n\n${result.content}`);
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Failed to scroll file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // --------------------------------------------------------------------------
  // LSP Tool Definitions
  // --------------------------------------------------------------------------

  private createGoToDefinitionTool(): MCPTool {
    return {
      name: "go_to_definition",
      description: "Find the definition of a symbol at a given position in a file.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the source file",
          },
          line: {
            type: "number",
            description: "1-indexed line number",
          },
          character: {
            type: "number",
            description: "1-indexed character position",
          },
        },
        required: ["path", "line", "character"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createFindReferencesTool(): MCPTool {
    return {
      name: "find_references",
      description: "Find all references to a symbol at a given position.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the source file",
          },
          line: {
            type: "number",
            description: "1-indexed line number",
          },
          character: {
            type: "number",
            description: "1-indexed character position",
          },
        },
        required: ["path", "line", "character"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createNavDefTool(): MCPTool {
    return {
      name: "nav_def",
      description: "Navigate to the definition of a symbol at a given position.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the source file",
          },
          line: {
            type: "number",
            description: "1-indexed line number",
          },
          character: {
            type: "number",
            description: "1-indexed character position",
          },
        },
        required: ["path", "line", "character"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createNavRefsTool(): MCPTool {
    return {
      name: "nav_refs",
      description: "Find references to a symbol at a given position.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the source file",
          },
          line: {
            type: "number",
            description: "1-indexed line number",
          },
          character: {
            type: "number",
            description: "1-indexed character position",
          },
        },
        required: ["path", "line", "character"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createNavSymbolsTool(): MCPTool {
    return {
      name: "nav_symbols",
      description: "List document symbols (classes, functions, etc.) for a file using LSP.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the source file",
          },
        },
        required: ["path"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  private createRenameSymbolTool(): MCPTool {
    return {
      name: "rename_sym",
      description:
        "Rename a symbol across the project using LSP. Applies a workspace edit across all references.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the source file containing the symbol",
          },
          line: {
            type: "number",
            description: "1-indexed line number",
          },
          character: {
            type: "number",
            description: "1-indexed character position",
          },
          new_name: {
            type: "string",
            description: "New name for the symbol",
          },
          apply: {
            type: "boolean",
            description: "Apply the edits to disk (default: true)",
          },
        },
        required: ["path", "line", "character", "new_name"],
      },
      annotations: {
        requiresConfirmation: true,
        readOnly: false,
        policyAction: "file.write",
      },
    };
  }

  private createDiagnosticsTool(): MCPTool {
    return {
      name: "get_diagnostics",
      description: "Get compiler errors and warnings for a file.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path to the source file",
          },
        },
        required: ["path"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
        policyAction: "file.read",
      },
    };
  }

  // --------------------------------------------------------------------------
  // LSP Handlers
  // --------------------------------------------------------------------------

  private async handleGoToDefinition(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string | undefined;
    const position = parsePosition(args.line, args.character);
    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }
    if (!position) {
      return errorResult("INVALID_ARGUMENTS", "line and character must be >= 1");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const absolutePath = path.resolve(filePath);
      const session = await this.getLspSession(absolutePath);
      await this.ensureWorkspaceWarmup(session);
      const locations = await session.client.goToDefinition(absolutePath, {
        line: position.line - 1,
        character: position.character - 1,
      });

      if (locations.length === 0) {
        return textResult("No definition found.");
      }

      return textResult(formatLocations("Definitions", locations));
    } catch (err) {
      return this.formatLspError(err);
    }
  }

  private async handleFindReferences(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string | undefined;
    const position = parsePosition(args.line, args.character);
    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }
    if (!position) {
      return errorResult("INVALID_ARGUMENTS", "line and character must be >= 1");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const absolutePath = path.resolve(filePath);
      const session = await this.getLspSession(absolutePath);
      await this.ensureWorkspaceWarmup(session);
      const locations = await session.client.findReferences(absolutePath, {
        line: position.line - 1,
        character: position.character - 1,
      });

      if (locations.length === 0) {
        return textResult("No references found.");
      }

      return textResult(formatLocations("References", locations));
    } catch (err) {
      return this.formatLspError(err);
    }
  }

  private async handleRenameSymbol(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string | undefined;
    const position = parsePosition(args.line, args.character);
    const newName = args.new_name as string | undefined;
    const apply = typeof args.apply === "boolean" ? args.apply : true;

    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }
    if (!position) {
      return errorResult("INVALID_ARGUMENTS", "line and character must be >= 1");
    }
    if (!newName) {
      return errorResult("INVALID_ARGUMENTS", "new_name is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const absolutePath = path.resolve(filePath);
      const session = await this.getLspSession(absolutePath);
      const warmup = await this.ensureWorkspaceWarmup(session);
      const edit = await session.client.renameSymbol(
        absolutePath,
        {
          line: position.line - 1,
          character: position.character - 1,
        },
        newName
      );

      if (!edit) {
        return errorResult("EXECUTION_FAILED", "Rename not available at this location");
      }

      const changes = collectWorkspaceChanges(edit);
      if (changes.length === 0) {
        return textResult("Rename completed with no edits.");
      }

      if (!apply) {
        return textResult(
          formatRenamePreview(filePath, position, newName, changes, warmup ?? undefined)
        );
      }

      const result = await applyWorkspaceEdit(edit);
      return textResult(
        formatRenameResult(filePath, position, newName, result, warmup ?? undefined)
      );
    } catch (err) {
      return this.formatLspError(err);
    }
  }

  private async handleNavSymbols(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string | undefined;
    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const absolutePath = path.resolve(filePath);
      const session = await this.getLspSession(absolutePath);
      await this.ensureWorkspaceWarmup(session);
      const symbols = await session.client.getDocumentSymbols(absolutePath);

      this.markRead(absolutePath, context);

      if (symbols.length === 0) {
        return textResult("No symbols found.");
      }

      return textResult(formatDocumentSymbols(absolutePath, symbols));
    } catch (err) {
      return this.formatLspError(err);
    }
  }

  private async handleDiagnostics(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string | undefined;
    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system access is disabled");
    }

    try {
      const absolutePath = path.resolve(filePath);
      const session = await this.getLspSession(absolutePath);
      const diagnostics = await session.client.getDiagnostics(absolutePath);

      if (diagnostics.length === 0) {
        return textResult("No diagnostics reported.");
      }

      return textResult(formatDiagnostics(absolutePath, diagnostics));
    } catch (err) {
      return this.formatLspError(err);
    }
  }

  // --------------------------------------------------------------------------
  // LSP Session Management
  // --------------------------------------------------------------------------

  private async ensureWorkspaceWarmup(session: LspSession): Promise<LspWarmupSummary | null> {
    if (session.config.id !== "typescript") {
      return null;
    }

    const key = `${session.config.id}:${session.rootPath}`;
    const existing = this.lspWarmups.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.warmupWorkspaceFiles(session);
    this.lspWarmups.set(key, promise);

    try {
      return await promise;
    } catch {
      this.lspWarmups.delete(key);
      return null;
    }
  }

  private async warmupWorkspaceFiles(session: LspSession): Promise<LspWarmupSummary | null> {
    const extensions = extractExtensions(session.config.filePatterns);
    if (extensions.length === 0) {
      return null;
    }

    let entries: fileSystem.FileEntry[];
    try {
      entries = await fileSystem.listFiles(session.rootPath, {
        includeHidden: false,
        respectGitignore: true,
      });
    } catch {
      return null;
    }

    const files = entries
      .filter((entry) => entry.type === "file")
      .filter((entry) => matchesExtension(entry.path, extensions))
      .sort((a, b) => a.path.localeCompare(b.path));

    const limitedFiles = files.slice(0, MAX_LSP_WARMUP_FILES);
    for (const entry of limitedFiles) {
      const filePath = path.isAbsolute(entry.path)
        ? entry.path
        : path.join(session.rootPath, entry.path);
      await session.client.openFile(filePath);
    }

    return {
      opened: limitedFiles.length,
      total: files.length,
      truncated: files.length > MAX_LSP_WARMUP_FILES,
    };
  }

  private async getLspSession(filePath: string): Promise<LspSession> {
    const detection = detectLanguageServerForPath(filePath);
    if (!detection) {
      throw new LspProjectNotFoundError("No supported language server detected for this path.");
    }

    const { config, rootPath } = detection;
    if (!(await isServerAvailable(config))) {
      throw new LspUnavailableError(`Language server not available: ${config.command}`);
    }

    const key = `${config.id}:${rootPath}`;
    const existing = this.lspSessions.get(key);
    if (existing) {
      return existing;
    }

    const sessionPromise = this.createLspSession(config, rootPath);
    this.lspSessions.set(key, sessionPromise);

    try {
      return await sessionPromise;
    } catch (error) {
      this.lspSessions.delete(key);
      throw error;
    }
  }

  private async createLspSession(config: ServerConfig, rootPath: string): Promise<LspSession> {
    const client = await createLSPClient({
      command: config.command,
      args: config.args,
      cwd: rootPath,
      initializationOptions: config.initializationOptions,
    });
    await client.initialize(rootPath);
    return { client, config, rootPath };
  }

  private formatLspError(err: unknown): MCPToolResult {
    if (err instanceof LspUnavailableError) {
      return errorResult("EXECUTION_FAILED", `LSP unavailable: ${err.message}`);
    }
    if (err instanceof LspProjectNotFoundError) {
      return errorResult("EXECUTION_FAILED", `Project not found: ${err.message}`);
    }
    return errorResult(
      "EXECUTION_FAILED",
      `LSP error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  async dispose(): Promise<void> {
    for (const sessionPromise of this.lspSessions.values()) {
      try {
        const session = await sessionPromise;
        await session.client.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }
    this.lspSessions.clear();
    this.lspWarmups.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatOutline(outline: OutlineResult): string {
  const lines: string[] = [`## Outline: ${outline.path}`, ""];

  function renderItem(item: OutlineItem, depth: number): void {
    const indent = "  ".repeat(depth);
    const icon = getKindIcon(item.kind);
    lines.push(`${indent}${icon} ${item.name} (L${item.range[0]}-${item.range[1]})`);
    for (const child of item.children ?? []) {
      renderItem(child, depth + 1);
    }
  }

  for (const item of outline.items) {
    renderItem(item, 0);
  }

  return lines.join("\n");
}

function getKindIcon(kind: string): string {
  const icons: Record<string, string> = {
    class: "🏛️",
    function: "⚙️",
    method: "🔧",
    property: "📦",
    variable: "📌",
    interface: "📐",
    type: "🏷️",
    enum: "📋",
    constant: "🔒",
  };
  return icons[kind] ?? "•";
}

function formatSearchResult(result: SearchResult): string {
  if (result.matches.length === 0) {
    return `No matches found for: ${result.query}`;
  }

  const lines: string[] = [
    `## Search Results for: ${result.query}`,
    `Found ${result.matchCount} match(es)`,
    "",
  ];

  for (const match of result.matches) {
    lines.push(`**${match.path}:${match.lineNumber}**`);
    lines.push(`\`\`\`${match.content}\`\`\``);
    lines.push("");
  }

  if (result.truncated) {
    lines.push("*Results truncated. Narrow your search for more specific results.*");
  }

  return lines.join("\n");
}

function parsePosition(
  line: unknown,
  character: unknown
): { line: number; character: number } | null {
  if (typeof line !== "number" || typeof character !== "number") {
    return null;
  }
  if (line < 1 || character < 1) {
    return null;
  }
  return { line, character };
}

function formatLocations(title: string, locations: Location[]): string {
  const sorted = sortLocations(locations);
  const lines: string[] = [`## ${title} (${sorted.length})`, ""];
  for (const loc of sorted) {
    const filePath = lspLocationToPath(loc);
    lines.push(`- ${filePath}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`);
  }
  return lines.join("\n");
}

function formatDocumentSymbols(filePath: string, symbols: DocumentSymbol[]): string {
  const sorted = sortDocumentSymbols(symbols);
  const total = countDocumentSymbols(sorted);
  const lines: string[] = [`## Symbols for ${filePath} (${total})`, ""];
  appendSymbolLines(lines, sorted, 0);
  return lines.join("\n");
}

function appendSymbolLines(lines: string[], symbols: DocumentSymbol[], depth: number): void {
  const indent = "  ".repeat(depth);
  for (const symbol of symbols) {
    const kind = symbolKindName(symbol.kind);
    const start = symbol.range.start;
    const end = symbol.range.end;
    lines.push(
      `${indent}- ${kind} ${symbol.name} (L${start.line + 1}:C${start.character + 1}-L${
        end.line + 1
      }:C${end.character + 1})`
    );
    if (symbol.children && symbol.children.length > 0) {
      appendSymbolLines(lines, symbol.children, depth + 1);
    }
  }
}

function countDocumentSymbols(symbols: DocumentSymbol[]): number {
  let count = 0;
  for (const symbol of symbols) {
    count += 1;
    if (symbol.children && symbol.children.length > 0) {
      count += countDocumentSymbols(symbol.children);
    }
  }
  return count;
}

function sortDocumentSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
  return symbols
    .map((symbol) => ({
      ...symbol,
      children: symbol.children ? sortDocumentSymbols(symbol.children) : undefined,
    }))
    .sort((a, b) => {
      const lineDelta = a.range.start.line - b.range.start.line;
      if (lineDelta !== 0) {
        return lineDelta;
      }
      const charDelta = a.range.start.character - b.range.start.character;
      if (charDelta !== 0) {
        return charDelta;
      }
      const nameDelta = a.name.localeCompare(b.name);
      if (nameDelta !== 0) {
        return nameDelta;
      }
      return a.kind - b.kind;
    });
}

function sortLocations(locations: Location[]): Location[] {
  return locations
    .map((loc) => ({ loc, path: lspLocationToPath(loc) }))
    .sort((a, b) => {
      const pathDelta = a.path.localeCompare(b.path);
      if (pathDelta !== 0) {
        return pathDelta;
      }
      const lineDelta = a.loc.range.start.line - b.loc.range.start.line;
      if (lineDelta !== 0) {
        return lineDelta;
      }
      return a.loc.range.start.character - b.loc.range.start.character;
    })
    .map(({ loc }) => loc);
}

function symbolKindName(kind: number): string {
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

function formatDiagnostics(filePath: string, diagnostics: Diagnostic[]): string {
  const lines: string[] = [`## Diagnostics for ${filePath}`, ""];
  for (const d of diagnostics) {
    const severity = d.severity === 1 ? "🔴" : d.severity === 2 ? "🟡" : "🔵";
    lines.push(`${severity} L${d.range.start.line + 1}: ${d.message}`);
  }
  return lines.join("\n");
}

function formatRenamePreview(
  filePath: string,
  position: { line: number; character: number },
  newName: string,
  changes: ReturnType<typeof collectWorkspaceChanges>,
  warmup?: LspWarmupSummary
): string {
  const lines: string[] = [
    `Rename preview: ${filePath}:${position.line}:${position.character} -> ${newName}`,
    `Files to update: ${changes.length}`,
    "",
  ];

  if (warmup?.truncated) {
    lines.push(
      `Note: opened ${warmup.opened}/${warmup.total} project files; rename may be incomplete.`,
      ""
    );
  }

  for (const change of changes) {
    const target = resolveWorkspaceUri(change.uri);
    lines.push(`- ${target} (${change.edits.length} edit(s))`);
  }

  return lines.join("\n");
}

function formatRenameResult(
  filePath: string,
  position: { line: number; character: number },
  newName: string,
  result: ApplyWorkspaceEditResult,
  warmup?: LspWarmupSummary
): string {
  const lines: string[] = [
    `Renamed symbol: ${filePath}:${position.line}:${position.character} -> ${newName}`,
    `Updated ${result.files.length} file(s):`,
    "",
  ];

  if (warmup?.truncated) {
    lines.push(
      `Note: opened ${warmup.opened}/${warmup.total} project files; rename may be incomplete.`,
      ""
    );
  }

  for (const file of result.files) {
    lines.push(`- ${file.file} (${file.editCount} edit(s))`);
  }

  return lines.join("\n");
}

const MAX_LSP_WARMUP_FILES = 2000;

function extractExtensions(patterns: string[]): string[] {
  const extensions = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.startsWith("*.")) {
      extensions.add(pattern.slice(1).toLowerCase());
      continue;
    }
    if (pattern.startsWith(".")) {
      extensions.add(pattern.toLowerCase());
    }
  }
  return Array.from(extensions);
}

function matchesExtension(filePath: string, extensions: string[]): boolean {
  if (extensions.length === 0) {
    return true;
  }
  return extensions.includes(path.extname(filePath).toLowerCase());
}

function resolveWorkspaceUri(uri: string): string {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }
  return path.resolve(uri);
}

// ============================================================================
// Factory
// ============================================================================

export function createCodeInteractionServer(): CodeInteractionServer {
  return new CodeInteractionServer();
}
