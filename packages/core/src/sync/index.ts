/**
 * LFCC v0.9 RC - Sync Module
 *
 * WebSocket synchronization for Loro + LFCC.
 */

// Protocol types and utilities
export * from "./protocol";

// Policy negotiation
export * from "./negotiate";

// Client adapter
export {
  SyncClient,
  type SyncClientConfig,
  type SyncClientEvents,
  type SyncClientState,
} from "./client";

// Server router
// Server router - REMOVED to avoid 'ws' dependency in browser bundles
// export { SyncServer, type ClientConnection, type PersistenceHooks, type SyncServerConfig, type WebSocketLike } from "./server";
