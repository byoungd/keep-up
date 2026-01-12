/**
 * Session Auth Provider - Pluggable Authentication Interface
 *
 * Defines a production-ready authentication interface that can be implemented
 * with different backends (JWT, OAuth, internal auth service, etc.).
 */

/** Role assigned to authenticated users */
export type AuthRole = "viewer" | "editor" | "admin";

/** Result of session authentication */
export interface SessionAuthResult {
  /** User identifier */
  userId: string;
  /** Assigned role for this session */
  role: AuthRole;
  /** Optional: restrict access to specific document IDs */
  allowedDocIds?: string[];
  /** Optional: team/organization identifier */
  teamId?: string;
  /** Optional: token expiration timestamp (Unix ms) */
  exp?: number;
  /** Optional: additional metadata */
  metadata?: Record<string, unknown>;
}

/** Error codes for authentication failures */
export type AuthErrorCode =
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "MISSING_TOKEN"
  | "INSUFFICIENT_PERMISSIONS"
  | "UNKNOWN";

/** Authentication failure result */
export interface SessionAuthFailure {
  /** Error code for the failure */
  code: AuthErrorCode;
  /** Human-readable message (for logging, not shown to users) */
  message: string;
  /** Whether client should retry with a new token */
  retryable: boolean;
}

/**
 * Session Auth Provider Interface
 *
 * Implementations validate tokens and extract user identity and role.
 * This interface is designed to be pluggable for different auth backends.
 *
 * @example
 * ```ts
 * // JWT implementation
 * class JwtSessionAuthProvider implements SessionAuthProvider {
 *   async validate(token: string): Promise<SessionAuthResult> {
 *     const payload = jwt.verify(token, secret);
 *     return {
 *       userId: payload.sub,
 *       role: payload.role,
 *       allowedDocIds: payload.docIds,
 *       exp: payload.exp * 1000,
 *     };
 *   }
 * }
 *
 * // Internal auth service implementation
 * class InternalAuthProvider implements SessionAuthProvider {
 *   async validate(token: string): Promise<SessionAuthResult> {
 *     const response = await fetch(authServiceUrl, {
 *       headers: { Authorization: `Bearer ${token}` }
 *     });
 *     return response.json();
 *   }
 * }
 * ```
 */
export interface SessionAuthProvider {
  /**
   * Validate a token and extract session information.
   *
   * @param token - The authentication token (JWT, session token, API key, etc.)
   * @returns Session information on success
   * @throws SessionAuthFailure on validation failure
   */
  validate(token: string): Promise<SessionAuthResult>;

  /**
   * Optional: Check if a token has been revoked.
   * Useful for implementing token blacklists.
   *
   * @param token - The token to check
   * @returns true if the token is revoked
   */
  isRevoked?(token: string): Promise<boolean>;

  /**
   * Optional: Refresh an expiring token.
   * Useful for long-lived sessions.
   *
   * @param token - The current token
   * @returns New token string, or null if refresh is not supported
   */
  refresh?(token: string): Promise<string | null>;
}

/**
 * Create a session auth failure error.
 */
export function createAuthFailure(
  code: AuthErrorCode,
  message: string,
  retryable = false
): SessionAuthFailure {
  return { code, message, retryable };
}

/**
 * Check if an error is a SessionAuthFailure.
 */
export function isAuthFailure(error: unknown): error is SessionAuthFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "retryable" in error
  );
}
