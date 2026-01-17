/**
 * Auth Module
 *
 * Exports token resolver interfaces and implementations.
 */

export { DevTokenResolver } from "./devTokenResolver";
export { JwtAuthAdapter, type JwtAuthConfig } from "./jwtAuth";
export {
  DevHmacAuthProvider,
  type JwtSessionAuthConfig,
  JwtSessionAuthProvider,
} from "./jwtSessionAuthProvider";
// NextAuth Provider
export {
  createNextAuthProvider,
  type NextAuthJwtPayload,
  NextAuthProvider,
  type NextAuthProviderConfig,
} from "./nextAuthProvider";
// Session Auth Provider (production-ready interface)
export type {
  AuthErrorCode,
  AuthRole,
  SessionAuthFailure,
  SessionAuthProvider,
  SessionAuthResult,
} from "./sessionAuthProvider";
export { createAuthFailure, isAuthFailure } from "./sessionAuthProvider";
export type {
  TokenPayload,
  TokenResolver,
  TokenResult,
  TokenResultInvalid,
  TokenResultValid,
} from "./tokenResolver";
// WebSocket Security Middleware
export {
  type ConnectionRateLimitConfig,
  type ConnectionState,
  type ConnectionTimeoutConfig,
  type SecurityAuditEvent,
  type WsSecurityConfig,
  WsSecurityMiddleware,
} from "./wsSecurityMiddleware";
