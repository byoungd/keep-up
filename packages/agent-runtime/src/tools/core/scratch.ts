/**
 * Scratch Tool Server
 *
 * Provides tools for saving and retrieving intermediate results during agent execution.
 * Inspired by Manus's pattern of proactively persisting intermediate data to files.
 *
 * Directory: .agent-runtime/scratch/
 *
 * Benefits:
 * - Preserves context window space by offloading large data
 * - Enables session recovery after interruption
 * - Provides audit trail of agent reasoning
 * - Allows referencing previous results without re-computation
 *
 * Tools:
 * - scratch:save - Save intermediate result to a named file
 * - scratch:load - Load a previously saved result
 * - scratch:list - List all scratch files
 * - scratch:clear - Clear old scratch files
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DEFAULT_AGENT_RUNTIME_DIR, DEFAULT_AGENT_SCRATCH_DIR } from "../../runtimePaths";
import type { MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Types
// ============================================================================

export interface ScratchFileMetadata {
  name: string;
  type: "text" | "json" | "markdown" | "data";
  createdAt: number;
  updatedAt: number;
  size: number;
  description?: string;
}

// ============================================================================
// Scratch Tool Server
// ============================================================================

export class ScratchToolServer extends BaseToolServer {
  readonly name = "scratch";
  readonly description = "Save and retrieve intermediate results";

  private readonly baseDir = DEFAULT_AGENT_RUNTIME_DIR;
  private readonly scratchDir = "scratch";

  constructor() {
    super();
    this.registerTools();
  }

  private registerTools(): void {
    // scratch:save - Save intermediate result
    this.registerTool(
      {
        name: "save",
        description:
          `Save an intermediate result to ${DEFAULT_AGENT_SCRATCH_DIR}/ for later reference. ` +
          "Use this to preserve large data, research findings, or computation results " +
          "instead of keeping them in the context window.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Name for the scratch file (without extension). Use descriptive names like 'api-research', 'user-requirements', 'codebase-analysis'",
            },
            content: {
              type: "string",
              description: "The content to save",
            },
            type: {
              type: "string",
              enum: ["text", "json", "markdown", "data"],
              description: "Type of content (determines file extension)",
            },
            description: {
              type: "string",
              description: "Brief description of what this scratch file contains",
            },
          },
          required: ["name", "content"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleSave.bind(this)
    );

    // scratch:load - Load saved result
    this.registerTool(
      {
        name: "load",
        description: `Load a previously saved intermediate result from ${DEFAULT_AGENT_SCRATCH_DIR}/`,
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the scratch file to load",
            },
          },
          required: ["name"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
        },
      },
      this.handleLoad.bind(this)
    );

    // scratch:list - List scratch files
    this.registerTool(
      {
        name: "list",
        description: "List all saved scratch files with their metadata",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
        },
      },
      this.handleList.bind(this)
    );

    // scratch:clear - Clear old scratch files
    this.registerTool(
      {
        name: "clear",
        description: "Clear scratch files older than specified age or all files",
        inputSchema: {
          type: "object",
          properties: {
            maxAgeHours: {
              type: "number",
              description: "Delete files older than this many hours (default: 24)",
            },
            all: {
              type: "boolean",
              description: "Delete all scratch files regardless of age",
            },
          },
          required: [],
        },
        annotations: {
          category: "core",
          requiresConfirmation: true,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleClear.bind(this)
    );

    // scratch:append - Append to existing file
    this.registerTool(
      {
        name: "append",
        description: "Append content to an existing scratch file",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the scratch file to append to",
            },
            content: {
              type: "string",
              description: "Content to append",
            },
            separator: {
              type: "string",
              description: "Separator between existing and new content (default: newline)",
            },
          },
          required: ["name", "content"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleAppend.bind(this)
    );
  }

  // ============================================================================
  // Path Helpers
  // ============================================================================

  private getScratchDir(context: ToolContext): string {
    const workDir = context.security.sandbox.workingDirectory ?? process.cwd();
    return path.join(workDir, this.baseDir, this.scratchDir);
  }

  private async ensureScratchDir(context: ToolContext): Promise<void> {
    await fs.mkdir(this.getScratchDir(context), { recursive: true });
  }

  private getExtension(type?: string): string {
    switch (type) {
      case "json":
        return ".json";
      case "markdown":
        return ".md";
      case "data":
        return ".dat";
      default:
        return ".txt";
    }
  }

  private getFilePath(context: ToolContext, name: string, type?: string): string {
    const ext = this.getExtension(type);
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.getScratchDir(context), `${safeName}${ext}`);
  }

  private getMetadataPath(context: ToolContext, name: string): string {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.getScratchDir(context), `${safeName}.meta.json`);
  }

  // ============================================================================
  // Handlers
  // ============================================================================

  private async handleSave(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const name = args.name as string;
      const content = args.content as string;
      const type = (args.type as string) ?? "text";
      const description = args.description as string | undefined;

      await this.ensureScratchDir(context);

      const filePath = this.getFilePath(context, name, type);
      const metaPath = this.getMetadataPath(context, name);

      // Write content
      await fs.writeFile(filePath, content, "utf-8");

      // Write metadata
      const metadata: ScratchFileMetadata = {
        name,
        type: type as ScratchFileMetadata["type"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: Buffer.byteLength(content, "utf-8"),
        description,
      };
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");

      const sizeKb = (metadata.size / 1024).toFixed(1);
      return textResult(
        `Saved intermediate result to ${DEFAULT_AGENT_SCRATCH_DIR}/${path.basename(filePath)}\n` +
          `Size: ${sizeKb} KB\n` +
          `Reference with: scratch:load name="${name}"`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to save scratch file: ${message}`);
    }
  }

  private async handleLoad(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const name = args.name as string;
      const scratchDir = this.getScratchDir(context);

      // Try to find the file with any extension
      const files = await fs.readdir(scratchDir).catch(() => []);
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const matchingFile = files.find((f) => f.startsWith(safeName) && !f.endsWith(".meta.json"));

      if (!matchingFile) {
        return errorResult("RESOURCE_NOT_FOUND", `Scratch file not found: ${name}`);
      }

      const filePath = path.join(scratchDir, matchingFile);
      const content = await fs.readFile(filePath, "utf-8");

      // Load metadata if available
      const metaPath = this.getMetadataPath(context, name);
      let description = "";
      try {
        const metaContent = await fs.readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaContent) as ScratchFileMetadata;
        if (meta.description) {
          description = `\n[Description: ${meta.description}]\n\n`;
        }
      } catch {
        // No metadata file
      }

      return textResult(`# Scratch: ${name}${description}${content}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to load scratch file: ${message}`);
    }
  }

  private async handleList(
    _args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const scratchDir = this.getScratchDir(context);
      const files = await fs.readdir(scratchDir).catch(() => []);

      // Filter out metadata files
      const contentFiles = files.filter((f) => !f.endsWith(".meta.json"));

      if (contentFiles.length === 0) {
        return textResult("No scratch files found.");
      }

      const lines: string[] = ["# Scratch Files", ""];

      for (const file of contentFiles) {
        const name = file.replace(/\.(txt|json|md|dat)$/, "");
        const metaPath = this.getMetadataPath(context, name);

        let info = file;
        try {
          const metaContent = await fs.readFile(metaPath, "utf-8");
          const meta = JSON.parse(metaContent) as ScratchFileMetadata;
          const sizeKb = (meta.size / 1024).toFixed(1);
          const date = new Date(meta.updatedAt).toLocaleString();
          info = `${file} (${sizeKb} KB, ${date})`;
          if (meta.description) {
            info += `\n   ${meta.description}`;
          }
        } catch {
          // No metadata, just show filename
        }

        lines.push(`- ${info}`);
      }

      return textResult(lines.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to list scratch files: ${message}`);
    }
  }

  private async handleClear(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const maxAgeHours = (args.maxAgeHours as number) ?? 24;
      const clearAll = args.all as boolean;

      const scratchDir = this.getScratchDir(context);
      const files = await fs.readdir(scratchDir).catch(() => []);

      if (files.length === 0) {
        return textResult("No scratch files to clear.");
      }

      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(scratchDir, file);

        if (clearAll) {
          await fs.unlink(filePath);
          deletedCount++;
          continue;
        }

        // Check file age
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      return textResult(`Cleared ${deletedCount} scratch file(s).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to clear scratch files: ${message}`);
    }
  }

  private async handleAppend(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    try {
      const name = args.name as string;
      const content = args.content as string;
      const separator = (args.separator as string) ?? "\n\n";

      const scratchDir = this.getScratchDir(context);
      const files = await fs.readdir(scratchDir).catch(() => []);
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
      const matchingFile = files.find((f) => f.startsWith(safeName) && !f.endsWith(".meta.json"));

      if (!matchingFile) {
        return errorResult("RESOURCE_NOT_FOUND", `Scratch file not found: ${name}`);
      }

      const filePath = path.join(scratchDir, matchingFile);
      const existing = await fs.readFile(filePath, "utf-8");
      const newContent = existing + separator + content;

      await fs.writeFile(filePath, newContent, "utf-8");

      // Update metadata
      const metaPath = this.getMetadataPath(context, name);
      try {
        const metaContent = await fs.readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaContent) as ScratchFileMetadata;
        meta.updatedAt = Date.now();
        meta.size = Buffer.byteLength(newContent, "utf-8");
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
      } catch {
        // No metadata file
      }

      return textResult(`Appended to scratch file: ${name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to append to scratch file: ${message}`);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Scratch tool server.
 */
export function createScratchToolServer(): ScratchToolServer {
  return new ScratchToolServer();
}
