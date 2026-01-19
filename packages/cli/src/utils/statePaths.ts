import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_DIR = ".keep-up";

export function resolveCliStateDir(): string {
  const override = process.env.KEEPUP_STATE_DIR;
  return override ? path.resolve(override) : path.join(os.homedir(), DEFAULT_DIR);
}

export async function ensureCliStateDir(): Promise<string> {
  const dir = resolveCliStateDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function resolveCliPath(fileName: string): string {
  return path.join(resolveCliStateDir(), fileName);
}
