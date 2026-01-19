import { execFile } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { createSanitizedEnv } from "./sanitizedEnv";

const execFileAsync = promisify(execFile);

const DEFAULT_IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".next"]);

export interface ShadowGitOptions {
  allowNestedGit?: boolean;
  ignoredDirs?: Set<string>;
  maxScanDepth?: number;
}

export class ShadowCheckpointService {
  private readonly taskId: string;
  private readonly checkpointsDir: string;
  private readonly workspaceDir: string;
  private readonly options: ShadowGitOptions;

  constructor(
    taskId: string,
    checkpointsDir: string,
    workspaceDir: string,
    options: ShadowGitOptions = {}
  ) {
    this.taskId = taskId;
    this.checkpointsDir = resolve(checkpointsDir);
    this.workspaceDir = resolve(workspaceDir);
    this.options = options;
  }

  async initShadowGit(): Promise<void> {
    await mkdir(this.checkpointsDir, { recursive: true });

    const gitDir = join(this.checkpointsDir, ".git");
    const exists = await stat(gitDir).then(
      () => true,
      () => false
    );

    if (!exists) {
      await this.runGit(["init"], this.checkpointsDir);
      await this.runGit(["config", "core.worktree", this.workspaceDir], this.checkpointsDir);
      await this.runGit(["config", "commit.gpgsign", "false"], this.checkpointsDir);
    }

    if (!this.options.allowNestedGit) {
      await this.checkNestedGitRepos();
    }

    await this.runGit(
      ["commit", "--allow-empty", "-m", "initial commit"],
      this.checkpointsDir,
      true
    );
  }

  async saveCheckpoint(message: string, options: { allowEmpty?: boolean } = {}): Promise<void> {
    await this.runGit(["add", "-A"], this.checkpointsDir);

    const args = ["commit", "-m", message];
    if (options.allowEmpty) {
      args.push("--allow-empty");
    }

    await this.runGit(args, this.checkpointsDir, true);
  }

  private async checkNestedGitRepos(): Promise<void> {
    const ignoredDirs = this.options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
    const maxDepth = this.options.maxScanDepth ?? 3;
    const nested = await findNestedGitRepo(this.workspaceDir, ignoredDirs, maxDepth);
    if (nested) {
      throw new Error(`Nested git repository detected at ${nested}`);
    }
  }

  private async runGit(args: string[], cwd: string, allowFailure: boolean = false): Promise<void> {
    const env = createSanitizedEnv(process.env, {
      overrides: {
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    try {
      await execFileAsync("git", args, {
        cwd,
        env,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      if (allowFailure) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Shadow git error (${this.taskId}): ${message}`);
    }
  }
}

async function findNestedGitRepo(
  root: string,
  ignoredDirs: Set<string>,
  maxDepth: number
): Promise<string | undefined> {
  const queue: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.depth > maxDepth) {
      continue;
    }

    const entries = await readdir(current.path, { withFileTypes: true });
    const nested = await scanEntries(entries, current, ignoredDirs, queue);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

async function scanEntries(
  entries: Awaited<ReturnType<typeof readdir>>,
  current: { path: string; depth: number },
  ignoredDirs: Set<string>,
  queue: Array<{ path: string; depth: number }>
): Promise<string | undefined> {
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const candidate = join(current.path, entry.name);
    if (await hasGitDir(candidate)) {
      return candidate;
    }

    queue.push({ path: candidate, depth: current.depth + 1 });
  }

  return undefined;
}

async function hasGitDir(candidate: string): Promise<boolean> {
  const gitPath = join(candidate, ".git");
  return stat(gitPath).then(
    () => true,
    () => false
  );
}
