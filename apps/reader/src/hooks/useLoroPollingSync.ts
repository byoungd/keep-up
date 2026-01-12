/**
 * useLoroPollingSync - HTTP polling sync for Loro documents
 *
 * Provides a serverless-friendly fallback when WebSockets are unavailable.
 */

import {
  type PolicyManifestV09,
  type SyncClientState,
  createDefaultSyncManifest,
} from "@keepup/core";
import {
  AI_COMMIT_ORIGIN_PREFIX,
  type DegradationStep,
  type LoroRuntime,
} from "@keepup/lfcc-bridge";
import * as React from "react";

import { getOrCreateReplicaId } from "@/hooks/useLoroWebSocketSync";

export interface PollingSyncOptions {
  /** HTTP server URL (e.g., http://localhost:3030) */
  serverUrl: string;
  /** Document ID */
  docId: string;
  /** JWT token for authentication */
  token?: string;
  /** Enable sync (default: true) */
  enabled?: boolean;
  /** Poll interval in ms (default: 2500) */
  pollIntervalMs?: number;
  /** Callback for sync status changes */
  onSyncStatusChange?: (status: "syncing" | "connected" | "disconnected" | "reconnecting") => void;
}

export interface PollingSyncState {
  connectionState: SyncClientState;
  sessionId: string | null;
  role: "viewer" | "editor" | "admin" | null;
  peers: Array<{
    clientId: string;
    displayName: string;
    color: string;
    lastSeen?: number;
    cursor?: { blockId: string; offset: number };
  }>;
  error: string | null;
  pendingUpdates: number;
  lastSyncAt: number | null;
  clientId: string;
  docId: string;
  effectiveManifest: PolicyManifestV09 | null;
  policyDegraded: boolean;
  policyDegradation: DegradationStep[];
}

export interface PollingSyncResult extends PollingSyncState {
  sendCursor: (blockId: string, offset: number) => void;
}

type PullResponse =
  | {
      ok: true;
      hasUpdates: boolean;
      frontierTag: string;
      role?: "viewer" | "editor" | "admin";
      isSnapshot?: boolean;
      dataB64?: string;
      updateCount?: number;
    }
  | { ok: false; error: string };

type PushResponse =
  | {
      ok: true;
      applied: boolean;
      serverFrontierTag: string;
      role?: "viewer" | "editor" | "admin";
      rejectionReason?: string;
    }
  | { ok: false; error: string };

const DEFAULT_POLL_INTERVAL_MS = 2500;
type SyncRole = "viewer" | "editor" | "admin" | null;

