import { performance } from "node:perf_hooks";
import { createMemoryManagerWithStore } from "../src/memory/memoryManager";
import { createInMemoryStore } from "../src/memory/memoryStore";
import type { IEmbeddingProvider } from "../src/memory/types";

class SlowEmbeddingProvider implements IEmbeddingProvider {
  constructor(private readonly delayMs: number) {}

  async embed(text: string): Promise<number[]> {
    await sleep(this.delayMs);
    return [text.length];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  getDimension(): number {
    return 1;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedStore(store = createInMemoryStore()) {
  await store.add({
    type: "fact",
    content: "Cached memory test content",
    importance: 0.6,
    createdAt: Date.now(),
    source: "bench",
    tags: ["bench"],
  });
  return store;
}

async function measureRecall(
  label: string,
  manager: ReturnType<typeof createMemoryManagerWithStore>
) {
  const firstStart = performance.now();
  await manager.recall("cached memory test");
  const firstMs = performance.now() - firstStart;

  const secondStart = performance.now();
  await manager.recall("cached memory test");
  const secondMs = performance.now() - secondStart;

  process.stdout.write(
    `${label}\n  first: ${firstMs.toFixed(2)}ms\n  second: ${secondMs.toFixed(2)}ms\n\n`
  );
}

async function main() {
  const baselineStore = await seedStore();
  const cachedStore = await seedStore();

  const provider = new SlowEmbeddingProvider(50);
  const baselineManager = createMemoryManagerWithStore(baselineStore, undefined, provider);

  const cachedManager = createMemoryManagerWithStore(cachedStore, undefined, provider, {
    enableQueryCache: true,
    enableEmbeddingCache: true,
  });

  await measureRecall("baseline", baselineManager);
  await measureRecall("cached", cachedManager);
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Benchmark failed: ${message}\n`);
  process.exitCode = 1;
});
