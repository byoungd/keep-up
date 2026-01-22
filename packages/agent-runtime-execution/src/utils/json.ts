import { parse, stableStringify, stringify } from "@ku0/json-accel-rs";

export function fastJsonStringify(value: unknown): string | undefined {
  try {
    return stringify(value);
  } catch {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
}

export function fastJsonParse<T>(text: string): T {
  try {
    return parse(text) as T;
  } catch {
    return JSON.parse(text) as T;
  }
}

export function stableJsonStringify(value: unknown): string {
  try {
    return stableStringify(value);
  } catch {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error("Value is not JSON-serializable.");
    }
    return serialized;
  }
}
