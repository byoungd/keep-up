import type { BenchmarkAdapterRegistry, ExternalBenchmarkAdapter } from "./types";

export function createBenchmarkAdapterRegistry(
  adapters: ExternalBenchmarkAdapter[]
): BenchmarkAdapterRegistry {
  const map = new Map<string, ExternalBenchmarkAdapter>();
  for (const adapter of adapters) {
    if (map.has(adapter.id)) {
      throw new Error(`Benchmark adapter already registered: ${adapter.id}`);
    }
    map.set(adapter.id, adapter);
  }

  return {
    get(id: string): ExternalBenchmarkAdapter | undefined {
      return map.get(id);
    },
    list(): ExternalBenchmarkAdapter[] {
      return Array.from(map.values());
    },
  };
}
