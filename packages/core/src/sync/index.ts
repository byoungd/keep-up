/**
 * LFCC v0.9 RC - Sync Module
 *
 * WebSocket synchronization for Loro + LFCC.
 */

// Client adapter
export {
  SyncClient,
  type SyncClientConfig,
  type SyncClientEvents,
  type SyncClientState,
} from "./client.js";

// Policy negotiation
export * from "./negotiate.js";
// Protocol types and utilities
export * from "./protocol.js";

// Server router
// Server router - REMOVED to avoid 'ws' dependency in browser bundles
// export { SyncServer, type ClientConnection, type PersistenceHooks, type SyncServerConfig, type WebSocketLike } from "./server.js";
