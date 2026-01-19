/**
 * Code Tool Server
 *
 * MCP server providing code file operations: read, edit, list.
 */

import * as path from "node:path";
import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";
import * as editor from "./editor";
import * as fileSystem from "./fileSystem";
import {
  createLSPClient,
  type Diagnostic,
  detectLanguageServerForPath,
  isServerAvailable,
  type Location,
  type LSPClient,
  lspLocationToPath,
  type ServerConfig,
} from "./lsp";
import * as patch from "./patch";

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

export class CodeToolServer extends BaseToolServer {
  readonly name = "code";
  readonly description = "Code file reading, editing, and navigation tools";

  private readonly lspSessions = new Map<string, Promise<LspSession>>();

  constructor() {
    super();
    this.registerTool(this.createReadFileTool(), this.handleReadFile.bind(this));
    this.registerTool(this.createListFilesTool(), this.handleListFiles.bind(this));
    this.registerTool(this.createEditFileTool(), this.handleEditFile.bind(this));
    this.registerTool(this.createApplyPatchTool(), this.handleApplyPatch.bind(this));
    this.registerTool(this.createGoToDefinitionTool(), this.handleGoToDefinition.bind(this));
    this.registerTool(this.createFindReferencesTool(), this.handleFindReferences.bind(this));
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
      },
    };
  }

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
      },
    };
  }

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

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

      return textResult(`## Files in ${dirPath}\n\n${formatted}`);
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
    const filePath = args.path as string | undefined;
    const edits = args.edits as
      | Array<{
          start_line: number;
          end_line: number;
          replacement: string;
        }>
      | undefined;

    if (!filePath) {
      return errorResult("INVALID_ARGUMENTS", "path is required");
    }
    if (!edits || !Array.isArray(edits) || edits.length === 0) {
      return errorResult("INVALID_ARGUMENTS", "edits array is required and must not be empty");
    }

    const filePermission = context.security?.permissions?.file;
    if (filePermission === "read" || filePermission === "none") {
      return errorResult("PERMISSION_DENIED", "File system write access is disabled");
    }

    try {
      const result = await editor.editFile(
        filePath,
        edits.map((e) => ({
          startLine: e.start_line,
          endLine: e.end_line,
          replacement: e.replacement,
        })),
        {
          dryRun: (args.dry_run as boolean | undefined) ?? false,
          validateSyntax: (args.validate_syntax as boolean | undefined) ?? true,
        }
      );

      if (!result.success) {
        const rollbackMsg = result.rolledBack ? "\n\n⚠️ Changes have been rolled back." : "";
        return errorResult(
          "EXECUTION_FAILED",
          `Edit failed: ${result.syntaxError}${rollbackMsg}\n\n**Diff (not applied):**\n\`\`\`diff\n${result.diff}\n\`\`\``
        );
      }

      const dryRunNote = args.dry_run ? " (dry run - not applied)" : "";
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
      const result = await patch.applyPatch(patchContent, args.base_path as string | undefined);
      if (!result.success) {
        return errorResult("EXECUTION_FAILED", result.error ?? "Failed to apply patch");
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
    });

    await client.initialize(rootPath);
    await client.waitForReady();

    return { client, config, rootPath };
  }

  private formatLspError(error: unknown): MCPToolResult {
    if (error instanceof LspProjectNotFoundError || error instanceof LspUnavailableError) {
      return errorResult("RESOURCE_NOT_FOUND", error.message);
    }
    if (error instanceof Error) {
      return errorResult("EXECUTION_FAILED", `LSP request failed: ${error.message}`);
    }
    return errorResult("EXECUTION_FAILED", "LSP request failed");
  }

  async dispose(): Promise<void> {
    for (const sessionPromise of this.lspSessions.values()) {
      try {
        const session = await sessionPromise;
        await session.client.shutdown();
      } catch (_error) {
        // Ignore shutdown errors to avoid blocking disposal.
      }
    }
    this.lspSessions.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function parsePosition(
  lineValue: unknown,
  characterValue: unknown
): {
  line: number;
  character: number;
} | null {
  if (typeof lineValue !== "number" || typeof characterValue !== "number") {
    return null;
  }
  if (!Number.isFinite(lineValue) || !Number.isFinite(characterValue)) {
    return null;
  }
  if (lineValue < 1 || characterValue < 1) {
    return null;
  }
  return { line: lineValue, character: characterValue };
}

function formatLocations(label: string, locations: Location[]): string {
  const lines = [`${label} (${locations.length}):`];
  for (const location of locations) {
    const filePath = lspLocationToPath(location);
    const line = location.range.start.line + 1;
    const character = location.range.start.character + 1;
    lines.push(`- ${filePath}:${line}:${character}`);
  }
  return lines.join("\n");
}

function formatDiagnostics(filePath: string, diagnostics: Diagnostic[]): string {
  const lines = [`Diagnostics (${diagnostics.length}):`];
  for (const diagnostic of diagnostics) {
    const line = diagnostic.range.start.line + 1;
    const character = diagnostic.range.start.character + 1;
    const severity = formatSeverity(diagnostic.severity);
    const code = diagnostic.code ? ` [${diagnostic.code}]` : "";
    lines.push(`- ${filePath}:${line}:${character} ${severity}${code}: ${diagnostic.message}`);
  }
  return lines.join("\n");
}

function formatSeverity(severity?: Diagnostic["severity"]): string {
  switch (severity) {
    case 1:
      return "Error";
    case 2:
      return "Warning";
    case 3:
      return "Info";
    case 4:
      return "Hint";
    default:
      return "Info";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a code tool server.
 */
export function createCodeToolServer(): CodeToolServer {
  return new CodeToolServer();
}
