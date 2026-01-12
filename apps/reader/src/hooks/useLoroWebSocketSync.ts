/**
 * useLoroWebSocketSync - WebSocket-based sync for Loro documents
 *
 * Integrates @keepup/core SyncClient with the React app.
 */

import {
  type ErrorCode,
  LfccError,
  type LfccErrorCode,
  type PolicyManifestV09,
  SyncClient,
  type SyncClientState,
  createDefaultSyncManifest,
} from "@keepup/core";
import {
  AI_COMMIT_ORIGIN_PREFIX,
  type DegradationStep,
  type LoroRuntime,
  degradationPath,
} from "@keepup/lfcc-bridge";
import * as React from "react";

import { usePresenceStore } from "@/lib/lfcc/presenceStore";
import { DEFAULT_PRESENCE_COLOR, getRandomPresenceColor } from "@/lib/theme/presenceColors";

export interface WebSocketSyncOptions {
  /** WebSocket server URL (e.g., ws://localhost:3030) */
  serverUrl: string;
  /** Document ID */
  docId: string;
  /** User display name */
  displayName?: string;
  /** Enable sync (default: true) */
  enabled?: boolean;
  /** JWT token for authentication */
  token?: string;
  /** COLLAB-003: Callback for sync status changes (for toast notifications) */
  onSyncStatusChange?: (status: "syncing" | "connected" | "disconnected" | "reconnecting") => void;
}

export interface WebSocketSyncState {
  /** Connection state */
  connectionState: SyncClientState;
  /** Session ID (assigned by server) */
  sessionId: string | null;
  /** Role assigned by the server */
  role: "viewer" | "editor" | "admin" | null;
  /** Remote peers' presence */
  peers: Array<{
    clientId: string;
    displayName: string;
    color: string;
    lastSeen?: number;
    cursor?: { blockId: string; offset: number };
  }>;
  /** Error message if any */
  error: string | null;
  /** Error code if provided by sync protocol */
  errorCode: SyncErrorCode | null;
  /** Pending updates awaiting ack */
  pendingUpdates: number;
  /** Last successful sync time (ms) */
  lastSyncAt: number | null;
  /** Local client id */
  clientId: string;
  /** Document id */
  docId: string;
  /** Effective policy manifest from sync negotiation */
  effectiveManifest: PolicyManifestV09 | null;
  /** Whether the effective manifest is more restrictive than local preference */
  policyDegraded: boolean;
  /** Reasons/fields for policy degradation */
  policyDegradation: DegradationStep[];
}

export interface WebSocketSyncResult extends WebSocketSyncState {
  /** Send local cursor position (throttled) */
  sendCursor: (blockId: string, offset: number) => void;
}

export type SyncErrorCode = ErrorCode | LfccErrorCode;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions (extracted for complexity reduction)
// ─────────────────────────────────────────────────────────────────────────────

/** Check if catch-up is needed based on frontier tags */
function needsCatchUp(serverFrontierTag: string, localFrontierTag: string): boolean {
  return serverFrontierTag !== "0" && localFrontierTag !== serverFrontierTag;
}

/** Compute degradation from manifests */
function computeDegradation(
  client: SyncClient,
  localManifest: PolicyManifestV09
): { degraded: boolean; steps: DegradationStep[] } {
  const effectiveManifest = client.getEffectiveManifest();
  return effectiveManifest
    ? degradationPath(localManifest, effectiveManifest)
    : { degraded: false, steps: [] };
}

function shouldSkipLocalUpdate(
  client: SyncClient,
  syncCrashedRef: React.MutableRefObject<boolean>,
  pendingResyncRef: React.MutableRefObject<boolean>,
  catchUpPendingRef: React.MutableRefObject<boolean>
): boolean {
  if (client.getState() !== "connected") {
    return true;
  }
  if (syncCrashedRef.current) {
    return true;
  }
  if (pendingResyncRef.current || catchUpPendingRef.current) {
    return true;
  }
  return client.getRole() === "viewer";
}

