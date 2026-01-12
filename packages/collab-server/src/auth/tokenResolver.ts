/**
 * Collaboration Permissions - Token Resolver Interface
 *
 * Defines the interface for resolving session tokens to user identity and role.
 * This abstraction allows pluggable authentication backends.
 */

import type { Role } from "../permissions/types";

/** Payload extracted from a valid token */
export type TokenPayload = {
  /** User identifier */
  userId: string;
  /** User role in the collaboration session */
  role: Role;
  /** Optional: restrict token to specific document */
  docId?: string;
  /** Optional: token expiration timestamp (Unix ms) */
  exp?: number;
};

/** Result of token resolution - success case */
export type TokenResultValid = {
  valid: true;
  payload: TokenPayload;
};

/** Result of token resolution - failure case */
export type TokenResultInvalid = {
  valid: false;
  error: "INVALID_TOKEN" | "UNKNOWN";
};

/** Discriminated union for token resolution result */
export type TokenResult = TokenResultValid | TokenResultInvalid;

/**
 * Token resolver interface.
 *
 * Implementations validate tokens and extract user identity and role.
 * The interface is designed to be pluggable for different auth backends.
 */
export interface TokenResolver {
  /**
   * Resolve a token to user identity and role.
   *
   * @param token - The token string (may be undefined for anonymous access)
   * @param docId - The document ID being accessed (for scope validation)
   * @returns Token resolution result
   */
  resolve(token: string | undefined, docId?: string): Promise<TokenResult>;
}
