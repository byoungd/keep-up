/**
 * File Tool Server
 *
 * Provides file system operations with path validation,
 * permission controls, and workspace isolation.
 */

import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CoworkFileIntent } from "../../cowork/sandbox";
import { CoworkSandboxAdapter } from "../../cowork/sandbox";
import type { MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// File System Interface (for dependency injection / testing)
// ============================================================================

export interface IFileSystem {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number; mtime: Date }>;
  unlink(path: string): Promise<void>;
  realpath?(path: string): Promise<string>;
  exists(path: string): boolean;
}

/**
 * Default file system implementation using Node.js fs module.
 */
export class NodeFileSystem implements IFileSystem {
  async readFile(filePath: string, encoding: BufferEncoding): Promise<string> {
    return fs.readFile(filePath, { encoding });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, "utf-8");
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(dirPath, options);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  async stat(
    filePath: string
  ): Promise<{ isDirectory: boolean; isFile: boolean; size: number; mtime: Date }> {
    const stats = await fs.stat(filePath);
    return {
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      size: stats.size,
      mtime: stats.mtime,
    };
  }

  async unlink(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  async realpath(filePath: string): Promise<string> {
    return fs.realpath(filePath);
  }

  exists(filePath: string): boolean {
    return existsSync(filePath);
  }
}

// ============================================================================
// Path Validator
// ============================================================================

export interface PathValidatorConfig {
  /** Allowed base directories */
  allowedPaths: string[];
  /** Blocked path patterns */
  blockedPatterns: RegExp[];
  /** Allow symlink following */
  followSymlinks: boolean;
}

export class PathValidator {
  private readonly config: PathValidatorConfig;

  constructor(config: Partial<PathValidatorConfig> = {}) {
    this.config = {
      allowedPaths: config.allowedPaths ?? [],
      blockedPatterns: config.blockedPatterns ?? [
        /\.\./, // Path traversal
        /\/\.(ssh|gnupg|aws|config)/i, // Sensitive directories
        /\/(etc|proc|sys|dev)\//i, // System directories
        /node_modules/i, // Usually don't want to read these
      ],
      followSymlinks: config.followSymlinks ?? false,
    };
  }

  /**
   * Validate a path against security rules.
   */
  validate(targetPath: string): { valid: boolean; reason?: string } {
    // Normalize path
    const normalized = path.resolve(targetPath);

    // Check blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(normalized)) {
        return { valid: false, reason: `Path matches blocked pattern: ${pattern.source}` };
      }
    }

    // Check if path is within allowed directories
    if (this.config.allowedPaths.length > 0) {
      const isAllowed = this.config.allowedPaths.some((allowed) => {
        const normalizedAllowed = path.resolve(allowed);
        return normalized.startsWith(normalizedAllowed);
      });

      if (!isAllowed) {
        return { valid: false, reason: "Path is outside allowed directories" };
      }
    }

    return { valid: true };
  }
}

// ============================================================================
// File Tool Server
// ============================================================================

export class FileToolServer extends BaseToolServer {
  readonly name = "file";
  readonly description = "Read, write, and manage files within the workspace";

  private readonly fileSystem: IFileSystem;
  private readonly pathValidator: PathValidator;

  constructor(options: { fileSystem?: IFileSystem; validator?: PathValidator } = {}) {
    super();
    this.fileSystem = options.fileSystem ?? new NodeFileSystem();
    this.pathValidator = options.validator ?? new PathValidator();

    this.registerTools();
  }

  private registerTools(): void {
    // Read file
    this.registerTool(
      {
        name: "read",
        description: "Read the contents of a file",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file to read" },
            encoding: {
              type: "string",
              description: "File encoding (default: utf-8)",
              enum: ["utf-8", "ascii", "base64"],
            },
          },
          required: ["path"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
        },
      },
      this.handleRead.bind(this)
    );

