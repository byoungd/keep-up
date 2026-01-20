import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureCliStateDir } from "./statePaths";

export type CliConfig = Record<string, unknown>;

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
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
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
    const baseDir = await ensureCliStateDir();
    return path.join(baseDir, this.filePath);
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
