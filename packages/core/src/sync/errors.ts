import type { ErrorCategory, ErrorCode, ErrorPayload } from "./protocol.js";

type ErrorDescriptor = {
  category: ErrorCategory;
  retryable: boolean;
};

type ErrorPayloadOptions = {
  retryable?: boolean;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
};

const ERROR_CATALOG: Record<ErrorCode, ErrorDescriptor> = {
  INVALID_MESSAGE: { category: "validation", retryable: false },
  POLICY_MISMATCH: { category: "policy", retryable: false },
  ERR_POLICY_INCOMPATIBLE: { category: "policy", retryable: false },
  FRONTIER_CONFLICT: { category: "conflict", retryable: true },
  UPDATE_TOO_LARGE: { category: "validation", retryable: false },
  PAYLOAD_TOO_LARGE: { category: "validation", retryable: false },
  RATE_LIMITED: { category: "rate_limit", retryable: true },
  UNAUTHORIZED: { category: "auth", retryable: false },
  ROOM_FULL: { category: "capacity", retryable: true },
  DOC_NOT_FOUND: { category: "not_found", retryable: false },
  HANDSHAKE_TIMEOUT: { category: "timeout", retryable: true },
  IDLE_TIMEOUT: { category: "timeout", retryable: true },
  INTERNAL_ERROR: { category: "internal", retryable: false },
};

const DEFAULT_DETAIL_LIMITS = {
  maxKeys: 12,
  maxDepth: 3,
  maxArrayLength: 20,
  maxStringLength: 200,
};

type DetailLimits = typeof DEFAULT_DETAIL_LIMITS;

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function sanitizeValue(value: unknown, depth: number, limits: DetailLimits): unknown {
  if (depth > limits.maxDepth) {
    return "[truncated]";
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return truncateString(value, limits.maxStringLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, limits.maxArrayLength)
      .map((entry) => sanitizeValue(entry, depth + 1, limits));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message, limits.maxStringLength),
    };
  }

  if (typeof value === "object") {
    return sanitizeRecord(value as Record<string, unknown>, depth + 1, limits);
  }

  return truncateString(String(value), limits.maxStringLength);
}

function sanitizeRecord(
  record: Record<string, unknown>,
  depth: number,
  limits: DetailLimits
): Record<string, unknown> {
  const entries = Object.entries(record).slice(0, limits.maxKeys);
  const output: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    output[key] = sanitizeValue(value, depth, limits);
  }

  return output;
}

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }
  const sanitized = sanitizeRecord(details, 0, DEFAULT_DETAIL_LIMITS);
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function normalizeRetryAfterMs(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.ceil(value);
}

export function buildErrorPayload(
  code: ErrorCode,
  message: string,
  options: ErrorPayloadOptions = {}
): ErrorPayload {
  const descriptor = ERROR_CATALOG[code];
  const retryable = options.retryable ?? descriptor.retryable;
  const retryAfterMs = normalizeRetryAfterMs(options.retryAfterMs);
  const details = sanitizeDetails(options.details);

  return {
    code,
    category: descriptor.category,
    message,
    retryable,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(details ? { details } : {}),
  };
}
