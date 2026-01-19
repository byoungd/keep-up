/**
 * Code Interpreter Tool Server
 *
 * Provides code execution capabilities for multiple languages
 * with sandboxing, timeout controls, and output capture.
 */

import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";
import { type IBashExecutor, ProcessBashExecutor } from "./bash";

// ============================================================================
// Code Executor Interface
// ============================================================================

export interface ICodeExecutor {
  /** Supported languages */
  readonly supportedLanguages: string[];

  /** Execute code in a specific language */
  execute(language: string, code: string, options: CodeExecuteOptions): Promise<CodeExecuteResult>;
}

export interface CodeExecuteOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Abort signal */
  signal?: AbortSignal;
  /** Max output size */
  maxOutputBytes?: number;
}

export interface CodeExecuteResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}

// ============================================================================
// Language Runtime Configurations
// ============================================================================

interface LanguageConfig {
  /** File extension */
  extension: string;
  /** Command to run the file */
  runCommand: (filePath: string) => string;
  /** Optional: Command to check if runtime is available */
  checkCommand?: string;
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  python: {
    extension: ".py",
    runCommand: (f) => `python3 "${f}"`,
    checkCommand: "python3 --version",
  },
  javascript: {
    extension: ".js",
    runCommand: (f) => `node "${f}"`,
    checkCommand: "node --version",
  },
  typescript: {
    extension: ".ts",
    runCommand: (f) => `npx tsx "${f}"`,
    checkCommand: "npx tsx --version",
  },
  ruby: {
    extension: ".rb",
    runCommand: (f) => `ruby "${f}"`,
    checkCommand: "ruby --version",
  },
  go: {
    extension: ".go",
    runCommand: (f) => `go run "${f}"`,
    checkCommand: "go version",
  },
  rust: {
    extension: ".rs",
    // For Rust, we compile and run
    runCommand: (f) => {
      const out = f.replace(".rs", "");
      return `rustc "${f}" -o "${out}" && "${out}"`;
    },
    checkCommand: "rustc --version",
  },
  bash: {
    extension: ".sh",
    runCommand: (f) => `bash "${f}"`,
    checkCommand: "bash --version",
  },
  sh: {
    extension: ".sh",
    runCommand: (f) => `sh "${f}"`,
  },
};

// ============================================================================
// Process-based Code Executor
// ============================================================================

/**
 * Executes code by writing to a temp file and running via shell.
 * For production, consider Docker-based isolation.
 */
export class ProcessCodeExecutor implements ICodeExecutor {
  private readonly bashExecutor: IBashExecutor;
  private readonly tempDir: string;

  constructor(options: { bashExecutor?: IBashExecutor; tempDir?: string } = {}) {
    this.bashExecutor = options.bashExecutor ?? new ProcessBashExecutor();
    this.tempDir = options.tempDir ?? "/tmp/code-executor";
  }

  get supportedLanguages(): string[] {
    return Object.keys(LANGUAGE_CONFIGS);
  }

  async execute(
    language: string,
    code: string,
    options: CodeExecuteOptions
  ): Promise<CodeExecuteResult> {
    const config = LANGUAGE_CONFIGS[language.toLowerCase()];
    if (!config) {
      return {
        success: false,
        stdout: "",
        stderr: `Unsupported language: ${language}. Supported: ${this.supportedLanguages.join(", ")}`,
        exitCode: 1,
        timedOut: false,
        durationMs: 0,
      };
    }

    // Create temp file
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const filename = `code_${timestamp}_${random}${config.extension}`;
    const filePath = `${this.tempDir}/${filename}`;

    try {
      // Ensure temp directory exists and write code file
      const setupCommand = `mkdir -p "${this.tempDir}" && cat > "${filePath}" << 'CODEEOF'
${code}
CODEEOF`;

      const setupResult = await this.bashExecutor.execute(setupCommand, {
        timeoutMs: 5000,
      });

      if (setupResult.exitCode !== 0) {
        return {
          success: false,
          stdout: "",
          stderr: `Failed to write code file: ${setupResult.stderr}`,
          exitCode: setupResult.exitCode,
          timedOut: false,
          durationMs: setupResult.durationMs,
        };
      }

      // Execute the code
      const runCommand = config.runCommand(filePath);
      const result = await this.bashExecutor.execute(runCommand, {
        timeoutMs: options.timeoutMs ?? 30_000,
        cwd: options.cwd,
        env: options.env,
        maxOutputBytes: options.maxOutputBytes,
        signal: options.signal,
      });

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
      };
    } finally {
      // Cleanup temp file
      await this.bashExecutor.execute(`rm -f "${filePath}"`, { timeoutMs: 5000 }).catch(() => {
        // Ignore cleanup errors
      });
    }
  }
}

