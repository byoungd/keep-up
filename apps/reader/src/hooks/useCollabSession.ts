/**
 * useCollabSession - High-level collaboration session hook for Reader pages
 *
 * Orchestrates:
 * - Loro runtime initialization
 * - WebSocket sync connection (when collab_enabled)
 * - Presence management
 * - Connection state and lifecycle
 * - Invite token handling
 *
 * @packageDocumentation
 */

"use client";

import { type LoroRuntime, createLoroRuntime } from "@ku0/lfcc-bridge";
import { getFeatureFlag } from "@ku0/shared";
import * as React from "react";

import { type PresencePeer, usePresenceSummary } from "@/lib/lfcc/presenceStore";
import type { SyncClientState } from "@ku0/core";

import { useInviteToken } from "./useInviteToken";
import {
  type SyncErrorCode,
  getOrCreateReplicaId,
  useLoroWebSocketSync,
} from "./useLoroWebSocketSync";

// ============================================================================
// Types
// ============================================================================

/** Collaboration session state */
export type CollabSessionState =
  | "idle" // Not initialized
  | "connecting" // Establishing connection
  | "connected" // Active session
  | "reconnecting" // Recovering from disconnect
  | "disconnected" // Cleanly disconnected
  | "error" // Fatal error
  | "disabled"; // Feature flag OFF

/** Role assigned by the server */
export type CollabRole = "viewer" | "editor" | "admin" | null;

/** Error codes from server or token validation */
export type CollabErrorCode =
  | "PERMISSION_DENIED"
  | "INVALID_TOKEN"
  | "EXPIRED_TOKEN"
  | "RATE_LIMITED"
  | "OFFLINE"
  | "UNKNOWN";

function resolveUnauthorizedError(message: string | null): CollabErrorCode {
  const normalized = message?.toLowerCase() ?? "";
  return normalized.includes("expired") ? "EXPIRED_TOKEN" : "INVALID_TOKEN";
}

function resolveMessageError(message: string, state: CollabSessionState): CollabErrorCode {
  const normalized = message.toLowerCase();
  if (normalized.includes("permission_denied") || normalized.includes("permission denied")) {
    return "PERMISSION_DENIED";
  }
  if (normalized.includes("invalid_token") || normalized.includes("invalid token")) {
    return "INVALID_TOKEN";
  }
  if (normalized.includes("expired")) {
    return "EXPIRED_TOKEN";
  }
  if (normalized.includes("unauthorized")) {
    return "INVALID_TOKEN";
  }
  if (normalized.includes("rate_limited")) {
    return "RATE_LIMITED";
  }
  if (state === "disconnected") {
    return "OFFLINE";
  }
  return "UNKNOWN";
}

function resolveSyncErrorCode(
  errorCode: SyncErrorCode | null,
  message: string | null
): CollabErrorCode | null {
  if (!errorCode) {
    return null;
  }
  if (errorCode === "RATE_LIMITED") {
    return "RATE_LIMITED";
  }
  if (errorCode === "UNAUTHORIZED") {
    return resolveUnauthorizedError(message);
  }
  return null;
}

/** Collaboration session configuration */
export interface CollabSessionConfig {
  /** Document ID to collaborate on */
  docId: string;
  /** User display name (optional) */
  displayName?: string;
  /** WebSocket server URL (default: from env or ws://localhost:3030) */
  serverUrl?: string;
  /** JWT token for authentication (optional, overrides joinToken from URL) */
  token?: string;
  /** Callback when sync status changes */
  onSyncStatusChange?: (status: "syncing" | "connected" | "disconnected" | "reconnecting") => void;
}

