export function jsonStringify(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Value is not JSON-serializable.");
  }
  return serialized;
}

export function jsonParse(text: string): unknown {
  return JSON.parse(text);
}

export function stableStringify(value: unknown): string {
  const serialized = JSON.stringify(sortJsonValue(value));
  if (serialized === undefined) {
    throw new Error("Value is not JSON-serializable.");
  }
  return serialized;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : sortJsonValue(entry)));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(record).sort();
    for (const key of keys) {
      const next = record[key];
      if (next === undefined) {
        continue;
      }
      sorted[key] = sortJsonValue(next);
    }
    return sorted;
  }

  return value;
}
