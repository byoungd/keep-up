import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApprovalPolicy } from "@ku0/agent-runtime-tools";
import { ensureCliStateDir, resolveCliPath } from "./statePaths";

export type CliConfig = {
  provider?: string;
  model?: string;
  output?: string;
  session?: string;
  approvalMode?: string;
  approvalPolicies?: ApprovalPolicy[];
  approvalWorkspacePaths?: string[];
  sandbox?: string;
  [key: string]: unknown;
};

export const DEFAULT_CLI_CONFIG: CliConfig = {
  provider: "auto",
  model: "auto",
  output: "text",
  approvalMode: "ask",
  sandbox: "auto",
};

export interface ConfigStoreOptions {
  baseDir?: string;
  fileName?: string;
}

export class ConfigStore {
  private readonly filePath: string;

  constructor(options: ConfigStoreOptions = {}) {
    const fileName = options.fileName ?? "cli-config.json";
    this.filePath = options.baseDir ? path.join(options.baseDir, fileName) : fileName;
  }

  async load(): Promise<CliConfig> {
    try {
      const data = await readFile(await this.resolvePath(), "utf8");
      const parsed = JSON.parse(data) as CliConfig;
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT_CLI_CONFIG, ...parsed };
      }
      return { ...DEFAULT_CLI_CONFIG };
    } catch {
      return { ...DEFAULT_CLI_CONFIG };
    }
  }

  async save(config: CliConfig): Promise<void> {
    await ensureCliStateDir();
    await writeFile(await this.resolvePath(), JSON.stringify(config, null, 2), "utf8");
  }

  private async resolvePath(): Promise<string> {
    if (path.isAbsolute(this.filePath)) {
      return this.filePath;
    }
    return resolveCliPath(this.filePath);
  }
}

export function parseConfigValue(raw: string): unknown {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  const numberValue = Number(raw);
  if (!Number.isNaN(numberValue) && raw.trim() !== "") {
    return numberValue;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function setConfigValue(target: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".").filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

export function unsetConfigValue(target: Record<string, unknown>, key: string): boolean {
  const parts = key.split(".").filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return false;
    }
    cursor = next as Record<string, unknown>;
  }
  const finalKey = parts[parts.length - 1];
  if (!(finalKey in cursor)) {
    return false;
  }
  delete cursor[finalKey];
  return true;
}
