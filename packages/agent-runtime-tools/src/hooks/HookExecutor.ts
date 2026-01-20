import { spawn } from "node:child_process";
import type { HookConfig, HookInput, HookResult, HookType } from "./HookConfig";

export class HookExecutor {
  private hooks: HookConfig[] = [];

  register(config: HookConfig): void {
    this.hooks.push(config);
  }

  async execute(type: HookType, input: HookInput, toolName: string): Promise<HookResult> {
    const matchingHooks = this.hooks.filter(
      (hook) => hook.type === type && this.matchesPattern(toolName, hook.toolPatterns)
    );

    if (matchingHooks.length === 0) {
      return {};
    }

    let combinedResult: HookResult = {};

    for (const hook of matchingHooks) {
      const result = await this.executeHook(hook, input);
      combinedResult = mergeResults(combinedResult, result);

      if (result.cancel) {
        break;
      }
    }

    return combinedResult;
  }

  private matchesPattern(toolName: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      if (pattern === "*") {
        return true;
      }
      if (pattern.endsWith("*")) {
        return toolName.startsWith(pattern.slice(0, -1));
      }
      return toolName === pattern;
    });
  }

  private async executeHook(hook: HookConfig, input: HookInput): Promise<HookResult> {
    const payload = JSON.stringify(input);
    const result = await execWithTimeout(hook.command, payload, hook.timeoutMs);

    if (result.timedOut) {
      return { errorMessage: `Hook ${hook.name} timed out after ${hook.timeoutMs}ms` };
    }

    if (result.exitCode !== 0 && result.stderr) {
      return { errorMessage: result.stderr.trim() };
    }

    const stdout = result.stdout.trim();
    if (!stdout) {
      return {};
    }

    try {
      return JSON.parse(stdout) as HookResult;
    } catch {
      return { contextModification: stdout };
    }
  }
}

function mergeResults(existing: HookResult, next: HookResult): HookResult {
  const contextModification = [existing.contextModification, next.contextModification]
    .filter(Boolean)
    .join("\n");

  return {
    ...existing,
    ...next,
    contextModification: contextModification || undefined,
  };
}

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

function execWithTimeout(command: string, input: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
