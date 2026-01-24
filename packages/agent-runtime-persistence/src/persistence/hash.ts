import { createHash } from "node:crypto";
import { stableStringify } from "@ku0/core";

const REDACTION_KEYS = new Set(["apikey", "token", "secret", "password"]);

export function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactPayload(item));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (REDACTION_KEYS.has(key.toLowerCase())) {
        output[key] = "[redacted]";
      } else {
        output[key] = redactPayload(entry);
      }
    }
    return output;
  }
  return value;
}

export function hashPayload(payload: unknown): string {
  const redacted = redactPayload(payload);
  const serialized = stableStringify(redacted) ?? JSON.stringify(redacted ?? null);
  return createHash("sha256").update(serialized).digest("hex");
}
