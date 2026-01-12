"use client";

import { useAnnotationStore } from "@/lib/kernel/store";

export type CollabMetadata = {
  docId?: string;
  replicaId?: string;
  pendingOps?: number;
  lastSyncAt?: string;
  connectionState?: string;
  policyManifest?: Record<string, unknown>;
};

export type DiagnosticsPayload = {
  version: string;
  timestamp: string;
  collab?: CollabMetadata;
  annotations: {
    id: string;
    displayState: string;
    verified: boolean;
    spanCount: number;
    chainPolicy?: string;
  }[];
  summary: {
    total: number;
    active: number;
    issues: number;
    orphan: number;
  };
  /** Content is redacted by default for privacy. Only included if includeContent is true. */
  contentIncluded: boolean;
};

const DIAGNOSTICS_VERSION = "1.1.0";

/**
 * Gathers diagnostics payload from annotation store.
 * This is a subset of the Export Repro payload for quick clipboard sharing.
 * Content is redacted by default.
 *
 * @param collabMeta - Optional collab metadata to include (docId, replicaId, etc.)
 * @param includeContent - If true, includes content (dev-only, use with caution)
 */
export function gatherDiagnostics(
  collabMeta?: CollabMetadata,
  _includeContent = false
): DiagnosticsPayload {
  const annotations = Object.values(useAnnotationStore.getState().annotations);

  const summary = {
    total: annotations.length,
    active: annotations.filter((a) => a.displayState === "active").length,
    issues: annotations.filter((a) =>
      ["active_partial", "active_unverified", "broken_grace", "orphan"].includes(a.displayState)
    ).length,
    orphan: annotations.filter((a) => a.displayState === "orphan").length,
  };

  return {
    version: DIAGNOSTICS_VERSION,
    timestamp: new Date().toISOString(),
    collab: collabMeta,
    annotations: annotations.map((a) => ({
      id: a.id,
      displayState: a.displayState,
      verified: a.verified,
      spanCount: a.spans?.length ?? 0,
      chainPolicy: a.chain?.policy?.kind,
    })),
    summary,
    contentIncluded: false, // Always false for now; content redacted by default
  };
}

/**
 * Copy diagnostics to clipboard.
 * Returns true on success, false on failure.
 *
 * @param collabMeta - Optional collab metadata to include
 */
export async function copyDiagnosticsToClipboard(collabMeta?: CollabMetadata): Promise<boolean> {
  try {
    const payload = gatherDiagnostics(collabMeta);
    const json = JSON.stringify(payload, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch (error) {
    console.error("[Diagnostics] Copy failed:", error);
    return false;
  }
}
