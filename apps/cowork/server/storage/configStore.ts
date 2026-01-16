import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CoworkSettings } from "./types";

export class ConfigStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async get(): Promise<CoworkSettings> {
    try {
      const data = await readFile(this.filePath, "utf-8");
      return JSON.parse(data) as CoworkSettings;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return {};
      }
      throw error;
    }
  }

  async set(next: CoworkSettings): Promise<CoworkSettings> {
    await this.write(next);
    return next;
  }

  async update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings> {
    const current = await this.get();
    const next = updater(current);
    await this.write(next);
    return next;
  }

  private async write(payload: CoworkSettings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf-8");
    await rename(tempPath, this.filePath);
  }
}

export function createConfigStore(filePath: string): ConfigStore {
  return new ConfigStore(filePath);
}
