/**
 * Code Tool Server
 *
 * MCP server providing code file operations: read, edit, list.
 */

import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";
import * as editor from "./editor";
import * as fileSystem from "./fileSystem";
import * as patch from "./patch";
import { type SearchResult, searchCode } from "./search";
import { getOutline, type OutlineItem, type OutlineResult } from "./skeleton";
import { createWindowViewer, type WindowViewResult } from "./window";

// ============================================================================
// Tool Server
// ============================================================================

export class CodeToolServer extends BaseToolServer {
  readonly name = "code";
  readonly description = "Code file reading, editing, and navigation tools";
  private readonly windowViewer = createWindowViewer();

  constructor() {
    super();
    this.registerTool(this.createReadFileTool(), this.handleReadFile.bind(this));
    this.registerTool(this.createListFilesTool(), this.handleListFiles.bind(this));
    this.registerTool(this.createEditFileTool(), this.handleEditFile.bind(this));
    this.registerTool(this.createApplyPatchTool(), this.handleApplyPatch.bind(this));
    this.registerTool(this.createViewOutlineTool(), this.handleViewOutline.bind(this));
    this.registerTool(this.createSearchCodeTool(), this.handleSearchCode.bind(this));
    this.registerTool(this.createScrollFileTool(), this.handleScrollFile.bind(this));
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

function formatOutline(outline: OutlineResult): string {
  const lines: string[] = [];
  lines.push(`[Outline: ${outline.path}] (${outline.totalLines} lines total)`);
  lines.push("");
  if (outline.items.length === 0) {
    lines.push("No outline items found.");
    return lines.join("\n");
  }

  for (const item of outline.items) {
    appendOutlineItem(lines, item, 0);
  }

  return lines.join("\n");
}

function appendOutlineItem(lines: string[], item: OutlineItem, depth: number): void {
  const indent = "  ".repeat(depth);
  const label =
    item.signature && (item.kind === "function" || item.kind === "method")
      ? item.signature
      : `${item.kind} ${item.name}`;
  lines.push(`${indent}${label} (lines ${item.range[0]}-${item.range[1]})`);
  if (item.children) {
    for (const child of item.children) {
      appendOutlineItem(lines, child, depth + 1);
    }
  }
}

function formatSearchResult(result: SearchResult): string {
  const lines: string[] = [];
  const truncatedNote = result.truncated ? " (truncated)" : "";
  lines.push(`Query: "${result.query}"`);
  lines.push(`Matches: ${result.matchCount}${truncatedNote}`);
  lines.push("");

  if (result.matches.length === 0) {
    lines.push("No matches found.");
    return lines.join("\n");
  }

  for (const match of result.matches) {
    lines.push(`${match.path}:${match.lineNumber}: ${match.content}`);
  }

  return lines.join("\n");
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
