import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import {
  type ContextIndex,
  createContextIndex,
  createHashEmbeddingProvider,
  createJsonContextIndexStore,
  type EmbeddingProvider,
} from "@ku0/context-index";

export class ContextIndexManager {
  private readonly indexes = new Map<string, ContextIndex>();
  private readonly stateDir: string;
  private readonly embeddingProvider: EmbeddingProvider;

  constructor(options: { stateDir: string; embeddingProvider?: EmbeddingProvider }) {
    this.stateDir = options.stateDir;
    this.embeddingProvider = options.embeddingProvider ?? createHashEmbeddingProvider();
  }

  getIndex(
    rootPath: string,
    options?: { tokenModel?: string; respectGitignore?: boolean }
  ): ContextIndex {
    const normalized = normalizePath(rootPath);
    const existing = this.indexes.get(normalized);
    if (existing) {
      if (options) {
        existing.updateConfig({
          ...(options.tokenModel ? { tokenModel: options.tokenModel } : {}),
          ...(options.respectGitignore !== undefined
            ? { respectGitignore: options.respectGitignore }
            : {}),
        });
      }
      return existing;
    }

    const storeRoot = join(this.stateDir, "context-index", hashPath(normalized));
    const store = createJsonContextIndexStore({ rootDir: storeRoot });
    const index = createContextIndex({
      rootPath: normalized,
      store,
      embeddingProvider: this.embeddingProvider,
      ...(options?.tokenModel ? { tokenModel: options.tokenModel } : {}),
      ...(options?.respectGitignore !== undefined
        ? { respectGitignore: options.respectGitignore }
        : {}),
    });
    this.indexes.set(normalized, index);
    return index;
  }
}

function normalizePath(path: string): string {
  return resolve(path).replace(/\\/g, "/");
}

function hashPath(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 12);
}
