/**
 * Collaboration Permissions - Type Definitions
 *
 * Defines role types and error codes for the permission system.
 */

/** User role in a collaboration session */
export type Role = "editor" | "viewer";

export type ErrorCode =
  | "PERMISSION_DENIED"
  | "INVALID_TOKEN"
  | "UNKNOWN"
  | "RATE_LIMITED"
  | "BACKPRESSURE"
  | "QUOTA_EXCEEDED"
  | "UNAUTHORIZED";

/** All valid roles */
export const VALID_ROLES: readonly Role[] = ["editor", "viewer"] as const;

/** All valid error codes */
export const VALID_ERROR_CODES: readonly ErrorCode[] = [
  "PERMISSION_DENIED",
  "INVALID_TOKEN",
  "UNKNOWN",
  "RATE_LIMITED",
  "BACKPRESSURE",
  "QUOTA_EXCEEDED",
  "UNAUTHORIZED",
] as const;

/**
 * Type guard to check if a value is a valid Role
 */
export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && VALID_ROLES.includes(value as Role);
}

/**
 * Type guard to check if a value is a valid ErrorCode
 */
export function isValidErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && VALID_ERROR_CODES.includes(value as ErrorCode);
}