// ============================================================================
// Code Tool Server
// ============================================================================

export class CodeToolServer extends BaseToolServer {
  readonly name = "code";
  readonly description = "Execute code in various programming languages";

  private readonly executor: ICodeExecutor;

  constructor(executor?: ICodeExecutor) {
    super();
    this.executor = executor ?? new ProcessCodeExecutor();

    this.registerTools();
  }

  private registerTools(): void {
    // Execute code
    this.registerTool(
      {
        name: "run",
        description: `Execute code in a supported language. Supported: ${this.executor.supportedLanguages.join(", ")}`,
        inputSchema: {
          type: "object",
          properties: {
            language: {
              type: "string",
              description: "Programming language (python, javascript, typescript, etc.)",
            },
            code: {
              type: "string",
              description: "Code to execute",
            },
            timeout: {
              type: "number",
              description: "Timeout in milliseconds (default: 30000)",
            },
            cwd: {
              type: "string",
              description: "Working directory for code execution",
            },
          },
          required: ["language", "code"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: true,
          readOnly: false,
          estimatedDuration: "medium",
        },
      },
      this.handleRun.bind(this)
    );

    // List supported languages
    this.registerTool(
      {
        name: "languages",
        description: "List supported programming languages",
        inputSchema: {
          type: "object",
          properties: {},
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
        },
      },
      this.handleLanguages.bind(this)
    );
  }

  private async handleRun(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const language = args.language as string;
    const code = args.code as string;
    const timeout = (args.timeout as number) ?? context.security.limits.maxExecutionTimeMs;
    const cwd = typeof args.cwd === "string" ? args.cwd : undefined;

    // Check permissions
    if (context.security.permissions.code === "disabled") {
      return errorResult("PERMISSION_DENIED", "Code execution is disabled");
    }

    // Validate language
    if (!this.executor.supportedLanguages.includes(language.toLowerCase())) {
      return errorResult(
        "INVALID_ARGUMENTS",
        `Unsupported language: ${language}. Supported: ${this.executor.supportedLanguages.join(", ")}`
      );
    }

    // Audit log
    context.audit?.log({
      timestamp: Date.now(),
      toolName: "code:run",
      action: "call",
      userId: context.userId,
      input: { language, codeLength: code.length },
      sandboxed: context.security.sandbox.type !== "none",
    });

    // Execute
    const result = await this.executor.execute(language, code, {
      timeoutMs: timeout,
      maxOutputBytes: context.security.limits.maxOutputBytes,
      signal: context.signal,
      cwd,
    });

    // Audit result
    context.audit?.log({
      timestamp: Date.now(),
      toolName: "code:run",
      action: result.success ? "result" : "error",
      userId: context.userId,
      output: { exitCode: result.exitCode, timedOut: result.timedOut },
      durationMs: result.durationMs,
      sandboxed: context.security.sandbox.type !== "none",
    });

    // Format output
    if (result.timedOut) {
      return errorResult("TIMEOUT", `Code execution timed out after ${timeout}ms`);
    }

    const output = this.formatOutput(result);

    if (!result.success) {
      return {
        success: false,
        content: [{ type: "text", text: output }],
        error: {
          code: "EXECUTION_FAILED",
          message: `Code exited with code ${result.exitCode}`,
        },
      };
    }

    return textResult(output);
  }

  private async handleLanguages(
    _args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const languages = this.executor.supportedLanguages;
    const info = languages.map((lang) => {
      const config = LANGUAGE_CONFIGS[lang];
      return `- ${lang} (${config?.extension ?? "unknown"})`;
    });
    return textResult(`Supported languages:\n${info.join("\n")}`);
  }

  private formatOutput(result: CodeExecuteResult): string {
    const parts: string[] = [];

    if (result.stdout) {
      parts.push(result.stdout);
    }

    if (result.stderr) {
      parts.push(`[stderr]\n${result.stderr}`);
    }

    if (parts.length === 0) {
      return `Code executed successfully (exit code: ${result.exitCode})`;
    }

    return parts.join("\n");
  }
}

/**
 * Create a code tool server with default configuration.
 */
export function createCodeToolServer(executor?: ICodeExecutor): CodeToolServer {
  return new CodeToolServer(executor);
}
