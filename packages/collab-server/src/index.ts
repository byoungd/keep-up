/**
 * @ku0/collab-server
 *
 * Production-ready WebSocket collaboration server for LFCC.
 * Wraps @ku0/core SyncServer with JWT auth, file-system persistence,
 * and protocol version enforcement.
 */

// Phase 5: AI Suggestions
export * from "./ai";
export * from "./api";
export * from "./audit";
// WebSocket Security (P0.1)
export {
  type AuthRole,
  type ConnectionRateLimitConfig,
  type ConnectionState,
  type ConnectionTimeoutConfig,
  createNextAuthProvider,
  JwtAuthAdapter,
  type JwtAuthConfig,
  type NextAuthJwtPayload,
  NextAuthProvider,
  type NextAuthProviderConfig,
  type SecurityAuditEvent,
  type SessionAuthProvider,
  type SessionAuthResult,
  type WsSecurityConfig,
  WsSecurityMiddleware,
} from "./auth";
export * from "./auth/devTokenResolver";
export * from "./auth/tokenResolver";
export { type CollabMessage, CollabRelay, type CollabRelayConfig } from "./collabRelay";
export * from "./metrics";
// Phase 3: Permissions, Audit, and Observability
export * from "./permissions";
export { FileSystemPersistenceAdapter } from "./persistence";
export { isVersionSupported, SUPPORTED_PROTOCOL_VERSIONS } from "./protocol/versionGuard";

// Phase 4: Scale Hardening
export * from "./scale";
export { SecureCollabServer, type SecureCollabServerConfig } from "./secureServer";
export { CollabServer, type CollabServerConfig } from "./server";
