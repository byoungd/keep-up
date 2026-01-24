/**
 * Bash Tool Server
 *
 * Provides bash command execution with sandboxing, timeout,
 * and security controls. This is a core tool for agent capabilities.
 */

import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import * as path from "node:path";
import type {
  BashExecuteOptions,
  BashExecuteResult,
  IBashExecutor,
  SandboxConfig,
  ToolContext,
} from "@ku0/agent-runtime-core";
import { createSandbox, type SandboxPolicy } from "@ku0/sandbox-rs";
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

/**
 * Rust-backed bash executor using sandbox-rs.
 * Executes via `bash -lc` inside the native sandbox policy.
 */
export class RustBashExecutor implements IBashExecutor {
  private readonly sandbox: SandboxPolicy;
  private readonly shell: string;

  constructor(config: SandboxConfig, shell = "/bin/bash") {
    this.shell = shell;
    this.sandbox = createSandbox(config);
  }

  async execute(command: string, options: BashExecuteOptions): Promise<BashExecuteResult> {
    const startTime = Date.now();
    if (options.signal?.aborted) {
      return {
        exitCode: -1,
        stdout: "",
        stderr: "Execution aborted before start.",
        timedOut: false,
        truncated: false,
        durationMs: 0,
      };
    }

    try {
      const result = await this.sandbox.execute(this.shell, ["-lc", command], {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
        env: options.env,
        maxOutputBytes: options.maxOutputBytes,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
        truncated: result.truncated,
        durationMs: result.durationMs ?? Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exitCode: -1,
        stdout: "",
        stderr: message,
        timedOut: false,
        truncated: false,
        durationMs: Date.now() - startTime,
      };
    }
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
          policyAction: "connector.action",
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
    const cwdInput = (args.cwd as string) ?? context.security.sandbox.workingDirectory;
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

    const shellOperator = detectShellOperator(command);
    if (shellOperator) {
      return errorResult(
        "PERMISSION_DENIED",
        `Command contains unsafe shell operator: ${shellOperator.description}`
      );
    }

    const cwdValidation = validateCwd(cwdInput, context.security.sandbox.workingDirectory);
    if (!cwdValidation.valid) {
      return errorResult("PERMISSION_DENIED", cwdValidation.reason ?? "Invalid working directory");
    }

    // Log to audit
    context.audit?.log({
      timestamp: Date.now(),
      toolName: "bash:execute",
      action: "call",
      userId: context.userId,
      input: { command, cwd: cwdValidation.resolvedPath },
      sandboxed: context.security.sandbox.type !== "none",
    });

    // Execute command
    const result = await this.executor.execute(command, {
      cwd: cwdValidation.resolvedPath,
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

type ShellOperatorMatch = {
  operator: string;
  description: string;
};

const SHELL_OPERATOR_DESCRIPTIONS: Record<string, string> = {
  ";": "command chaining (semicolon)",
  "&&": "command chaining (AND)",
  "||": "command chaining (OR)",
  "|": "pipe",
  "|&": "pipe with stderr",
  "$(": "command substitution",
  ">": "output redirection",
  ">>": "append redirection",
  "<": "input redirection",
  ">&": "file descriptor redirection",
  "<&": "file descriptor duplication",
  "`": "command substitution (backtick)",
  "\\n": "newline (command separator)",
  "\\r": "carriage return (potential command separator)",
  "U+2028": "unicode line separator",
  "U+2029": "unicode paragraph separator",
  "U+0085": "unicode next line",
};

const LINE_SEPARATOR_MATCHES: Record<string, ShellOperatorMatch> = {
  "\n": { operator: "\\n", description: "newline (command separator)" },
  "\r": { operator: "\\r", description: "carriage return (potential command separator)" },
  "\u2028": { operator: "U+2028", description: "unicode line separator" },
  "\u2029": { operator: "U+2029", description: "unicode paragraph separator" },
  "\u0085": { operator: "U+0085", description: "unicode next line" },
};

type QuoteState = {
  inSingleQuote: boolean;
  inDoubleQuote: boolean;
  escaped: boolean;
};

const SINGLE_CHAR_OPERATORS = new Set([";", "|", "&", ">", "<", "`"]);

function detectShellOperator(command: string): ShellOperatorMatch | null {
  const quoteState: QuoteState = {
    inSingleQuote: false,
    inDoubleQuote: false,
    escaped: false,
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index];

    if (updateQuoteState(char, quoteState)) {
      continue;
    }

    const lineSeparatorMatch = LINE_SEPARATOR_MATCHES[char];
    if (lineSeparatorMatch) {
      return lineSeparatorMatch;
    }

    if (!quoteState.inSingleQuote && char === "$" && command[index + 1] === "(") {
      return matchOperator("$(");
    }

    if (quoteState.inSingleQuote || quoteState.inDoubleQuote) {
      continue;
    }

    const operatorMatch = matchOperatorAt(command, index);
    if (operatorMatch) {
      return operatorMatch;
    }
  }

  return null;
}

function updateQuoteState(char: string, state: QuoteState): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }

  if (char === "\\" && !state.inSingleQuote) {
    state.escaped = true;
    return true;
  }

  if (char === '"' && !state.inSingleQuote) {
    state.inDoubleQuote = !state.inDoubleQuote;
    return true;
  }

  if (char === "'" && !state.inDoubleQuote) {
    state.inSingleQuote = !state.inSingleQuote;
    return true;
  }

  return false;
}

function matchOperatorAt(command: string, index: number): ShellOperatorMatch | null {
  const char = command[index];
  const next = command[index + 1];

  if (char === "&" && next === "&") {
    return matchOperator("&&");
  }
  if (char === "|" && next === "|") {
    return matchOperator("||");
  }
  if (char === "|" && next === "&") {
    return matchOperator("|&");
  }
  if (char === ">" && next === ">") {
    return matchOperator(">>");
  }
  if (char === ">" && next === "&") {
    return matchOperator(">&");
  }
  if (char === "<" && next === "&") {
    return matchOperator("<&");
  }

  if (SINGLE_CHAR_OPERATORS.has(char)) {
    return matchOperator(char);
  }

  return null;
}

function matchOperator(operator: string): ShellOperatorMatch {
  return {
    operator,
    description: SHELL_OPERATOR_DESCRIPTIONS[operator] ?? `shell operator (${operator})`,
  };
}

function validateCwd(
  cwd: string | undefined,
  sandboxRoot: string | undefined
): { valid: boolean; reason?: string; resolvedPath?: string } {
  if (!cwd) {
    return { valid: true, resolvedPath: sandboxRoot };
  }

  const resolved = path.resolve(cwd);
  if (!sandboxRoot) {
    return { valid: true, resolvedPath: resolved };
  }

  const resolvedRoot = path.resolve(sandboxRoot);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return {
      valid: false,
      reason: "Working directory is outside sandbox root",
    };
  }

  return { valid: true, resolvedPath: resolved };
}

/**
 * Create a bash tool server with default configuration.
 */
export function createBashToolServer(executor?: IBashExecutor): BashToolServer {
  return new BashToolServer(executor);
}
