/**
 * @ku0/collab-server
 *
 * Production-ready WebSocket collaboration server for LFCC.
 * Wraps @ku0/core SyncServer with JWT auth, file-system persistence,
 * and protocol version enforcement.
 */

export { CollabServer, type CollabServerConfig } from "./server";
export { SecureCollabServer, type SecureCollabServerConfig } from "./secureServer";
export { JwtAuthAdapter, type JwtAuthConfig } from "./auth";
export { FileSystemPersistenceAdapter } from "./persistence";
export { SUPPORTED_PROTOCOL_VERSIONS, isVersionSupported } from "./protocol/versionGuard";

// Phase 3: Permissions, Audit, and Observability
export * from "./permissions";
export * from "./auth/tokenResolver";
export * from "./auth/devTokenResolver";
export * from "./audit";
export * from "./metrics";
export * from "./api";
export { CollabRelay, type CollabRelayConfig, type CollabMessage } from "./collabRelay";

// Phase 4: Scale Hardening
export * from "./scale";

// Phase 5: AI Suggestions
export * from "./ai";

// WebSocket Security (P0.1)
export {
  WsSecurityMiddleware,
  type WsSecurityConfig,
  type ConnectionState,
  type ConnectionRateLimitConfig,
  type ConnectionTimeoutConfig,
  type SecurityAuditEvent,
  NextAuthProvider,
  createNextAuthProvider,
  type NextAuthProviderConfig,
  type NextAuthJwtPayload,
  type SessionAuthProvider,
  type SessionAuthResult,
  type AuthRole,
} from "./auth";
