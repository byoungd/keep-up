import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ContextChunk,
  ContextIndexStore,
  ContextPack,
  ContextPackPin,
  ContextSource,
} from "./types";

class JsonFileStore<T extends Record<string, unknown>> {
  private readonly filePath: string;
  private readonly idKey: keyof T;
  private readonly fallback: T[];

  constructor(options: { filePath: string; idKey: keyof T; fallback?: T[] }) {
    this.filePath = options.filePath;
    this.idKey = options.idKey;
    this.fallback = options.fallback ?? [];
  }

  async list(): Promise<T[]> {
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

  async setAll(items: T[]): Promise<void> {
    await this.writeAll(items);
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

export class InMemoryContextIndexStore implements ContextIndexStore {
  private readonly chunks = new Map<string, ContextChunk>();
  private readonly packs = new Map<string, ContextPack>();
  private readonly sources = new Map<string, ContextSource>();
  private readonly pins = new Map<string, ContextPackPin>();

  async listChunks(): Promise<ContextChunk[]> {
    return Array.from(this.chunks.values());
  }

  async listChunksBySource(sourcePath: string): Promise<ContextChunk[]> {
    return Array.from(this.chunks.values()).filter((chunk) => chunk.sourcePath === sourcePath);
  }

  async getChunk(id: string): Promise<ContextChunk | null> {
    return this.chunks.get(id) ?? null;
  }

  async upsertChunk(chunk: ContextChunk): Promise<ContextChunk> {
    this.chunks.set(chunk.id, chunk);
    return chunk;
  }

  async deleteChunk(id: string): Promise<boolean> {
    return this.chunks.delete(id);
  }

  async deleteChunksBySource(sourcePath: string): Promise<number> {
    let deleted = 0;
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.sourcePath === sourcePath) {
        this.chunks.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  async listPacks(): Promise<ContextPack[]> {
    return Array.from(this.packs.values());
  }

  async getPack(id: string): Promise<ContextPack | null> {
    return this.packs.get(id) ?? null;
  }

  async upsertPack(pack: ContextPack): Promise<ContextPack> {
    this.packs.set(pack.id, pack);
    return pack;
  }

  async deletePack(id: string): Promise<boolean> {
    return this.packs.delete(id);
  }

  async listSources(): Promise<ContextSource[]> {
    return Array.from(this.sources.values());
  }

  async getSource(sourcePath: string): Promise<ContextSource | null> {
    return this.sources.get(sourcePath) ?? null;
  }

  async upsertSource(source: ContextSource): Promise<ContextSource> {
    this.sources.set(source.sourcePath, source);
    return source;
  }

  async deleteSource(sourcePath: string): Promise<boolean> {
    return this.sources.delete(sourcePath);
  }

  async listPins(): Promise<ContextPackPin[]> {
    return Array.from(this.pins.values());
  }

  async getPins(sessionId: string): Promise<ContextPackPin | null> {
    return this.pins.get(sessionId) ?? null;
  }

  async upsertPins(pins: ContextPackPin): Promise<ContextPackPin> {
    this.pins.set(pins.sessionId, pins);
    return pins;
  }

  async deletePins(sessionId: string): Promise<boolean> {
    return this.pins.delete(sessionId);
  }
}

class JsonContextIndexStore implements ContextIndexStore {
  private readonly chunkStore: JsonFileStore<ContextChunk>;
  private readonly packStore: JsonFileStore<ContextPack>;
  private readonly sourceStore: JsonFileStore<ContextSource>;
  private readonly pinStore: JsonFileStore<ContextPackPin>;

  constructor(rootDir: string) {
    this.chunkStore = new JsonFileStore<ContextChunk>({
      filePath: join(rootDir, "context_chunks.json"),
      idKey: "id",
    });
    this.packStore = new JsonFileStore<ContextPack>({
      filePath: join(rootDir, "context_packs.json"),
      idKey: "id",
    });
    this.sourceStore = new JsonFileStore<ContextSource>({
      filePath: join(rootDir, "context_sources.json"),
      idKey: "sourcePath",
    });
    this.pinStore = new JsonFileStore<ContextPackPin>({
      filePath: join(rootDir, "context_pins.json"),
      idKey: "sessionId",
    });
  }

  async listChunks(): Promise<ContextChunk[]> {
    return this.chunkStore.list();
  }

  async listChunksBySource(sourcePath: string): Promise<ContextChunk[]> {
    const chunks = await this.chunkStore.list();
    return chunks.filter((chunk) => chunk.sourcePath === sourcePath);
  }

  async getChunk(id: string): Promise<ContextChunk | null> {
    return this.chunkStore.getById(id);
  }

  async upsertChunk(chunk: ContextChunk): Promise<ContextChunk> {
    return this.chunkStore.upsert(chunk);
  }

  async deleteChunk(id: string): Promise<boolean> {
    return this.chunkStore.delete(id);
  }

  async deleteChunksBySource(sourcePath: string): Promise<number> {
    const chunks = await this.chunkStore.list();
    const next = chunks.filter((chunk) => chunk.sourcePath !== sourcePath);
    await this.chunkStore.setAll(next);
    return chunks.length - next.length;
  }

  async listPacks(): Promise<ContextPack[]> {
    return this.packStore.list();
  }

  async getPack(id: string): Promise<ContextPack | null> {
    return this.packStore.getById(id);
  }

  async upsertPack(pack: ContextPack): Promise<ContextPack> {
    return this.packStore.upsert(pack);
  }

  async deletePack(id: string): Promise<boolean> {
    return this.packStore.delete(id);
  }

  async listSources(): Promise<ContextSource[]> {
    return this.sourceStore.list();
  }

  async getSource(sourcePath: string): Promise<ContextSource | null> {
    return this.sourceStore.getById(sourcePath);
  }

  async upsertSource(source: ContextSource): Promise<ContextSource> {
    return this.sourceStore.upsert(source);
  }

  async deleteSource(sourcePath: string): Promise<boolean> {
    return this.sourceStore.delete(sourcePath);
  }

  async listPins(): Promise<ContextPackPin[]> {
    return this.pinStore.list();
  }

  async getPins(sessionId: string): Promise<ContextPackPin | null> {
    return this.pinStore.getById(sessionId);
  }

  async upsertPins(pins: ContextPackPin): Promise<ContextPackPin> {
    return this.pinStore.upsert(pins);
  }

  async deletePins(sessionId: string): Promise<boolean> {
    return this.pinStore.delete(sessionId);
  }
}

export function createJsonContextIndexStore(options: { rootDir: string }): ContextIndexStore {
  return new JsonContextIndexStore(options.rootDir);
}
