import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  PreflightCheckDefinition,
  PreflightCheckResult,
  PreflightPlan,
  PreflightReport,
  PreflightSelectionRule,
} from "@ku0/agent-runtime";
import { runPreflightPlan, selectPreflightChecks } from "@ku0/agent-runtime";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 120_000;

const DEFAULT_ALLOWLIST: PreflightCheckDefinition[] = [
  {
    id: "lint",
    name: "Lint",
    kind: "lint",
    command: "pnpm",
    args: ["lint"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    description: "Run repo linting checks.",
  },
  {
    id: "typecheck",
    name: "Typecheck",
    kind: "typecheck",
    command: "pnpm",
    args: ["typecheck"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    description: "Run TypeScript type checks.",
  },
  {
    id: "test:cowork-server",
    name: "Cowork server tests",
    kind: "test",
    command: "pnpm",
    args: ["vitest", "run", "--project", "cowork-server"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    description: "Run Cowork server test suite.",
  },
  {
    id: "test:cowork-app",
    name: "Cowork app tests",
    kind: "test",
    command: "pnpm",
    args: ["vitest", "run", "--project", "cowork-app"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    description: "Run Cowork UI test suite.",
  },
  {
    id: "test:context-index",
    name: "Context index tests",
    kind: "test",
    command: "pnpm",
    args: ["vitest", "run", "--project", "context-index"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    description: "Run context index unit tests.",
  },
  {
    id: "test:packages-default",
    name: "Packages default tests",
    kind: "test",
    command: "pnpm",
    args: ["vitest", "run", "--project", "packages-default"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    description: "Run shared package test suite.",
  },
];

const DEFAULT_RULES: PreflightSelectionRule[] = [
  {
    id: "cowork-server",
    match: (path: string) => path.startsWith("apps/cowork/server/"),
    checkIds: ["test:cowork-server"],
    note: "Cowork server changes detected.",
  },
  {
    id: "cowork-app",
    match: (path: string) => path.startsWith("apps/cowork/src/"),
    checkIds: ["test:cowork-app"],
    note: "Cowork UI changes detected.",
  },
  {
    id: "context-index",
    match: (path: string) => path.startsWith("packages/context-index/"),
    checkIds: ["test:context-index"],
    note: "Context index changes detected.",
  },
  {
    id: "agent-runtime",
    match: (path: string) => path.startsWith("packages/agent-runtime/"),
    checkIds: ["test:packages-default"],
    note: "Agent runtime changes detected.",
  },
];

const BASELINE_CHECK_IDS = ["lint", "typecheck"];

export interface PreflightRunnerConfig {
  allowlist?: PreflightCheckDefinition[];
  rules?: PreflightSelectionRule[];
  baselineCheckIds?: string[];
  maxOutputBytes?: number;
}

export interface PreflightRunInput {
  sessionId: string;
  rootPath: string;
  changedFiles?: string[];
  requestedCheckIds?: string[];
}

export interface PreflightRunOutput {
  plan: PreflightPlan;
  report: PreflightReport;
}

export interface PreflightRunner {
  getAllowlist: () => PreflightCheckDefinition[];
  run: (input: PreflightRunInput) => Promise<PreflightRunOutput>;
}

export function createPreflightRunner(config: PreflightRunnerConfig = {}): PreflightRunner {
  const allowlist = config.allowlist ?? DEFAULT_ALLOWLIST;
  const rules = config.rules ?? DEFAULT_RULES;
  const baselineCheckIds = config.baselineCheckIds ?? BASELINE_CHECK_IDS;
  const maxOutputBytes = config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  const allowlistMap = new Map(allowlist.map((check) => [check.id, check]));

  return {
    getAllowlist: () => [...allowlist],
    run: async (input) => {
      const changedFiles = input.changedFiles ?? (await detectChangedFiles(input.rootPath));
      const plan = buildPlan({
        allowlist,
        allowlistMap,
        rules,
        baselineCheckIds,
        changedFiles,
        requestedCheckIds: input.requestedCheckIds,
      });
      const report = await runPreflightPlan({
        sessionId: input.sessionId,
        plan,
        runCheck: (check: PreflightCheckDefinition) =>
          runCheckCommand(check, input.rootPath, maxOutputBytes),
      });
      return { plan, report };
    },
  };
}

function buildPlan(input: {
  allowlist: PreflightCheckDefinition[];
  allowlistMap: Map<string, PreflightCheckDefinition>;
  rules: PreflightSelectionRule[];
  baselineCheckIds: string[];
  changedFiles: string[];
  requestedCheckIds?: string[];
}): PreflightPlan {
  if (input.requestedCheckIds && input.requestedCheckIds.length > 0) {
    const checks = pickChecks(input.requestedCheckIds, input.allowlistMap);
    return {
      checks,
      changedFiles: input.changedFiles,
      selectionNotes: ["Manual preflight selection applied."],
    };
  }

  const initial = selectPreflightChecks({
    allowlist: input.allowlist,
    rules: input.rules,
    changedFiles: input.changedFiles,
    defaultCheckIds: input.baselineCheckIds,
  });

  const augmented = appendBaselineChecks(initial, input.allowlistMap, input.baselineCheckIds);
  return augmented;
}

function appendBaselineChecks(
  plan: PreflightPlan,
  allowlistMap: Map<string, PreflightCheckDefinition>,
  baselineIds: string[]
): PreflightPlan {
  const selected = new Set(plan.checks.map((check: PreflightCheckDefinition) => check.id));
  const nextChecks = [...plan.checks];
  let added = 0;
  for (const id of baselineIds) {
    if (selected.has(id)) {
      continue;
    }
    const check = allowlistMap.get(id);
    if (!check) {
      continue;
    }
    nextChecks.push(check);
    selected.add(id);
    added += 1;
  }
  const nextNotes =
    added > 0 ? [...plan.selectionNotes, "Baseline preflight checks added."] : plan.selectionNotes;
  return {
    checks: nextChecks,
    changedFiles: plan.changedFiles,
    selectionNotes: nextNotes,
  };
}

function pickChecks(
  ids: string[],
  allowlistMap: Map<string, PreflightCheckDefinition>
): PreflightCheckDefinition[] {
  const checks: PreflightCheckDefinition[] = [];
  for (const id of ids) {
    const check = allowlistMap.get(id);
    if (check) {
      checks.push(check);
    }
  }
  return checks;
}

async function detectChangedFiles(rootPath: string): Promise<string[]> {
  const [unstaged, staged, untracked] = await Promise.all([
    runGit(rootPath, ["diff", "--name-only"]),
    runGit(rootPath, ["diff", "--name-only", "--cached"]),
    runGit(rootPath, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  const seen = new Set<string>();
  for (const list of [unstaged, staged, untracked]) {
    for (const entry of list) {
      if (entry) {
        seen.add(entry);
      }
    }
  }
  return Array.from(seen);
}

async function runGit(rootPath: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: rootPath });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

async function runCheckCommand(
  check: PreflightCheckDefinition,
  rootPath: string,
  maxOutputBytes: number
): Promise<PreflightCheckResult> {
  const start = Date.now();
  const timeoutMs = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputChunks: string[] = [];
  let totalBytes = 0;
  let truncated = false;
  let timeoutId: NodeJS.Timeout | undefined;

  const appendChunk = (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    const bytes = Buffer.byteLength(text, "utf-8");
    if (totalBytes + bytes > maxOutputBytes) {
      const remaining = Math.max(0, maxOutputBytes - totalBytes);
      if (remaining > 0) {
        outputChunks.push(text.slice(0, remaining));
        totalBytes += remaining;
      }
      truncated = true;
      return;
    }
    outputChunks.push(text);
    totalBytes += bytes;
  };

  return await new Promise<PreflightCheckResult>((resolve) => {
    let settled = false;
    const finalize = (result: PreflightCheckResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    const child = spawn(check.command, check.args, {
      cwd: rootPath,
      env: process.env,
      shell: false,
    });

    timeoutId = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", appendChunk);
    child.stderr?.on("data", appendChunk);

    child.on("error", (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const message = error instanceof Error ? error.message : String(error);
      finalize({
        id: check.id,
        name: check.name,
        kind: check.kind,
        command: check.command,
        args: check.args,
        status: "fail",
        durationMs: Date.now() - start,
        output: message,
      });
    });

    child.on("close", (code, signal) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const durationMs = Date.now() - start;
      if (signal) {
        outputChunks.push(`\nProcess terminated with signal ${signal}.`);
      }
      if (truncated) {
        outputChunks.push("\nOutput truncated.");
      }
      const output = outputChunks.join("");
      finalize({
        id: check.id,
        name: check.name,
        kind: check.kind,
        command: check.command,
        args: check.args,
        status: code === 0 ? "pass" : "fail",
        durationMs,
        exitCode: typeof code === "number" ? code : undefined,
        output,
      });
    });
  });
}
