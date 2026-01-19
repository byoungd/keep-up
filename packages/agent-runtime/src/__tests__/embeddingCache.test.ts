/**
 * CachedEmbeddingProvider tests.
 */

import { describe, expect, it } from "vitest";
import { CachedEmbeddingProvider } from "../memory/embeddingCache";
import type { IEmbeddingProvider } from "../memory/types";

class CountingEmbeddingProvider implements IEmbeddingProvider {
  embedCalls = 0;
  embedBatchCalls = 0;

  async embed(text: string): Promise<number[]> {
    this.embedCalls += 1;
    return [text.length];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.embedBatchCalls += 1;
    return texts.map((text) => [text.length]);
  }

  getDimension(): number {
    return 1;
  }
}

class DeferredEmbeddingProvider implements IEmbeddingProvider {
  embedCalls = 0;
  private resolveNext?: (value: number[]) => void;

  async embed(_text: string): Promise<number[]> {
    this.embedCalls += 1;
    return new Promise((resolve) => {
      this.resolveNext = resolve;
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0]);
  }

  getDimension(): number {
    return 1;
  }

  resolve(value: number[]): void {
    if (!this.resolveNext) {
      throw new Error("No pending embedding to resolve");
    }
    this.resolveNext(value);
    this.resolveNext = undefined;
  }
}

describe("CachedEmbeddingProvider", () => {
  it("caches single embeddings", async () => {
    const provider = new CountingEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, { enableEmbeddingCache: true });

    const first = await cached.embed("hello");
    const second = await cached.embed("hello");

    expect(provider.embedCalls).toBe(1);
    expect(first).toEqual(second);
  });

  it("does not normalize embedding text by default", async () => {
    const provider = new CountingEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, { enableEmbeddingCache: true });

    await cached.embed("hello world");
    await cached.embed("hello   world");

    expect(provider.embedCalls).toBe(2);
  });

  it("normalizes embedding text when configured", async () => {
    const provider = new CountingEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, {
      enableEmbeddingCache: true,
      normalizeEmbeddingText: true,
    });

    await cached.embed("hello world");
    await cached.embed("hello   world");

    expect(provider.embedCalls).toBe(1);
  });

  it("deduplicates embedBatch requests", async () => {
    const provider = new CountingEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, { enableEmbeddingCache: true });

    const result = await cached.embedBatch(["one", "two", "one"]);

    expect(provider.embedBatchCalls).toBe(1);
    expect(provider.embedCalls).toBe(0);
    expect(result).toEqual([[3], [3], [3]]);
  });

  it("single-flights concurrent embeds", async () => {
    const provider = new DeferredEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, { enableEmbeddingCache: true });

    const firstPromise = cached.embed("slow");
    const secondPromise = cached.embed("slow");

    expect(provider.embedCalls).toBe(1);

    provider.resolve([5]);

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first).toEqual([5]);
    expect(second).toEqual([5]);
  });
});
