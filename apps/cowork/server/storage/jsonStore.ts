import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonStore<T extends object> {
  private readonly filePath: string;
  private readonly idKey: keyof T;
  private readonly fallback: T[];

  constructor(options: { filePath: string; idKey: keyof T; fallback?: T[] }) {
    this.filePath = options.filePath;
    this.idKey = options.idKey;
    this.fallback = options.fallback ?? [];
  }

  async getAll(): Promise<T[]> {
    return this.readAll();
  }

  async getById(id: string): Promise<T | null> {
    const items = await this.readAll();
    return items.find((item) => item[this.idKey] === id) ?? null;
  }

  async upsert(item: T): Promise<T> {
    const items = await this.readAll();
    const next = items.filter((entry) => entry[this.idKey] !== item[this.idKey]);
    next.unshift(item);
    await this.writeAll(next);
    return item;
  }

  async update(id: string, updater: (item: T) => T): Promise<T | null> {
    const items = await this.readAll();
    const index = items.findIndex((item) => item[this.idKey] === id);
    if (index < 0) {
      return null;
    }
    const updated = updater(items[index]);
    const next = [...items];
    next[index] = updated;
    await this.writeAll(next);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const items = await this.readAll();
    const next = items.filter((item) => item[this.idKey] !== id);
    if (next.length === items.length) {
      return false;
    }
    await this.writeAll(next);
    return true;
  }

  private async readAll(): Promise<T[]> {
    try {
      const data = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(data) as { items?: T[] };
      return parsed.items ?? [...this.fallback];
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return [...this.fallback];
      }
      throw error;
    }
  }

  private async writeAll(items: T[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify({ items }, null, 2);
    const tempPath = `${this.filePath}.${Date.now()}.tmp`;
    await writeFile(tempPath, payload, "utf-8");
    await rename(tempPath, this.filePath);
  }
}
