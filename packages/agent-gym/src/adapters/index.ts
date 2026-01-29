export { createBenchmarkAdapterRegistry } from "./registry";
export { createSweBenchAdapter, SweBenchAdapter } from "./sweBenchAdapter";
export type {
  BenchmarkAdapterRegistry,
  ExternalBenchmarkAdapter,
  ExternalBenchmarkLoadOptions,
} from "./types";

import { createBenchmarkAdapterRegistry } from "./registry";
import { createSweBenchAdapter } from "./sweBenchAdapter";

export const defaultBenchmarkAdapterRegistry = createBenchmarkAdapterRegistry([
  createSweBenchAdapter(),
]);
