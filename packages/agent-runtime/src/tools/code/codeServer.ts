/**
 * Code Tool Server
 *
 * MCP server providing code file operations: read, edit, list.
 */

import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";
import * as editor from "./editor";
import * as fileSystem from "./fileSystem";

// ============================================================================
// Tool Server
// ============================================================================

export class CodeToolServer extends BaseToolServer {
  readonly name = "code";
  readonly description = "Code file reading, editing, and navigation tools";

  constructor() {
    super();
    this.registerTool(this.createReadFileTool(), this.handleReadFile.bind(this));
    this.registerTool(this.createListFilesTool(), this.handleListFiles.bind(this));
    this.registerTool(this.createEditFileTool(), this.handleEditFile.bind(this));
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
    if (filePermission === "read") {
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
}

// ============================================================================
// Helper Functions
// ============================================================================

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
