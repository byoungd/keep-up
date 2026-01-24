import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  PreflightCheckDefinition,
  PreflightCheckResult,
  PreflightPlan,
  PreflightReport,
  PreflightSelectionRule,
} from "@ku0/agent-runtime";
import {
  createDockerBashExecutor,
  DockerSandboxManager,
  type IBashExecutor,
  ProcessBashExecutor,
  RuntimeAssetManager,
  RustBashExecutor,
  runPreflightPlan,
  selectPreflightChecks,
} from "@ku0/agent-runtime";
import { resolveStateDir } from "../storage/statePaths";

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
  bashExecutor?: IBashExecutor;
  sandboxed?: boolean;
  logger?: Pick<Console, "info" | "warn" | "error">;
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

interface BashExecutorResolution {
  executor: IBashExecutor;
  cleanup?: () => Promise<void>;
}

export function createPreflightRunner(config: PreflightRunnerConfig = {}): PreflightRunner {
  const allowlist = config.allowlist ?? DEFAULT_ALLOWLIST;
  const rules = config.rules ?? DEFAULT_RULES;
  const baselineCheckIds = config.baselineCheckIds ?? BASELINE_CHECK_IDS;
  const maxOutputBytes = config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const logger = config.logger;
  const sandboxed = config.sandboxed ?? true;
  const fallbackExecutor = config.bashExecutor ?? new ProcessBashExecutor();
  const assetManager = sandboxed ? createRuntimeAssetManager(logger) : null;

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
      let resolution: BashExecutorResolution | null = null;
      try {
        resolution = await resolveBashExecutor(input, assetManager, logger);
        const executor = resolution?.executor ?? fallbackExecutor;
        const report = await runPreflightPlan({
          sessionId: input.sessionId,
          plan,
          runCheck: (check: PreflightCheckDefinition) =>
            runCheckCommand(check, input.rootPath, maxOutputBytes, executor),
        });
        return { plan, report };
      } finally {
        if (resolution?.cleanup) {
          await resolution.cleanup();
        }
      }
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
  maxOutputBytes: number,
  executor: IBashExecutor
): Promise<PreflightCheckResult> {
  const start = Date.now();
  const timeoutMs = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const command = buildCommand(check.command, check.args ?? []);

  try {
    const result = await executor.execute(command, {
      cwd: rootPath,
      timeoutMs,
      maxOutputBytes,
    });
    const output = buildOutput(result);
    return {
      id: check.id,
      name: check.name,
      kind: check.kind,
      command: check.command,
      args: check.args,
      status: result.exitCode === 0 && !result.timedOut ? "pass" : "fail",
      durationMs: result.durationMs ?? Date.now() - start,
      exitCode: result.exitCode,
      output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: check.id,
      name: check.name,
      kind: check.kind,
      command: check.command,
      args: check.args,
      status: "fail",
      durationMs: Date.now() - start,
      output: message,
    };
  }
}

function buildCommand(command: string, args: string[]): string {
  if (args.length === 0) {
    return command;
  }
  const parts = [command, ...args].map(escapeShellArg);
  return parts.join(" ");
}

