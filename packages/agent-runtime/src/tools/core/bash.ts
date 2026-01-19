/**
 * Bash Tool Server
 *
 * Provides bash command execution with sandboxing, timeout,
 * and security controls. This is a core tool for agent capabilities.
 */

import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import type {
  BashExecuteOptions,
  BashExecuteResult,
  IBashExecutor,
  ToolContext,
} from "../../types";
import { BaseToolServer, errorResult, type ToolHandler, textResult } from "../mcp/baseServer";

// ============================================================================
// Bash Executor Interface (for dependency injection)
// ============================================================================

export type { BashExecuteOptions, BashExecuteResult, IBashExecutor };

// ============================================================================
// Bash Executor Implementation
// ============================================================================

/**
 * Default bash executor using child_process.
 * Can be replaced with Docker-based executor for sandboxing.
 */
export class ProcessBashExecutor implements IBashExecutor {
  private readonly defaultShell: string;

  constructor(shell = "/bin/bash") {
    this.defaultShell = shell;
  }

  async execute(command: string, options: BashExecuteOptions): Promise<BashExecuteResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024; // 1MB default

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;
      let resolved = false;

      const spawnOptions: SpawnOptions = {
        shell: this.defaultShell,
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
      };

      const child: ChildProcess = spawn(command, [], spawnOptions);

      // Handle timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!resolved) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, timeoutMs);

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          child.kill("SIGTERM");
        });
      }

      // Collect stdout
      child.stdout?.on("data", (data: Buffer) => {
        if (stdout.length + data.length > maxOutputBytes) {
          truncated = true;
          const remaining = maxOutputBytes - stdout.length;
          if (remaining > 0) {
            stdout += data.subarray(0, remaining).toString();
          }
        } else {
          stdout += data.toString();
        }
      });

      // Collect stderr
      child.stderr?.on("data", (data: Buffer) => {
        if (stderr.length + data.length > maxOutputBytes) {
          truncated = true;
          const remaining = maxOutputBytes - stderr.length;
          if (remaining > 0) {
            stderr += data.subarray(0, remaining).toString();
          }
        } else {
          stderr += data.toString();
        }
      });

      // Handle completion
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolved = true;
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
          timedOut,
          truncated,
          durationMs: Date.now() - startTime,
        });
      });

      // Handle spawn error
      child.on("error", (err) => {
        clearTimeout(timeout);
        resolved = true;
        resolve({
          exitCode: -1,
          stdout: "",
          stderr: err.message,
          timedOut: false,
          truncated: false,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }
}

// ============================================================================
// Bash Tool Server
// ============================================================================

export class BashToolServer extends BaseToolServer {
  readonly name = "bash";
  readonly description = "Execute bash commands with security controls";

  private readonly executor: IBashExecutor;

  constructor(executor?: IBashExecutor) {
    super();
    this.executor = executor ?? new ProcessBashExecutor();

    // Register the bash tool
    this.registerTool(
      {
        name: "execute",
        description:
          "Execute a bash command. Use for system operations, file management, git, and other CLI tasks.",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The bash command to execute",
            },
            cwd: {
              type: "string",
              description: "Working directory for command execution",
            },
            timeout: {
              type: "number",
              description: "Timeout in milliseconds (default: 30000)",
            },
          },
          required: ["command"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: true,
          readOnly: false,
          estimatedDuration: "medium",
        },
      },
      this.handleExecute.bind(this)
    );
  }

  private async handleExecute(
    args: Record<string, unknown>,
    context: ToolContext
  ): ReturnType<ToolHandler> {
    const command = args.command as string;
    const cwd = (args.cwd as string) ?? context.security.sandbox.workingDirectory;
    const timeout = (args.timeout as number) ?? context.security.limits.maxExecutionTimeMs;

    // Check permissions
    if (context.security.permissions.bash === "disabled") {
      return errorResult("PERMISSION_DENIED", "Bash execution is disabled");
    }

    // Check for dangerous commands (basic blocklist)
    const dangerousPatterns = [
      /rm\s+-rf\s+[/~]/i,
      /mkfs/i,
      /dd\s+if=/i,
      />\s*\/dev\//i,
      /chmod\s+777/i,
      /:(){ :|:& };:/, // Fork bomb
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return errorResult(
          "PERMISSION_DENIED",
          `Command contains potentially dangerous pattern: ${pattern.source}`
        );
      }
    }

    // Log to audit
    context.audit?.log({
      timestamp: Date.now(),
      toolName: "bash:execute",
      action: "call",
      userId: context.userId,
      input: { command, cwd },
      sandboxed: context.security.sandbox.type !== "none",
    });

    // Execute command
    const result = await this.executor.execute(command, {
      cwd,
      timeoutMs: timeout,
      maxOutputBytes: context.security.limits.maxOutputBytes,
      signal: context.signal,
    });

    // Log result
    context.audit?.log({
      timestamp: Date.now(),
      toolName: "bash:execute",
      action: result.exitCode === 0 ? "result" : "error",
      userId: context.userId,
      output: { exitCode: result.exitCode, truncated: result.truncated },
      durationMs: result.durationMs,
      sandboxed: context.security.sandbox.type !== "none",
    });

    // Format output
    if (result.timedOut) {
      return errorResult("TIMEOUT", `Command timed out after ${timeout}ms`);
    }

    const output = this.formatOutput(result);
    if (result.exitCode !== 0) {
      return {
        success: false,
        content: [{ type: "text", text: output }],
        error: {
          code: "EXECUTION_FAILED",
          message: `Command exited with code ${result.exitCode}`,
        },
      };
    }

    return textResult(output);
  }

  private formatOutput(result: BashExecuteResult): string {
    const parts: string[] = [];

    if (result.stdout) {
      parts.push(result.stdout);
    }

    if (result.stderr) {
      parts.push(`[stderr]\n${result.stderr}`);
    }

    if (result.truncated) {
      parts.push("\n[output truncated]");
    }

    if (parts.length === 0) {
      return `Command completed with exit code ${result.exitCode}`;
    }

    return parts.join("\n");
  }
}

/**
 * Create a bash tool server with default configuration.
 */
export function createBashToolServer(executor?: IBashExecutor): BashToolServer {
  return new BashToolServer(executor);
}