    // Write file
    this.registerTool(
      {
        name: "write",
        description: "Write content to a file (creates if not exists)",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file to write" },
            content: { type: "string", description: "Content to write" },
            createDirs: {
              type: "boolean",
              description: "Create parent directories if they do not exist",
            },
          },
          required: ["path", "content"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: true,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleWrite.bind(this)
    );

    // List directory
    this.registerTool(
      {
        name: "list",
        description: "List files and directories in a path",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to list" },
          },
          required: ["path"],
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

    // File info
    this.registerTool(
      {
        name: "info",
        description: "Get information about a file or directory",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to get info for" },
          },
          required: ["path"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
        },
      },
      this.handleInfo.bind(this)
    );

    // Delete file
    this.registerTool(
      {
        name: "delete",
        description: "Delete a file",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file to delete" },
          },
          required: ["path"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: true,
          readOnly: false,
          estimatedDuration: "fast",
        },
      },
      this.handleDelete.bind(this)
    );
  }

  private async handleRead(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string;
    const encoding = (args.encoding as BufferEncoding) ?? "utf-8";

    // Check permissions
    if (context.security.permissions.file === "none") {
      return errorResult("PERMISSION_DENIED", "File access is disabled");
    }

    // Validate path
    const validation = await this.validatePath(filePath, context, "read");
    if (!validation.valid) {
      return errorResult("PERMISSION_DENIED", validation.reason ?? "Path validation failed");
    }

    try {
      const content = await this.fileSystem.readFile(filePath, encoding);

      // Check output size limit
      if (content.length > context.security.limits.maxOutputBytes) {
        const truncated = content.slice(0, context.security.limits.maxOutputBytes);
        return textResult(
          `${truncated}\n\n[Content truncated at ${context.security.limits.maxOutputBytes} bytes]`
        );
      }

      return textResult(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ENOENT")) {
        return errorResult("RESOURCE_NOT_FOUND", `File not found: ${filePath}`);
      }
      return errorResult("EXECUTION_FAILED", `Failed to read file: ${message}`);
    }
  }

  private async handleWrite(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string;
    const content = args.content as string;
    const createDirs = (args.createDirs as boolean) ?? false;

    // Check permissions
    if (
      context.security.permissions.file === "none" ||
      context.security.permissions.file === "read"
    ) {
      return errorResult("PERMISSION_DENIED", "File write access is disabled");
    }

    // Validate path
    const validation = await this.validatePath(filePath, context, "write");
    if (!validation.valid) {
      return errorResult("PERMISSION_DENIED", validation.reason ?? "Path validation failed");
    }

    try {
      // Create parent directories if requested
      if (createDirs) {
        const dir = path.dirname(filePath);
        await this.fileSystem.mkdir(dir, { recursive: true });
      }

      await this.fileSystem.writeFile(filePath, content);

      // Audit log
      context.audit?.log({
        timestamp: Date.now(),
        toolName: "file:write",
        action: "result",
        userId: context.userId,
        input: { path: filePath, contentLength: content.length },
        sandboxed: context.security.sandbox.type !== "none",
      });

      return textResult(`Successfully wrote ${content.length} bytes to ${filePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to write file: ${message}`);
    }
  }

  private async handleList(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const dirPath = args.path as string;

    if (context.security.permissions.file === "none") {
      return errorResult("PERMISSION_DENIED", "File access is disabled");
    }

    const validation = await this.validatePath(dirPath, context, "read");
    if (!validation.valid) {
      return errorResult("PERMISSION_DENIED", validation.reason ?? "Path validation failed");
    }

    try {
      const entries = await this.fileSystem.readdir(dirPath);
      const detailed: string[] = [];

      for (const entry of entries) {
        try {
          const fullPath = path.join(dirPath, entry);
          const stats = await this.fileSystem.stat(fullPath);
          const type = stats.isDirectory ? "[DIR]" : "[FILE]";
          const size = stats.isFile ? ` (${this.formatSize(stats.size)})` : "";
          detailed.push(`${type} ${entry}${size}`);
        } catch {
          detailed.push(`[?] ${entry}`);
        }
      }

      return textResult(detailed.join("\n") || "(empty directory)");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to list directory: ${message}`);
    }
  }

  private async handleInfo(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const targetPath = args.path as string;

    if (context.security.permissions.file === "none") {
      return errorResult("PERMISSION_DENIED", "File access is disabled");
    }

    const validation = await this.validatePath(targetPath, context, "read");
    if (!validation.valid) {
      return errorResult("PERMISSION_DENIED", validation.reason ?? "Path validation failed");
    }

    try {
      const stats = await this.fileSystem.stat(targetPath);
      const info = [
        `Path: ${targetPath}`,
        `Type: ${stats.isDirectory ? "Directory" : "File"}`,
        `Size: ${this.formatSize(stats.size)}`,
        `Modified: ${stats.mtime.toISOString()}`,
      ];
      return textResult(info.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ENOENT")) {
        return textResult(`Path does not exist: ${targetPath}`);
      }
      return errorResult("EXECUTION_FAILED", `Failed to get info: ${message}`);
    }
  }

  private async handleDelete(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const filePath = args.path as string;

    if (
      context.security.permissions.file !== "workspace" &&
      context.security.permissions.file !== "home" &&
      context.security.permissions.file !== "full"
    ) {
      return errorResult("PERMISSION_DENIED", "File delete access is disabled");
    }

    const validation = await this.validatePath(filePath, context, "delete");
    if (!validation.valid) {
      return errorResult("PERMISSION_DENIED", validation.reason ?? "Path validation failed");
    }

    try {
      await this.fileSystem.unlink(filePath);

      context.audit?.log({
        timestamp: Date.now(),
        toolName: "file:delete",
        action: "result",
        userId: context.userId,
        input: { path: filePath },
        sandboxed: context.security.sandbox.type !== "none",
      });

      return textResult(`Deleted: ${filePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult("EXECUTION_FAILED", `Failed to delete file: ${message}`);
    }
  }

  private async validatePath(
    targetPath: string,
    context: ToolContext,
    intent: CoworkFileIntent
  ): Promise<{ valid: boolean; reason?: string }> {
    if (context.cowork?.policyEngine && context.cowork.session) {
      const adapter = new CoworkSandboxAdapter(context.cowork.policyEngine);
      const resolvedPath = await this.resolveCoworkPath(targetPath, intent);
      const decision = adapter.evaluateFileAction({
        session: context.cowork.session,
        path: resolvedPath ?? targetPath,
        intent,
        caseInsensitivePaths: context.cowork.caseInsensitivePaths,
      });

      if (decision.decision === "deny") {
        return { valid: false, reason: decision.reason };
      }

      return { valid: true };
    }

    // Build allowed paths based on permission level
    const allowedPaths: string[] = [];

    switch (context.security.permissions.file) {
      case "workspace":
        if (context.security.sandbox.workingDirectory) {
          allowedPaths.push(context.security.sandbox.workingDirectory);
        }
        break;
      case "home":
        if (process.env.HOME) {
          allowedPaths.push(process.env.HOME);
        }
        break;
      case "full":
        // No restrictions
        break;
      default:
        return { valid: false, reason: "File access not permitted" };
    }

    // Create validator with context-specific allowed paths
    const validator = new PathValidator({
      allowedPaths: allowedPaths.length > 0 ? allowedPaths : undefined,
    });

    return validator.validate(targetPath);
  }

  private async resolveCoworkPath(
    targetPath: string,
    intent: CoworkFileIntent
  ): Promise<string | null> {
    try {
      if (this.fileSystem.exists(targetPath)) {
        return await this.resolveRealPath(targetPath);
      }
    } catch {
      return null;
    }

    if (intent === "write") {
      const parent = path.dirname(targetPath);
      try {
        const realParent = await this.resolveRealPath(parent);
        return path.join(realParent, path.basename(targetPath));
      } catch {
        return null;
      }
    }

    return null;
  }

  private async resolveRealPath(targetPath: string): Promise<string> {
    if (this.fileSystem.realpath) {
      return this.fileSystem.realpath(targetPath);
    }

    return path.resolve(targetPath);
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

/**
 * Create a file tool server with default configuration.
 */
export function createFileToolServer(options?: {
  fileSystem?: IFileSystem;
  validator?: PathValidator;
}): FileToolServer {
  return new FileToolServer(options);
}