/** Collaboration session result */
export interface CollabSessionResult {
  /** Current session state */
  state: CollabSessionState;
  /** Whether collaboration is enabled and active */
  isActive: boolean;
  /** Connection error message (if any) */
  error: string | null;
  /** Error code for specific error handling */
  errorCode: CollabErrorCode | null;
  /** Remote peers in the session */
  peers: PresencePeer[];
  /** Number of pending sync updates */
  pendingUpdates: number;
  /** Last successful sync timestamp */
  lastSyncAt: number | null;
  /** Server-assigned session ID */
  sessionId: string | null;
  /** User's role in the session */
  role: CollabRole;
  /** Whether user is in viewer (read-only) mode */
  isViewer: boolean;
  /** Local client ID */
  clientId: string;
  /** Loro runtime instance (for advanced use) */
  runtime: LoroRuntime | null;
  /** Retry connection manually */
  retry: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * High-level collaboration session hook.
 *
 * Usage:
 * ```tsx
 * function ReaderPage({ docId }: { docId: string }) {
 *   const collab = useCollabSession({ docId, displayName: "Alice" });
 *
 *   if (collab.state === "disabled") {
 *     return <SingleUserReader docId={docId} />;
 *   }
 *
 *   return (
 *     <>
 *       <PresenceIndicator peers={collab.peers} state={collab.state} />
 *       <CollaborativeEditor runtime={collab.runtime} />
 *     </>
 *   );
 * }
 * ```
 */
export function useCollabSession(config: CollabSessionConfig): CollabSessionResult {
  const { docId, displayName, serverUrl, token, onSyncStatusChange } = config;

  // Check feature flag
  const isCollabEnabled = getFeatureFlag("collab_enabled");

  // Parse invite token from URL
  const { parsedToken } = useInviteToken();

  // Determine effective token (explicit token takes precedence)
  const effectiveToken = React.useMemo(() => {
    if (token) {
      return token;
    }
    if (parsedToken.valid) {
      return parsedToken.token;
    }
    return undefined;
  }, [token, parsedToken]);

  // Track token-related errors
  const [tokenError, setTokenError] = React.useState<CollabErrorCode | null>(null);

  // Check for token errors on mount
  React.useEffect(() => {
    if (!parsedToken.valid && parsedToken.error !== "NO_TOKEN") {
      setTokenError(parsedToken.error as CollabErrorCode);
    } else {
      setTokenError(null);
    }
  }, [parsedToken]);

  // Runtime state
  const [runtime, setRuntime] = React.useState<LoroRuntime | null>(null);
  const [retryTrigger, setRetryTrigger] = React.useState(0);

  // Get client ID (stable across reloads)
  const clientId = React.useMemo(() => getOrCreateReplicaId(), []);

  // Resolve WebSocket URL
  const wsUrl = React.useMemo(() => {
    if (serverUrl) {
      return serverUrl;
    }
    if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL;
    }
    return "ws://localhost:3030";
  }, [serverUrl]);

  // Initialize Loro runtime when collab is enabled
  // biome-ignore lint/correctness/useExhaustiveDependencies: docId and retryTrigger are intentional dependencies to reset runtime on doc change or retry
  React.useEffect(() => {
    if (!isCollabEnabled) {
      setRuntime(null);
      return;
    }

    const rt = createLoroRuntime({ peerId: clientId as `${number}` });
    setRuntime(rt);

    return () => {
      setRuntime(null);
    };
  }, [isCollabEnabled, clientId, docId, retryTrigger]);

  // WebSocket sync (only when enabled and runtime exists)
  const syncResult = useLoroWebSocketSync(isCollabEnabled ? runtime : null, {
    serverUrl: wsUrl,
    docId,
    displayName,
    enabled: isCollabEnabled && runtime !== null && !tokenError,
    token: effectiveToken,
    onSyncStatusChange,
  });

  // Get presence from store
  const { peers } = usePresenceSummary();

  // Compute session state from sync state
  const state = React.useMemo<CollabSessionState>(() => {
    if (!isCollabEnabled) {
      return "disabled";
    }
    if (tokenError) {
      return "error";
    }
    if (!runtime) {
      return "idle";
    }
    return mapSyncState(syncResult.connectionState);
  }, [isCollabEnabled, runtime, syncResult.connectionState, tokenError]);

  // Compute error code
  const errorCode = React.useMemo<CollabErrorCode | null>(() => {
    if (tokenError) {
      return tokenError;
    }
    const syncCode = resolveSyncErrorCode(syncResult.errorCode, syncResult.error ?? null);
    if (syncCode) {
      return syncCode;
    }
    if (syncResult.error) {
      return resolveMessageError(syncResult.error, state);
    }
    if (state === "disconnected") {
      return "OFFLINE";
    }
    return null;
  }, [tokenError, syncResult.error, syncResult.errorCode, state]);

  // Retry handler
  const retry = React.useCallback(() => {
    setTokenError(null);
    setRetryTrigger((prev) => prev + 1);
  }, []);

  // Determine if user is in viewer mode
  const isViewer = syncResult.role === "viewer";

  return {
    state,
    isActive: state === "connected",
    error: tokenError ? `Token error: ${tokenError}` : syncResult.error,
    errorCode,
    peers,
    pendingUpdates: syncResult.pendingUpdates,
    lastSyncAt: syncResult.lastSyncAt,
    sessionId: syncResult.sessionId,
    role: syncResult.role,
    isViewer,
    clientId,
    runtime,
    retry,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Map SyncClient state to CollabSessionState */
function mapSyncState(syncState: SyncClientState): CollabSessionState {
  switch (syncState) {
    case "connected":
      return "connected";
    case "connecting":
    case "handshaking":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
      return "disconnected";
    case "error":
      return "error";
    default:
      return "idle";
  }
}
