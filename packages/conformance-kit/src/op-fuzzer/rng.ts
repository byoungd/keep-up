/**
 * LFCC Conformance Kit - Deterministic RNG
 *
 * XorShift128+ implementation for reproducible random generation.
 */

export type RngState = {
  s0: number;
  s1: number;
};

/**
 * Create RNG from seed
 */
export function createRng(seed: number): RngState {
  // Initialize with seed using splitmix64-like initialization
  let s = seed >>> 0;
  s = ((s ^ (s >>> 16)) * 0x85ebca6b) >>> 0;
  s = ((s ^ (s >>> 13)) * 0xc2b2ae35) >>> 0;
  const s0 = (s ^ (s >>> 16)) >>> 0;

  s = (seed + 0x9e3779b9) >>> 0;
  s = ((s ^ (s >>> 16)) * 0x85ebca6b) >>> 0;
  s = ((s ^ (s >>> 13)) * 0xc2b2ae35) >>> 0;
  const s1 = (s ^ (s >>> 16)) >>> 0;

  return { s0: s0 || 1, s1: s1 || 1 };
}

/**
 * Generate next random number [0, 1)
 */
export function nextFloat(rng: RngState): { value: number; rng: RngState } {
  const s0 = rng.s0 >>> 0;
  let s1 = rng.s1 >>> 0;

  const result = (s0 + s1) >>> 0;

  s1 ^= s0;
  const newS0 = (((s0 << 23) | (s0 >>> 9)) ^ s1 ^ (s1 << 14)) >>> 0;
  const newS1 = ((s1 << 28) | (s1 >>> 4)) >>> 0;

  return {
    value: result / 0x100000000,
    rng: { s0: newS0 || 1, s1: newS1 || 1 },
  };
}

/**
 * Generate random integer in range [min, max] inclusive
 */
export function nextInt(rng: RngState, min: number, max: number): { value: number; rng: RngState } {
  const { value, rng: newRng } = nextFloat(rng);
  return {
    value: Math.floor(value * (max - min + 1)) + min,
    rng: newRng,
  };
}

/**
 * Generate random boolean with given probability of true
 */
export function nextBool(rng: RngState, probability = 0.5): { value: boolean; rng: RngState } {
  const { value, rng: newRng } = nextFloat(rng);
  return { value: value < probability, rng: newRng };
}

/**
 * Select random element from array
 */
export function selectOne<T>(rng: RngState, arr: T[]): { value: T | undefined; rng: RngState } {
  if (arr.length === 0) {
    return { value: undefined, rng };
  }
  const { value: idx, rng: newRng } = nextInt(rng, 0, arr.length - 1);
  return { value: arr[idx], rng: newRng };
}

/**
 * Select multiple random elements from array (without replacement)
 */
export function selectMany<T>(
  rng: RngState,
  arr: T[],
  count: number
): { value: T[]; rng: RngState } {
  if (arr.length === 0 || count <= 0) {
    return { value: [], rng };
  }

  const available = [...arr];
  const result: T[] = [];
  let currentRng = rng;

  const n = Math.min(count, available.length);
  for (let i = 0; i < n; i++) {
    const { value: idx, rng: newRng } = nextInt(currentRng, 0, available.length - 1);
    result.push(available[idx]);
    available.splice(idx, 1);
    currentRng = newRng;
  }

  return { value: result, rng: currentRng };
}

/**
 * Generate random string of given length
 */
export function nextString(
  rng: RngState,
  length: number,
  charset?: string
): { value: string; rng: RngState } {
  const chars = charset ?? "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
  let result = "";
  let currentRng = rng;

  for (let i = 0; i < length; i++) {
    const { value: idx, rng: newRng } = nextInt(currentRng, 0, chars.length - 1);
    result += chars[idx];
    currentRng = newRng;
  }

  return { value: result, rng: currentRng };
}

/**
 * Weighted random selection
 */
export function selectWeighted<T>(
  rng: RngState,
  items: Array<{ item: T; weight: number }>
): { value: T | undefined; rng: RngState } {
  if (items.length === 0) {
    return { value: undefined, rng };
  }

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const { value: roll, rng: newRng } = nextFloat(rng);
  const target = roll * totalWeight;

  let cumulative = 0;
  for (const { item, weight } of items) {
    cumulative += weight;
    if (target < cumulative) {
      return { value: item, rng: newRng };
    }
  }

  return { value: items[items.length - 1].item, rng: newRng };
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
export function shuffle<T>(rng: RngState, arr: T[]): { value: T[]; rng: RngState } {
  const result = [...arr];
  let currentRng = rng;

  for (let i = result.length - 1; i > 0; i--) {
    const { value: j, rng: newRng } = nextInt(currentRng, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
    currentRng = newRng;
  }

  return { value: result, rng: currentRng };
}
