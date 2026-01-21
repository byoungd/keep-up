export type ParityDiff = {
  label: string;
  expected: string;
  actual: string;
};

type ParityOptions<T> = {
  label?: string;
  normalize?: (value: T) => unknown;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${key}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function diffParity<T>(
  expected: T,
  actual: T,
  options: ParityOptions<T> = {}
): ParityDiff | null {
  const label = options.label ?? "parity";
  const normalizedExpected = options.normalize ? options.normalize(expected) : expected;
  const normalizedActual = options.normalize ? options.normalize(actual) : actual;

  const expectedSerialized = stableStringify(normalizedExpected);
  const actualSerialized = stableStringify(normalizedActual);

  if (expectedSerialized === actualSerialized) {
    return null;
  }

  return {
    label,
    expected: expectedSerialized,
    actual: actualSerialized,
  };
}

export function assertParity<T>(expected: T, actual: T, options: ParityOptions<T> = {}): void {
  const diff = diffParity(expected, actual, options);
  if (!diff) {
    return;
  }

  throw new Error(`${diff.label} mismatch\nexpected: ${diff.expected}\nactual: ${diff.actual}`);
}
