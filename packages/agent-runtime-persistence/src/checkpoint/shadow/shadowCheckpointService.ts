import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { runGit, sanitizeGitEnv } from "./shadowGit";
import type {
  ShadowCheckpointDiff,
  ShadowCheckpointInitResult,
  ShadowCheckpointMetadata,
  ShadowCheckpointSaveOptions,
  ShadowCheckpointServiceOptions,
} from "./types";

export class ShadowCheckpointService {
  private readonly taskId: string;
  private readonly workspacePath: string;
  private readonly repoPath: string;
  private readonly gitDir: string;
  private readonly logger: Pick<Console, "debug" | "info" | "warn" | "error">;
  private readonly auditLogger?: ShadowCheckpointServiceOptions["auditLogger"];
  private readonly gitEnv: NodeJS.ProcessEnv;
  private initialized = false;
  private baseHash?: string;
  private checkpoints: string[] = [];

  constructor(options: ShadowCheckpointServiceOptions) {
    this.taskId = options.taskId;
    this.workspacePath = options.workspacePath;
    this.repoPath = path.join(options.storagePath, "tasks", options.taskId, "checkpoints");
    this.gitDir = path.join(this.repoPath, ".git");
    this.logger = options.logger ?? console;
    this.auditLogger = options.auditLogger;
    this.gitEnv = sanitizeGitEnv();
  }

  getBaseHash(): string | undefined {
    return this.baseHash;
  }

  getCheckpoints(): string[] {
    return [...this.checkpoints];
  }

  async init(): Promise<ShadowCheckpointInitResult> {
    if (this.initialized) {
      if (!this.baseHash) {
        throw new Error("Shadow checkpoint repo initialized without base hash");
      }
      return { created: false, baseHash: this.baseHash };
    }

    const repoExists = await pathExists(this.gitDir);
    await mkdir(this.repoPath, { recursive: true });

    if (!repoExists) {
      await this.initRepo();
      await this.stageAll();
      await this.commit("initial checkpoint", true);
    } else {
      const worktree = await this.getGitConfig("core.worktree");
      if (worktree && path.resolve(worktree) !== path.resolve(this.workspacePath)) {
        throw new Error(
          `Shadow checkpoint repo is bound to ${worktree}, expected ${this.workspacePath}`
        );
      }
    }

    this.baseHash = await this.revParse("HEAD");
    this.initialized = true;
    this.logger.info(
      `[ShadowCheckpointService] Initialized for task ${this.taskId} (base ${this.baseHash})`
    );

    return { created: !repoExists, baseHash: this.baseHash };
  }

  async saveCheckpoint(
    message: string,
    options: ShadowCheckpointSaveOptions = {}
  ): Promise<ShadowCheckpointMetadata | null> {
    await this.ensureInitialized();

    await this.stageAll();
    const hasChanges = await this.hasChanges();
    if (!hasChanges && !options.allowEmpty) {
      return null;
    }

    const commit = await this.commit(message, options.allowEmpty ?? false);
    const metadata: ShadowCheckpointMetadata = {
      commit,
      base: this.baseHash ?? commit,
      message,
      createdAt: Date.now(),
    };

    this.checkpoints = [...this.checkpoints, commit];

    if (options.checkpointManager && options.checkpointId) {
      await options.checkpointManager.updateMetadata(options.checkpointId, {
        shadowCheckpoint: metadata,
      });
    }

    this.auditTimeTravel("checkpoint_save", { ...metadata, checkpointId: options.checkpointId });

    return metadata;
  }

  async restoreCheckpoint(commitHash: string): Promise<void> {
    await this.ensureInitialized();

    await runGit(["clean", "-fd"], { cwd: this.repoPath, env: this.gitEnv });
    await runGit(["reset", "--hard", commitHash], { cwd: this.repoPath, env: this.gitEnv });

    const index = this.checkpoints.indexOf(commitHash);
    if (index >= 0) {
      this.checkpoints = this.checkpoints.slice(0, index + 1);
    }

    this.auditTimeTravel("checkpoint_restore", { commit: commitHash, base: this.baseHash });
  }

  async getDiff(params: { from?: string; to?: string } = {}): Promise<ShadowCheckpointDiff[]> {
    await this.ensureInitialized();

    const from = params.from ?? this.baseHash ?? (await this.getRootCommit());
    await this.stageAll();

    const diffRange = params.to ? [`${from}..${params.to}`] : [from];
    const fileListRaw = await runGit(["diff", "--name-only", ...diffRange], {
      cwd: this.repoPath,
      env: this.gitEnv,
    });
    const fileList = fileListRaw.length > 0 ? fileListRaw.split("\n").filter(Boolean) : [];

    const diffs: ShadowCheckpointDiff[] = [];
    for (const relativePath of fileList) {
      const absolutePath = path.join(this.workspacePath, relativePath);
      const before = await this.showFile(from, relativePath);
      const after = params.to
        ? await this.showFile(params.to, relativePath)
        : await readFile(absolutePath, "utf-8").catch(() => "");

      diffs.push({
        path: { relative: relativePath, absolute: absolutePath },
        content: { before, after },
      });
    }

    return diffs;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async initRepo(): Promise<void> {
    await runGit(["init"], { cwd: this.repoPath, env: this.gitEnv });
    await runGit(["config", "core.worktree", this.workspacePath], {
      cwd: this.repoPath,
      env: this.gitEnv,
    });
    await runGit(["config", "commit.gpgsign", "false"], {
      cwd: this.repoPath,
      env: this.gitEnv,
    });
    await runGit(["config", "user.name", "Keep-Up Runtime"], {
      cwd: this.repoPath,
      env: this.gitEnv,
    });
    await runGit(["config", "user.email", "noreply@example.com"], {
      cwd: this.repoPath,
      env: this.gitEnv,
    });
  }

  private async stageAll(): Promise<void> {
    await runGit(["add", "-A", "--ignore-errors"], { cwd: this.repoPath, env: this.gitEnv });
  }

  private async hasChanges(): Promise<boolean> {
    const status = await runGit(["status", "--porcelain"], {
      cwd: this.repoPath,
      env: this.gitEnv,
    });
    return status.length > 0;
  }

  private async commit(message: string, allowEmpty: boolean): Promise<string> {
    const args = ["commit", "-m", message];
    if (allowEmpty) {
      args.push("--allow-empty");
    }
    await runGit(args, { cwd: this.repoPath, env: this.gitEnv });
    return this.revParse("HEAD");
  }

  private async revParse(ref: string): Promise<string> {
    return runGit(["rev-parse", ref], { cwd: this.repoPath, env: this.gitEnv });
  }

  private async getRootCommit(): Promise<string> {
    return runGit(["rev-list", "--max-parents=0", "HEAD"], {
      cwd: this.repoPath,
      env: this.gitEnv,
    });
  }

  private async showFile(ref: string, relativePath: string): Promise<string> {
    try {
      return await runGit(["show", `${ref}:${relativePath}`], {
        cwd: this.repoPath,
        env: this.gitEnv,
        trimOutput: false,
      });
    } catch {
      return "";
    }
  }

  private async getGitConfig(key: string): Promise<string | undefined> {
    try {
      const value = await runGit(["config", "--get", key], {
        cwd: this.repoPath,
        env: this.gitEnv,
      });
      return value.length > 0 ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private auditTimeTravel(action: string, payload: Record<string, unknown>): void {
    if (!this.auditLogger) {
      return;
    }

    this.auditLogger.log({
      timestamp: Date.now(),
      toolName: `time_travel:${action}`,
      action: "result",
      input: payload,
      sandboxed: false,
    });
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
