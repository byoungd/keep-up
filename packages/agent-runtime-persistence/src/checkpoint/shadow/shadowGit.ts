import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const STRIPPED_GIT_ENV_KEYS = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
]);

export interface GitCommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  trimOutput?: boolean;
}

export function sanitizeGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (STRIPPED_GIT_ENV_KEYS.has(key)) {
      continue;
    }
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function runGit(args: string[], options: GitCommandOptions): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: options.cwd,
      env: options.env,
    });
    if (options.trimOutput === false) {
      return stdout;
    }
    return stdout.trimEnd();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
}
