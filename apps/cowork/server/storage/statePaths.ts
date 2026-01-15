import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function resolveStateDir(): string {
  const override = process.env.COWORK_STATE_DIR;
  return override ? resolve(override) : resolve(DEFAULT_ROOT, ".keep-up/state/cowork");
}

export async function ensureStateDir(): Promise<string> {
  const stateDir = resolveStateDir();
  await mkdir(stateDir, { recursive: true });
  return stateDir;
}