function resolveUpdateOrigin(origin: string): string | undefined {
  return origin.startsWith(AI_COMMIT_ORIGIN_PREFIX) ? origin : undefined;
}

function resolveSyncErrorCode(error: unknown): SyncErrorCode | null {
  if (error instanceof LfccError) {
    return error.code as SyncErrorCode;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === "string") {
      return code as SyncErrorCode;
    }
  }
  return null;
}

export function useLoroWebSocketSync(
  runtime: LoroRuntime | null,
  options: WebSocketSyncOptions
): WebSocketSyncResult {
  const { serverUrl, docId, displayName = "Anonymous", enabled = true, token } = options;

  // Persist replica ID in localStorage for stability across reloads
  const clientIdRef = React.useRef(getOrCreateReplicaId());
  const pendingSeqRef = React.useRef<Set<number>>(new Set());
  const lastSyncAtRef = React.useRef<number | null>(null);
  const syncCrashedRef = React.useRef(false);
  const remoteUpdateSeqRef = React.useRef(0);
  const localUpdateSeqRef = React.useRef(0);

  const [state, setState] = React.useState<WebSocketSyncState>({
    connectionState: "disconnected",
    sessionId: null,
    role: null,
    peers: [],
    error: null,
    errorCode: null,
    pendingUpdates: 0,
    lastSyncAt: null,
    clientId: clientIdRef.current,
    docId,
    effectiveManifest: null,
    policyDegraded: false,
    policyDegradation: [],
  });

  const clientRef = React.useRef<SyncClient | null>(null);
  const localManifestRef = React.useRef<PolicyManifestV09>(createDefaultSyncManifest());
  const pendingResyncRef = React.useRef(false);
  const catchUpPendingRef = React.useRef(false);
  const resetPendingState = React.useCallback(() => {
    pendingResyncRef.current = false;
    catchUpPendingRef.current = false;
  }, []);

  const pushSnapshotIfDirty = React.useCallback(
    (snapshot: Uint8Array, client: SyncClient) => {
      if (client.getRole() === "viewer") {
        return;
      }
      if (snapshot.length === 0) {
        return;
      }
      const localFrontier = getDocFrontierTag(runtime?.doc);
      const lastKnownFrontier = client.getLastFrontierTag() ?? "0";

      // If local state differs from last synced state, push immediately
      if (localFrontier !== lastKnownFrontier) {
        const seq = client.sendUpdate(snapshot, localFrontier, lastKnownFrontier);
        pendingSeqRef.current.add(seq);
        setState((prev) => ({ ...prev, pendingUpdates: pendingSeqRef.current.size }));
      }

      client.setLastFrontierTag(localFrontier);
    },
    [runtime]
  );

  const pushSnapshotIfDirtySafe = React.useCallback(
    (stage: string, client: SyncClient) => {
      let snapshot: Uint8Array;
      try {
        snapshot = runtime?.doc.export({ mode: "snapshot" }) ?? new Uint8Array();
      } catch (err) {
        console.error("[WS Sync] Error exporting snapshot:", { stage, err });
        return;
      }
      pushSnapshotIfDirty(snapshot, client);
    },
    [pushSnapshotIfDirty, runtime]
  );

  React.useEffect(() => {
    if (!runtime || !enabled) {
      return;
    }

    syncCrashedRef.current = false;
    lastSyncAtRef.current = null;
    remoteUpdateSeqRef.current = 0;
    localUpdateSeqRef.current = 0;

    const wsUrl = `${serverUrl}?docId=${encodeURIComponent(docId)}`;

    // Only create client once per session configuration
    const client = new SyncClient({
      url: wsUrl,
      docId,
      clientId: clientIdRef.current,
      policyManifest: localManifestRef.current,
      userMeta: {
        userId: clientIdRef.current,
        displayName: displayName || "Anonymous",
        color: generateColor(),
      },
      token,
      reconnect: {
        enabled: true,
        maxAttempts: -1, // Infinite retry
        baseDelayMs: 1000,
        maxDelayMs: 10000,
      },
    });

    const formatError = (err: unknown): { message: string; name?: string; stack?: string } => {
      if (err instanceof Error) {
        return { message: err.message, name: err.name, stack: err.stack };
      }
      return { message: String(err) };
    };

    const buildSyncContext = (extra: Record<string, unknown> = {}) => ({
      docId,
      clientId: clientIdRef.current,
      sessionId: client.getSessionId(),
      connectionState: client.getState(),
      pendingUpdates: pendingSeqRef.current.size,
      lastSyncAt: lastSyncAtRef.current,
      lastFrontierTag: client.getLastFrontierTag(),
      remoteUpdateSeq: remoteUpdateSeqRef.current,
      localUpdateSeq: localUpdateSeqRef.current,
      ...extra,
    });

    const reportSyncCrash = (source: string, err: unknown, extra: Record<string, unknown> = {}) => {
      if (syncCrashedRef.current) {
        return;
      }
      syncCrashedRef.current = true;
      const errorInfo = formatError(err);
      console.error("[WS Sync] Fatal sync crash", {
        source,
        ...buildSyncContext(extra),
        error: errorInfo,
      });
      setState((prev) => ({
        ...prev,
        connectionState: "error",
        error: `Sync crashed: ${errorInfo.message}`,
        errorCode: resolveSyncErrorCode(err),
      }));
      client.disconnect();
    };

    clientRef.current = client;

    // Event handlers
    client.on("stateChange", (connectionState) => {
      if (syncCrashedRef.current) {
        return;
      }
      setState((prev) => ({ ...prev, connectionState }));
      // COLLAB-003: Invoke callback for recovery feedback
      if (connectionState === "connecting") {
        options.onSyncStatusChange?.("syncing");
      } else if (connectionState === "reconnecting") {
        options.onSyncStatusChange?.("reconnecting");
      }
    });

    const handleConnected = (sessionId: string) => {
      if (syncCrashedRef.current) {
        return;
      }
      pendingSeqRef.current.clear();
      resetPendingState();
      lastSyncAtRef.current = Date.now();

      const degradation = computeDegradation(client, localManifestRef.current);
      const effectiveManifest = client.getEffectiveManifest();
      const role = client.getRole();

      setState((prev) => ({
        ...prev,
        sessionId,
        role,
        error: null,
        errorCode: null,
        pendingUpdates: 0,
        lastSyncAt: lastSyncAtRef.current,
        effectiveManifest,
        policyDegraded: degradation.degraded,
        policyDegradation: degradation.steps,
      }));

      // COLLAB-003: Notify connected (recovered)
      options.onSyncStatusChange?.("connected");

      // Send initial presence
      client.sendPresence(undefined, undefined, "active");

      const serverFrontierTag = client.getServerFrontierTag() ?? "0";
      const localFrontierTag = getDocFrontierTag(runtime.doc);

      if (needsCatchUp(serverFrontierTag, localFrontierTag)) {
        pendingResyncRef.current = true;
        catchUpPendingRef.current = true;
        client.requestCatchUp(true);
        return;
      }

      if (serverFrontierTag !== "0") {
        client.setLastFrontierTag(serverFrontierTag);
      }

      // Drain local changes on reconnect (D1: Offline Drain)
      let snapshot: Uint8Array;
      try {
        snapshot = runtime.doc.export({ mode: "snapshot" });
      } catch (err) {
        reportSyncCrash("exportSnapshot", err, { stage: "connected" });
        return;
      }
      pushSnapshotIfDirty(snapshot, client);
    };
    client.on("connected", handleConnected);

    client.on("disconnected", (reason) => {
      if (syncCrashedRef.current) {
        return;
      }
      pendingSeqRef.current.clear();
      pendingResyncRef.current = false;
      catchUpPendingRef.current = false;
      setState((prev) => ({
        ...prev,
        connectionState: "disconnected",
        error: `Disconnected: ${reason}`,
        errorCode: null,
        pendingUpdates: 0,
      }));
      usePresenceStore.getState().setPresence({ selfId: clientIdRef.current, peers: [] });

      // COLLAB-003: Notify disconnected
      options.onSyncStatusChange?.("disconnected");
    });

    client.on("error", (error) => {
      if (syncCrashedRef.current) {
        return;
      }
      setState((prev) => ({
        ...prev,
        error: error.message,
        errorCode: resolveSyncErrorCode(error),
      }));
    });

    client.on("remoteUpdate", (update, frontierTag) => {
      // console.log(`[WS Sync] Received remote update. Size: ${update.length}`);
      if (syncCrashedRef.current) {
        return;
      }
      remoteUpdateSeqRef.current += 1;
      try {
        // Apply remote update to local Loro doc
        runtime.doc.import(update);
      } catch (err) {
        reportSyncCrash("remoteUpdate", err, {
          frontierTag,
          updateBytes: update.length,
          updateSeq: remoteUpdateSeqRef.current,
        });
      }
    });

    client.on("presenceUpdate", (presences) => {
      // console.log("[WS Sync] presenceUpdate", presences);
      if (syncCrashedRef.current) {
        return;
      }
      const peers = presences
        .filter((p) => p.clientId !== clientIdRef.current)
        .map((p) => {
          let lastSeen: number | undefined;
          if (p.presence.lastActivity) {
            const parsed = Date.parse(p.presence.lastActivity);
            if (!Number.isNaN(parsed)) {
              lastSeen = parsed;
            }
          }
          return {
            clientId: p.clientId,
            displayName: p.presence.userMeta?.displayName ?? "Unknown",
            color: p.presence.userMeta?.color ?? DEFAULT_PRESENCE_COLOR,
            lastSeen,
            cursor: p.presence.cursor
              ? {
                  blockId: p.presence.cursor.blockId,
                  offset: p.presence.cursor.offset,
                }
              : undefined,
          };
        });

      setState((prev) => ({ ...prev, peers }));
      usePresenceStore.getState().setPresence({ selfId: clientIdRef.current, peers });
    });

    client.on("updateAck", (seq, applied, reason) => {
      if (syncCrashedRef.current) {
        return;
      }
      pendingSeqRef.current.delete(seq);
      if (!applied && reason?.toLowerCase().includes("handshake")) {
        // Force reconnect to retry handshake and avoid stale pending state.
        pendingSeqRef.current.clear();
        client.disconnect();
        client.connect().catch(() => {
          /* best-effort */
        });
        return;
      }
      if (applied) {
        lastSyncAtRef.current = Date.now();
      }
      setState((prev) => ({
        ...prev,
        pendingUpdates: pendingSeqRef.current.size,
        lastSyncAt: applied ? lastSyncAtRef.current : prev.lastSyncAt,
      }));

      if (!applied && shouldRequestCatchUp(reason) && !catchUpPendingRef.current) {
        pendingResyncRef.current = true;
        catchUpPendingRef.current = true;
        client.requestCatchUp(true);
      }
    });

    const handleCatchUpComplete = () => {
      if (syncCrashedRef.current) {
        return;
      }
      catchUpPendingRef.current = false;
      lastSyncAtRef.current = Date.now();
      setState((prev) => ({
        ...prev,
        lastSyncAt: lastSyncAtRef.current,
      }));

      if (!pendingResyncRef.current) {
        return;
      }

      pendingResyncRef.current = false;
      if (client.getState() !== "connected") {
        return;
      }

      pushSnapshotIfDirtySafe("catchUpComplete", client);
    };
    client.on("catchUpComplete", handleCatchUpComplete);

    // PERF-002: Subscribe to local updates (incremental, not full snapshot)
    // This eliminates O(N) overhead per change
    const unsubscribe = runtime.onLocalUpdateWithOrigin(
      (updateBytes: Uint8Array, origin: string) => {
        if (shouldSkipLocalUpdate(client, syncCrashedRef, pendingResyncRef, catchUpPendingRef)) {
          return;
        }

        const frontierTag = getDocFrontierTag(runtime.doc);
        const parentTag = client.getLastFrontierTag() ?? "0";
        const updateOrigin = resolveUpdateOrigin(origin);

        // console.log(`[WS Sync] Sending incremental update. Size: ${updateBytes.length}`);
        localUpdateSeqRef.current += 1;
        const seq = client.sendUpdate(updateBytes, frontierTag, parentTag, updateOrigin);
        pendingSeqRef.current.add(seq);
        setState((prev) => ({ ...prev, pendingUpdates: pendingSeqRef.current.size }));
        client.setLastFrontierTag(frontierTag);
      }
    );

    // Handle network interruptions immediately
    const handleOnline = () => {
      if (syncCrashedRef.current) {
        return;
      }
      if (client.getState() === "disconnected" || client.getState() === "error") {
        client.connect().catch((err) => {
          console.error("[WS Sync] Reconnect failed:", err);
        });
      }
    };

    const handleOffline = () => {
      client.disconnect();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    // Connect
    client.connect().catch((err) => {
      console.error("[WS Sync] Connection failed:", err);
    });

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
      syncCrashedRef.current = false;
      unsubscribe();
      client.off("connected", handleConnected);
      client.off("catchUpComplete", handleCatchUpComplete);
      client.disconnect();
      clientRef.current = null;
      usePresenceStore.getState().setPresence({ selfId: clientIdRef.current, peers: [] });
    };
  }, [
    runtime,
    serverUrl,
    docId,
    displayName,
    enabled,
    token,
    options.onSyncStatusChange,
    resetPendingState,
    pushSnapshotIfDirty,
    pushSnapshotIfDirtySafe,
  ]);

  // Throttled cursor sender
  const lastCursorRef = React.useRef<{ blockId: string; offset: number } | null>(null);
  const throttleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendCursor = React.useCallback((blockId: string, offset: number) => {
    // console.log(`[WS Sync] sendCursor called: ${blockId}:${offset}`);
    lastCursorRef.current = { blockId, offset };

    // Throttle to 150ms per D3 spec
    if (throttleRef.current) {
      return;
    }

    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      const client = clientRef.current;
      const cursor = lastCursorRef.current;
      if (client && cursor && client.getState() === "connected") {
        client.sendPresence(
          { blockId: cursor.blockId, offset: cursor.offset },
          undefined,
          "active"
        );
      }
    }, 150);
  }, []);

  // Cleanup throttle timer
  React.useEffect(() => {
    return () => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
    };
  }, []);

  return { ...state, sendCursor };
}

// ============================================================================
// Utilities
// ============================================================================

function generateColor(): string {
  return getRandomPresenceColor();
}

function getDocFrontierTag(doc: LoroRuntime["doc"] | null | undefined): string {
  if (!doc) {
    return "0";
  }
  const frontiers = doc.frontiers();
  if (!frontiers || frontiers.length === 0) {
    return "0";
  }
  const entries = frontiers.map((frontier) => `${String(frontier.peer)}:${frontier.counter}`);
  entries.sort();
  return entries.join("|");
}

function shouldRequestCatchUp(reason?: string): boolean {
  if (!reason) {
    return false;
  }
  const normalized = reason.toLowerCase();
  return normalized.includes("frontier conflict") || normalized.includes("catch up");
}

export const REPLICA_ID_KEY = "lfcc-replica-id";

export function getOrCreateReplicaId(): string {
  if (typeof window === "undefined") {
    // SSR: return empty, will be set on client
    return "";
  }
  let id = localStorage.getItem(REPLICA_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(REPLICA_ID_KEY, id);
  }
  return id;
}
