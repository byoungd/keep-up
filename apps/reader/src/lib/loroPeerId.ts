const MAX_UINT64 = (1n << 64n) - 1n;

export function isValidLoroPeerId(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }
  try {
    const parsed = BigInt(value);
    return parsed >= 0n && parsed <= MAX_UINT64;
  } catch {
    return false;
  }
}

export function createNumericPeerId(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    return String(Date.now());
  }
  const values = new Uint32Array(2);
  cryptoApi.getRandomValues(values);
  const candidate = (BigInt(values[0]) << 32n) | BigInt(values[1]);
  const normalized = candidate === 0n ? 1n : candidate;
  return normalized.toString();
}
