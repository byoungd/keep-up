/**
 * Auth Module
 *
 * Exports token resolver interfaces and implementations.
 */

export type {
  TokenResolver,
  TokenPayload,
  TokenResult,
  TokenResultValid,
  TokenResultInvalid,
} from "./tokenResolver";
export { DevTokenResolver } from "./devTokenResolver";
export { JwtAuthAdapter, type JwtAuthConfig } from "./jwtAuth";

// Session Auth Provider (production-ready interface)
export type {
  SessionAuthProvider,
  SessionAuthResult,
  SessionAuthFailure,
  AuthRole,
  AuthErrorCode,
} from "./sessionAuthProvider";
export { createAuthFailure, isAuthFailure } from "./sessionAuthProvider";
export {
  JwtSessionAuthProvider,
  DevHmacAuthProvider,
  type JwtSessionAuthConfig,
} from "./jwtSessionAuthProvider";

// WebSocket Security Middleware
export {
  WsSecurityMiddleware,
  type WsSecurityConfig,
  type ConnectionState,
  type ConnectionRateLimitConfig,
  type ConnectionTimeoutConfig,
  type SecurityAuditEvent,
} from "./wsSecurityMiddleware";

// NextAuth Provider
export {
  NextAuthProvider,
  createNextAuthProvider,
  type NextAuthProviderConfig,
  type NextAuthJwtPayload,
} from "./nextAuthProvider";
