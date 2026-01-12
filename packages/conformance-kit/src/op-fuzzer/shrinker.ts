/**
 * LFCC Conformance Kit - Program Shrinker (Part D)
 *
 * Minimizes failing programs to minimal repro using delta debugging.
 */

import type { FuzzOp } from "./types";

/** Predicate function that returns true if the program still fails */
export type FailurePredicate = (ops: FuzzOp[]) => Promise<boolean>;

/** Shrink result */
export type ShrinkResult = {
  originalLength: number;
  shrunkLength: number;
  shrunkOps: FuzzOp[];
  iterations: number;
};

/**
 * Shrink a failing program to minimal repro
 * Uses delta debugging algorithm
 */
export async function shrinkProgram(
  ops: FuzzOp[],
  predicateFails: FailurePredicate,
  maxIterations = 100
): Promise<ShrinkResult> {
  const originalLength = ops.length;
  let current = [...ops];
  let iterations = 0;

  // Phase 1: Binary search removal (delta debugging)
  current = await deltaDebug(current, predicateFails, maxIterations);
  iterations++;

  // Phase 2: Single element removal
  current = await removeOneByOne(current, predicateFails);
  iterations++;

  // Phase 3: Simplify parameters
  current = await simplifyParameters(current, predicateFails);
  iterations++;

  return {
    originalLength,
    shrunkLength: current.length,
    shrunkOps: current,
    iterations,
  };
}

/**
 * Delta debugging: try removing chunks of increasing granularity
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: delta debug logic
async function deltaDebug(
  ops: FuzzOp[],
  predicateFails: FailurePredicate,
  maxIterations: number
): Promise<FuzzOp[]> {
  let current = [...ops];
  let n = 2; // Start with 2 chunks
  let iterations = 0;

  while (n <= current.length && iterations < maxIterations) {
    iterations++;
    const chunkSize = Math.ceil(current.length / n);
    let reduced = false;

    // Try removing each chunk
    for (let i = 0; i < n && !reduced; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, current.length);

      // Create version without this chunk
      const candidate = [...current.slice(0, start), ...current.slice(end)];

      if (candidate.length > 0 && (await predicateFails(candidate))) {
        current = candidate;
        n = Math.max(2, n - 1); // Reduce granularity
        reduced = true;
      }
    }

    if (!reduced) {
      // Try complement: keep only each chunk
      for (let i = 0; i < n && !reduced; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, current.length);
        const candidate = current.slice(start, end);

        if (candidate.length > 0 && (await predicateFails(candidate))) {
          current = candidate;
          n = 2;
          reduced = true;
        }
      }
    }

    if (!reduced) {
      n = n * 2; // Increase granularity
    }
  }

  return current;
}

/**
 * Try removing each operation one by one
 */
async function removeOneByOne(ops: FuzzOp[], predicateFails: FailurePredicate): Promise<FuzzOp[]> {
  let current = [...ops];
  let i = 0;

  while (i < current.length) {
    const candidate = [...current.slice(0, i), ...current.slice(i + 1)];

    if (candidate.length > 0 && (await predicateFails(candidate))) {
      current = candidate;
      // Don't increment i, check same position again
    } else {
      i++;
    }
  }

  return current;
}

/**
 * Try simplifying operation parameters
 */
async function simplifyParameters(
  ops: FuzzOp[],
  predicateFails: FailurePredicate
): Promise<FuzzOp[]> {
  const current = [...ops];

  for (let i = 0; i < current.length; i++) {
    const op = current[i];
    const simplified = simplifyOp(op);

    if (simplified && !opEquals(op, simplified)) {
      const candidate = [...current];
      candidate[i] = simplified;

      if (await predicateFails(candidate)) {
        current[i] = simplified;
      }
    }
  }

  return current;
}

/**
 * Simplify a single operation
 */
function simplifyOp(op: FuzzOp): FuzzOp | null {
  switch (op.type) {
    case "InsertText":
      // Shorten text
      if (op.text.length > 1) {
        return { ...op, text: op.text.slice(0, Math.ceil(op.text.length / 2)) };
      }
      break;

    case "DeleteText":
      // Reduce delete length
      if (op.length > 1) {
        return { ...op, length: Math.ceil(op.length / 2) };
      }
      break;

    case "AddMark":
    case "RemoveMark":
      // Shrink range
      if (op.to - op.from > 1) {
        const mid = Math.floor((op.from + op.to) / 2);
        return { ...op, to: mid + 1 };
      }
      break;

    case "Paste":
      // Simplify payload
      try {
        const payload = JSON.parse(op.payload);
        if (payload.content && payload.content.length > 1) {
          return {
            ...op,
            payload: JSON.stringify({ ...payload, content: payload.content.slice(0, 1) }),
          };
        }
      } catch {
        // Invalid payload, can't simplify
      }
      break;
  }

  return null;
}

/**
 * Check if two operations are equal
 */
function opEquals(a: FuzzOp, b: FuzzOp): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Quick shrink: just try removing from end
 */
export async function quickShrink(
  ops: FuzzOp[],
  predicateFails: FailurePredicate
): Promise<FuzzOp[]> {
  let current = [...ops];

  // Binary search for minimum length
  let lo = 1;
  let hi = current.length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = current.slice(0, mid);

    if (await predicateFails(candidate)) {
      hi = mid;
      current = candidate;
    } else {
      lo = mid + 1;
    }
  }

  return current;
}
