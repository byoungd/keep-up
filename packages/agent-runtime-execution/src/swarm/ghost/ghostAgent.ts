/**
 * Ghost Agent
 *
 * Proactive background agent that monitors file changes and triggers
 * background checks. Provides toast suggestions for detected issues.
 *
 * Now uses chokidar for production-ready file watching.
 */

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import chokidar, { type FSWatcher } from "chokidar";

import type {
  FileChangeEvent,
  GhostAgentConfig,
  GhostCheckResult,
  GhostCheckType,
  GhostEvent,
  GhostEventHandler,
  GhostIssue,
  IGhostAgent,
  ToastSuggestion,
} from "./types";

const DEFAULT_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_CHECK_OUTPUT_CHARS = 4000;

const DEFAULT_CONFIG: GhostAgentConfig = {
  enableWatcher: true,
  watchPatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  ignorePatterns: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
  debounceMs: 1000,
  enabledChecks: ["typecheck", "lint"],
  checkCommands: {},
  checkTimeoutMs: DEFAULT_CHECK_TIMEOUT_MS,
  showToasts: true,
};

type CommandResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: Error;
};

function trimOutput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_CHECK_OUTPUT_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_CHECK_OUTPUT_CHARS)}...`;
}

async function runCommand(command: string, cwd: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let error: Error | undefined;
    let resolved = false;

    const finalize = (result: CommandResult) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      error = err;
      clearTimeout(timer);
      finalize({ exitCode: null, signal: null, stdout, stderr, timedOut, error });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finalize({
        exitCode: code,
        signal: signal ?? null,
        stdout,
        stderr,
        timedOut,
        error,
      });
    });
  });
}

/**
 * Ghost Agent implementation with chokidar file watching
 */
export class GhostAgent extends EventEmitter implements IGhostAgent {
  private readonly config: GhostAgentConfig;
  private readonly recentResults: GhostCheckResult[] = [];
  private readonly activeToasts = new Map<string, ToastSuggestion>();
  private pendingChanges: FileChangeEvent[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private watcher: FSWatcher | null = null;
  private isRunning = false;

  constructor(
    readonly workspacePath: string,
    config?: Partial<GhostAgentConfig>
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start watching for file changes using chokidar
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (!this.config.enableWatcher) {
      return;
    }

    // Initialize chokidar watcher
    this.watcher = chokidar.watch(this.config.watchPatterns, {
      cwd: this.workspacePath,
      ignored: this.config.ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });

    // Set up event handlers
    this.watcher
      .on("change", (path) => this.handleFileChange(path, "modify"))
      .on("add", (path) => this.handleFileChange(path, "create"))
      .on("unlink", (path) => this.handleFileChange(path, "delete"));

    // Wait for initial scan to complete
    await new Promise<void>((resolve) => {
      this.watcher?.on("ready", resolve);
    });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges = [];
  }

  /**
   * Handle a file change event
   */
  handleFileChange(path: string, type: FileChangeEvent["type"]): void {
    const event: FileChangeEvent = {
      path,
      type,
      timestamp: new Date(),
    };

    this.pendingChanges.push(event);
    this.emitEvent("file:changed", event);

    // Debounce check triggering
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processChanges();
    }, this.config.debounceMs);
  }

  /**
   * Process pending changes and trigger checks
   */
  private async processChanges(): Promise<void> {
    if (this.pendingChanges.length === 0) {
      return;
    }

    const changes = [...this.pendingChanges];
    this.pendingChanges = [];

    // Determine which checks to run based on changed files
    const checksToRun = this.determineChecks(changes);

    for (const checkType of checksToRun) {
      await this.triggerCheck(checkType);
    }
  }

  /**
   * Determine which checks to run based on file changes
   */
  private determineChecks(changes: FileChangeEvent[]): GhostCheckType[] {
    const checks = new Set<GhostCheckType>();
    const extensions = changes.map((c) => c.path.split(".").pop()?.toLowerCase());

    // TypeScript/JavaScript files trigger typecheck and lint
    if (extensions.some((ext) => ["ts", "tsx", "js", "jsx"].includes(ext ?? ""))) {
      if (this.config.enabledChecks.includes("typecheck")) {
        checks.add("typecheck");
      }
      if (this.config.enabledChecks.includes("lint")) {
        checks.add("lint");
      }
    }

    // Test files trigger test check
    if (changes.some((c) => c.path.includes(".test.") || c.path.includes(".spec."))) {
      if (this.config.enabledChecks.includes("test")) {
        checks.add("test");
      }
    }

    return Array.from(checks);
  }

  /**
   * Trigger a specific check
   */
  async triggerCheck(type: GhostCheckType): Promise<GhostCheckResult> {
    this.emitEvent("check:started", { type });

    const startTime = Date.now();
    const command = this.config.checkCommands?.[type];
    const timestamp = new Date();
    let result: GhostCheckResult;

    if (!command) {
      result = {
        type,
        passed: true,
        issueCount: 0,
        summary: `${type} check skipped (no command configured)`,
        executionTime: Date.now() - startTime,
        timestamp,
      };
    } else {
      const timeoutMs = this.config.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
      const commandResult = await runCommand(command, this.workspacePath, timeoutMs);
      const output = trimOutput(
        [commandResult.stdout, commandResult.stderr, commandResult.error?.message]
          .filter(Boolean)
          .join("\n")
      );

      if (commandResult.timedOut) {
        const summary = `${type} check timed out after ${timeoutMs}ms`;
        const issues: GhostIssue[] = [
          {
            severity: "error",
            message: output || summary,
          },
        ];
        result = {
          type,
          passed: false,
          issueCount: issues.length,
          summary,
          issues,
          executionTime: Date.now() - startTime,
          timestamp,
        };
      } else if (commandResult.exitCode === 0 && !commandResult.error) {
        result = {
          type,
          passed: true,
          issueCount: 0,
          summary: `${type} check passed`,
          executionTime: Date.now() - startTime,
          timestamp,
        };
      } else {
        const summary = `${type} check failed (exit code ${commandResult.exitCode ?? "unknown"})`;
        const issues: GhostIssue[] = [
          {
            severity: "error",
            message: output || summary,
          },
        ];
        result = {
          type,
          passed: false,
          issueCount: issues.length,
          summary,
          issues,
          executionTime: Date.now() - startTime,
          timestamp,
        };
      }
    }

    this.recentResults.unshift(result);
    if (this.recentResults.length > 50) {
      this.recentResults.pop();
    }

    this.emitEvent("check:completed", result);

    // Show toast for failures
    if (!result.passed && this.config.showToasts) {
      this.showToast(result);
    }

    return result;
  }

  /**
   * Show a toast suggestion based on check result
   */
  private showToast(result: GhostCheckResult): void {
    const toast: ToastSuggestion = {
      id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: result.issueCount > 0 ? "warning" : "error",
      title: `${result.type} issues detected`,
      message: result.summary,
      actions: [
        { id: "fix", label: "Fix Now", action: "fix" },
        { id: "details", label: "View Details", action: "details" },
        { id: "ignore", label: "Ignore", action: "ignore" },
      ],
      autoDismissMs: 0,
      timestamp: new Date(),
      sourceCheck: result.type,
    };

    this.activeToasts.set(toast.id, toast);
    this.emitEvent("toast:show", toast);
  }

  /**
   * Dismiss a toast
   */
  dismissToast(toastId: string): void {
    const toast = this.activeToasts.get(toastId);
    if (toast) {
      this.activeToasts.delete(toastId);
      this.emitEvent("toast:dismissed", toast);
    }
  }

  /**
   * Get recent check results
   */
  getRecentResults(): GhostCheckResult[] {
    return [...this.recentResults];
  }

  /**
   * Get active toasts
   */
  getActiveToasts(): ToastSuggestion[] {
    return Array.from(this.activeToasts.values());
  }

  /**
   * Subscribe to ghost events
   */
  onEvent(handler: GhostEventHandler): () => void {
    const wrappedHandler = (event: GhostEvent) => handler(event);
    this.on("ghostEvent", wrappedHandler);
    return () => this.off("ghostEvent", wrappedHandler);
  }

  /**
   * Emit a ghost event
   */
  private emitEvent(type: GhostEvent["type"], data?: GhostEvent["data"]): void {
    const event: GhostEvent = {
      type,
      timestamp: new Date(),
      data,
    };
    this.emit("ghostEvent", event);
  }
}

/**
 * Create a Ghost Agent instance
 */
export function createGhostAgent(
  workspacePath: string,
  config?: Partial<GhostAgentConfig>
): GhostAgent {
  return new GhostAgent(workspacePath, config);
}
