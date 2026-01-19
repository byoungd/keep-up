/**
 * Tool Result Cache Stores
 *
 * File-backed persistence for tool result caches.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { decode, encode } from "@msgpack/msgpack";

import type { ToolResultCacheSnapshot, ToolResultCacheStore } from "./cache";

export interface FileToolResultCacheStoreConfig {
  filePath: string;
}

export class FileToolResultCacheStore implements ToolResultCacheStore {
  private readonly filePath: string;

  constructor(config: FileToolResultCacheStoreConfig) {
    this.filePath = config.filePath;
  }

  async load(): Promise<ToolResultCacheSnapshot | null> {
    try {
      const payload = await readFile(this.filePath);
      const snapshot = decode(payload) as ToolResultCacheSnapshot;
      if (!snapshot || snapshot.version !== 1) {
        return null;
      }
      return snapshot;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async save(snapshot: ToolResultCacheSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, encode(snapshot));
  }
}