export function useLoroPollingSync(
  runtime: LoroRuntime | null,
  options: PollingSyncOptions
): PollingSyncResult {
  const { serverUrl, docId, token, enabled = true, pollIntervalMs, onSyncStatusChange } = options;

  const clientIdRef = React.useRef(getOrCreateReplicaId());
  const lastFrontierTagRef = React.useRef("0");
  const pendingUpdatesRef = React.useRef(0);
  const lastSyncAtRef = React.useRef<number | null>(null);
  const isPollingRef = React.useRef(false);
  const forceSnapshotRef = React.useRef(false);
  const roleRef = React.useRef<SyncRole>(null);

  const localManifestRef = React.useRef<PolicyManifestV09>(createDefaultSyncManifest());

  const [state, setState] = React.useState<PollingSyncState>({
    connectionState: "disconnected",
    sessionId: null,
    role: null,
    peers: [],
    error: null,
    pendingUpdates: 0,
    lastSyncAt: null,
    clientId: clientIdRef.current,
    docId,
    effectiveManifest: localManifestRef.current,
    policyDegraded: false,
    policyDegradation: [],
  });

  const sendCursor = React.useCallback((_blockId: string, _offset: number) => {
    // Polling transport does not support presence.
  }, []);

  const setConnectionState = React.useCallback((connectionState: SyncClientState) => {
    setState((prev) =>
      prev.connectionState === connectionState ? prev : { ...prev, connectionState }
    );
  }, []);

  const resolveRole = React.useCallback((payloadRole?: SyncRole) => {
    const nextRole = payloadRole ?? roleRef.current;
    roleRef.current = nextRole ?? null;
    return roleRef.current;
  }, []);

  const setConnectingState = React.useCallback(() => {
    if (state.connectionState !== "disconnected") {
      return;
    }
    setConnectionState("connecting");
    onSyncStatusChange?.("syncing");
  }, [onSyncStatusChange, setConnectionState, state.connectionState]);

  const requestPull = React.useCallback(
    async (preferSnapshot?: boolean): Promise<PullResponse> => {
      const response = await fetch(`${serverUrl.replace(/\/$/, "")}/sync/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId,
          fromFrontierTag: lastFrontierTagRef.current,
          preferSnapshot: preferSnapshot ?? forceSnapshotRef.current,
          token,
          clientId: clientIdRef.current,
        }),
      });

      return (await response.json()) as PullResponse;
    },
    [docId, serverUrl, token]
  );

  const applyPullPayload = React.useCallback(
    (payload: PullResponse) => {
      if (!runtime || !payload.ok) {
        return;
      }

      const role = resolveRole(payload.role);
      const hasUpdateData = Boolean(payload.hasUpdates && payload.dataB64);

      if (hasUpdateData && payload.dataB64) {
        const bytes = decodeBase64(payload.dataB64);
        if (bytes.length > 0) {
          runtime.doc.import(bytes);
        }
        lastSyncAtRef.current = Date.now();
        forceSnapshotRef.current = false;
      }

      lastFrontierTagRef.current = payload.frontierTag;
      setState((prev) => ({
        ...prev,
        connectionState: "connected",
        error: null,
        role,
        lastSyncAt: hasUpdateData ? lastSyncAtRef.current : prev.lastSyncAt,
      }));
    },
    [resolveRole, runtime]
  );

  const pollOnce = React.useCallback(
    async (preferSnapshot?: boolean) => {
      if (!runtime || !enabled || isPollingRef.current) {
        return;
      }
      isPollingRef.current = true;

      try {
        setConnectingState();
        const payload = await requestPull(preferSnapshot);
        if (!payload.ok) {
          throw new Error(payload.error);
        }
        applyPullPayload(payload);
        onSyncStatusChange?.("connected");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Polling sync failed";
        setState((prev) => ({
          ...prev,
          connectionState: prev.connectionState === "connected" ? "reconnecting" : "error",
          error: message,
        }));
        onSyncStatusChange?.("reconnecting");
      } finally {
        isPollingRef.current = false;
      }
    },
    [applyPullPayload, enabled, onSyncStatusChange, requestPull, runtime, setConnectingState]
  );

  const requestPush = React.useCallback(
    async (
      updateBytes: Uint8Array,
      frontierTag: string,
      parentTag: string,
      updateOrigin?: string
    ): Promise<PushResponse> => {
      const response = await fetch(`${serverUrl.replace(/\/$/, "")}/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId,
          updateData: encodeBase64(updateBytes),
          isBase64: true,
          frontierTag,
          parentFrontierTag: parentTag,
          sizeBytes: updateBytes.length,
          origin: updateOrigin,
          token,
          clientId: clientIdRef.current,
        }),
      });

      return (await response.json()) as PushResponse;
    },
    [docId, serverUrl, token]
  );

  const handlePushPayload = React.useCallback(
    async (payload: PushResponse) => {
      if (!payload.ok) {
        throw new Error(payload.error);
      }

      if (!payload.applied) {
        forceSnapshotRef.current = true;
        lastFrontierTagRef.current = payload.serverFrontierTag;
        await pollOnce(true);
        return;
      }

      lastFrontierTagRef.current = payload.serverFrontierTag;
      lastSyncAtRef.current = Date.now();
      setState((prev) => ({
        ...prev,
        lastSyncAt: lastSyncAtRef.current,
        role: payload.role ?? prev.role,
      }));
    },
    [pollOnce]
  );

  const pushUpdate = React.useCallback(
    async (updateBytes: Uint8Array, origin: string) => {
      if (!runtime || !enabled) {
        return;
      }
      if (roleRef.current === "viewer") {
        return;
      }

      const frontierTag = getDocFrontierTag(runtime.doc);
      const parentTag = lastFrontierTagRef.current;
      const updateOrigin = resolveUpdateOrigin(origin);

      pendingUpdatesRef.current += 1;
      setState((prev) => ({ ...prev, pendingUpdates: pendingUpdatesRef.current }));
      lastFrontierTagRef.current = frontierTag;

      try {
        const payload = await requestPush(updateBytes, frontierTag, parentTag, updateOrigin);
        await handlePushPayload(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Polling update failed";
        setState((prev) => ({ ...prev, error: message, connectionState: "reconnecting" }));
      } finally {
        pendingUpdatesRef.current = Math.max(0, pendingUpdatesRef.current - 1);
        setState((prev) => ({ ...prev, pendingUpdates: pendingUpdatesRef.current }));
      }
    },
    [enabled, handlePushPayload, requestPush, runtime]
  );

  React.useEffect(() => {
    if (!runtime || !enabled) {
      setState((prev) => ({ ...prev, connectionState: "disconnected", error: null }));
      return;
    }

    const intervalMs = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    void pollOnce(true);
    const intervalId = setInterval(() => {
      void pollOnce(false);
    }, intervalMs);

    const unsubscribe = runtime.onLocalUpdateWithOrigin((updateBytes, origin) => {
      void pushUpdate(updateBytes, origin);
    });

    const handleOnline = () => {
      void pollOnce(true);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
    }

    return () => {
      clearInterval(intervalId);
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    };
  }, [enabled, pollIntervalMs, pollOnce, pushUpdate, runtime]);

  return { ...state, sendCursor };
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

function resolveUpdateOrigin(origin: string): string | undefined {
  return origin.startsWith(AI_COMMIT_ORIGIN_PREFIX) ? origin : undefined;
}

function encodeBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...data.subarray(i, i + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function decodeBase64(str: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(str, "base64"));
  }
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
