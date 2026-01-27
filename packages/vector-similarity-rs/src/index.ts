import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type VectorInput = ReadonlyArray<number> | Float32Array;

interface NativeVectorSimilarityModule {
  cosineSimilarity(a: Float32Array, b: Float32Array): number;
  cosineSimilarityBatch(query: Float32Array, targets: Float32Array[]): number[];
  euclideanDistance(a: Float32Array, b: Float32Array): number;
}

const require = createRequire(import.meta.url);
let cachedModule: NativeVectorSimilarityModule | null | undefined;

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

function isNativeDisabled(): boolean {
  const raw = process.env.KU0_VECTOR_SIMILARITY_DISABLE_NATIVE;
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function resolveNativeBindingPath(): string | null {
  const override = process.env.KU0_VECTOR_SIMILARITY_NATIVE_PATH?.trim();
  if (override) {
    const resolved = path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
    return existsSync(resolved) ? resolved : null;
  }

  const root = resolvePackageRoot();
  const candidates = [
    path.join(root, "dist", "vector_similarity_rs.node"),
    path.join(root, "dist", "index.node"),
    path.join(root, "vector_similarity_rs.node"),
    path.join(root, "index.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function loadNativeModule(): NativeVectorSimilarityModule | null {
  if (isNativeDisabled()) {
    return null;
  }

  if (cachedModule !== undefined) {
    return cachedModule;
  }

  const bindingPath = resolveNativeBindingPath();
  if (!bindingPath) {
    cachedModule = null;
    return null;
  }

  try {
    cachedModule = require(bindingPath) as NativeVectorSimilarityModule;
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}

function assertSameDimension(a: { length: number }, b: { length: number }): void {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimension");
  }
}

function toFloat32Array(vector: VectorInput): Float32Array {
  if (vector instanceof Float32Array) {
    return vector;
  }
  return Float32Array.from(vector);
}

function cosineSimilarityFallback(a: VectorInput, b: VectorInput): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valueA = a[i];
    const valueB = b[i];
    dotProduct += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

function euclideanDistanceFallback(a: VectorInput, b: VectorInput): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(a: VectorInput, b: VectorInput): number {
  assertSameDimension(a, b);

  const native = loadNativeModule();
  if (native) {
    return native.cosineSimilarity(toFloat32Array(a), toFloat32Array(b));
  }

  return cosineSimilarityFallback(a, b);
}

export function cosineSimilarityBatch(query: VectorInput, targets: VectorInput[]): number[] {
  if (targets.length === 0) {
    return [];
  }

  for (const target of targets) {
    assertSameDimension(query, target);
  }

  const native = loadNativeModule();
  if (native) {
    const convertedTargets: Float32Array[] = new Array(targets.length);
    for (let i = 0; i < targets.length; i++) {
      convertedTargets[i] = toFloat32Array(targets[i]);
    }
    return native.cosineSimilarityBatch(toFloat32Array(query), convertedTargets);
  }

  const results: number[] = new Array(targets.length);
  for (let i = 0; i < targets.length; i++) {
    results[i] = cosineSimilarityFallback(query, targets[i]);
  }
  return results;
}

export function euclideanDistance(a: VectorInput, b: VectorInput): number {
  assertSameDimension(a, b);

  const native = loadNativeModule();
  if (native) {
    return native.euclideanDistance(toFloat32Array(a), toFloat32Array(b));
  }

  return euclideanDistanceFallback(a, b);
}