function escapeShellArg(value: string): string {
  if (value.length === 0) {
    return "''";
  }
  if (/^[a-zA-Z0-9_./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildOutput(result: {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}): string {
  const parts: string[] = [];
  if (result.stdout) {
    parts.push(result.stdout);
  }
  if (result.stderr) {
    parts.push(result.stderr);
  }
  if (result.timedOut) {
    parts.push("Command timed out.");
  }
  if (result.truncated) {
    parts.push("Output truncated.");
  }
  return parts.join(parts.length > 1 ? "\n" : "");
}

async function resolveBashExecutor(
  input: PreflightRunInput,
  assetManager: RuntimeAssetManager | null,
  logger?: Pick<Console, "info" | "warn" | "error">
): Promise<BashExecutorResolution | null> {
  if (!assetManager) {
    return null;
  }

  const sandboxMode = resolveSandboxMode();
  if (sandboxMode === "process") {
    return null;
  }

  if (sandboxMode === "rust") {
    const rustExecutor = tryResolveRustExecutor(input, logger);
    if (rustExecutor) {
      return rustExecutor;
    }
  }

  return resolveDockerExecutor(input, assetManager, logger);
}

function tryResolveRustExecutor(
  input: PreflightRunInput,
  logger?: Pick<Console, "info" | "warn" | "error">
): BashExecutorResolution | null {
  try {
    const executor = new RustBashExecutor({
      type: "rust",
      networkAccess: "full",
      fsIsolation: "workspace",
      workingDirectory: resolve(input.rootPath),
    });
    return { executor };
  } catch (error) {
    logger?.warn("Rust sandbox unavailable for preflight; falling back to docker/process.", error);
    return null;
  }
}

async function resolveDockerExecutor(
  input: PreflightRunInput,
  assetManager: RuntimeAssetManager,
  logger?: Pick<Console, "info" | "warn" | "error">
): Promise<BashExecutorResolution | null> {
  const dockerImage = process.env.COWORK_SANDBOX_IMAGE ?? DEFAULT_DOCKER_IMAGE;
  const dockerPullOnDemand = parseBooleanEnv(process.env.COWORK_DOCKER_PULL, true);
  const dockerStatus = await assetManager.inspectDockerImage(dockerImage);
  const dockerAvailable =
    dockerStatus.available && (dockerStatus.imagePresent || dockerPullOnDemand);
  if (!dockerAvailable) {
    logDockerUnavailable(dockerStatus, dockerImage, logger);
    return null;
  }

  if (!dockerStatus.imagePresent && dockerPullOnDemand) {
    const sizeHint = dockerStatus.expectedDownloadMB
      ? ` (~${dockerStatus.expectedDownloadMB}MB)`
      : "";
    logger?.info?.(`Docker image ${dockerImage} missing; will pull on demand${sizeHint}.`);
  }

  const workspacePath = resolve(input.rootPath);
  const sandboxManager = new DockerSandboxManager({
    workspacePath,
    image: dockerImage,
    assetManager,
  });
  const executor = createDockerBashExecutor(sandboxManager, {
    sessionId: input.sessionId,
    workspacePath,
  });

  return {
    executor,
    cleanup: async () => {
      await sandboxManager.closeSandbox(input.sessionId);
      await sandboxManager.dispose();
    },
  };
}

function logDockerUnavailable(
  dockerStatus: Awaited<ReturnType<RuntimeAssetManager["inspectDockerImage"]>>,
  dockerImage: string,
  logger?: Pick<Console, "info" | "warn" | "error">
): void {
  if (!dockerStatus.available) {
    logger?.warn?.(
      `Docker sandbox unavailable (${dockerStatus.reason ?? "unknown"}); using process executor.`
    );
    return;
  }
  if (!dockerStatus.imagePresent) {
    logger?.warn?.(
      `Docker image ${dockerImage} missing; set COWORK_DOCKER_PULL=true to enable on-demand pulls.`
    );
  }
}

function createRuntimeAssetManager(
  logger?: Pick<Console, "info" | "warn" | "error">
): RuntimeAssetManager {
  return new RuntimeAssetManager({
    cacheDir: resolveRuntimeAssetDir(),
    logger,
    docker: {
      pullOnDemand: parseBooleanEnv(process.env.COWORK_DOCKER_PULL, true),
      expectedDownloadMB: parseNumberEnv(process.env.COWORK_DOCKER_DOWNLOAD_MB),
    },
  });
}

const DEFAULT_DOCKER_IMAGE = "node:20-alpine";

type RequestedSandboxMode = "auto" | "docker" | "process" | "rust";

function resolveSandboxMode(): RequestedSandboxMode {
  const raw = process.env.COWORK_SANDBOX_MODE?.trim().toLowerCase();
  if (!raw) {
    return "auto";
  }
  if (raw === "docker" || raw === "process" || raw === "rust") {
    return raw;
  }
  return "auto";
}

function resolveRuntimeAssetDir(): string {
  return process.env.COWORK_RUNTIME_ASSET_DIR
    ? resolve(process.env.COWORK_RUNTIME_ASSET_DIR)
    : join(resolveStateDir(), "runtime-assets");
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseNumberEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
