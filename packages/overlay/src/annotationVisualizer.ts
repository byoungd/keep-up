/**
 * LFCC v0.9 RC - Annotation State Machine Visualizer
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/04_DevTools_Debug_Overlay.md Section C
 *
 * Visualizes annotation state machine state including grace tokens.
 */

import type { AnnotationDisplayData, OverlayCssTokens, OverlayEvent } from "./types";
import { DEFAULT_CSS_TOKENS } from "./types";

/** Annotation state colors */
export type StateColorMap = {
  active: string;
  active_unverified: string;
  broken_grace: string;
  broken_partial: string;
  orphan: string;
};

/** Default state colors */
export const DEFAULT_STATE_COLORS: StateColorMap = {
  active: "#4caf50",
  active_unverified: "#2196f3",
  broken_grace: "#ff9800",
  broken_partial: "#f44336",
  orphan: "#9e9e9e",
};

/** Annotation visualizer render data */
export type AnnotationVisualizerData = {
  annotation: AnnotationDisplayData;
  stateColor: string;
  stateLabel: string;
  graceStatus: GraceStatus | null;
  recentEvents: OverlayEvent[];
  verificationStatus: VerificationStatus | null;
};

/** Grace period status */
export type GraceStatus = {
  token: string;
  expiresAt: number;
  remainingMs: number;
  isExpired: boolean;
};

/** Verification status */
export type VerificationStatus = {
  lastVerifyTime: number;
  lastVerifyReason: string;
  contextHash: string | null;
  isStale: boolean;
};

/**
 * Render annotation visualizer data
 */
export function renderAnnotationVisualizer(
  annotation: AnnotationDisplayData,
  eventLog: OverlayEvent[],
  maxEvents = 10,
  staleThresholdMs = 60000,
  stateColors: StateColorMap = DEFAULT_STATE_COLORS
): AnnotationVisualizerData {
  const now = Date.now();

  // Get state color and label
  const stateColor = getStateColor(annotation.currentState, stateColors);
  const stateLabel = formatStateLabel(annotation.currentState);

  // Calculate grace status
  let graceStatus: GraceStatus | null = null;
  if (annotation.graceToken && annotation.graceExpiresAt) {
    const remainingMs = annotation.graceExpiresAt - now;
    graceStatus = {
      token: annotation.graceToken,
      expiresAt: annotation.graceExpiresAt,
      remainingMs: Math.max(0, remainingMs),
      isExpired: remainingMs <= 0,
    };
  }

  // Get recent events for this annotation
  const recentEvents = eventLog
    .filter((e) => e.source === annotation.annoId || e.metadata?.annoId === annotation.annoId)
    .slice(0, maxEvents);

  // Calculate verification status
  let verificationStatus: VerificationStatus | null = null;
  if (annotation.lastVerifyTime) {
    const timeSinceVerify = now - annotation.lastVerifyTime;
    verificationStatus = {
      lastVerifyTime: annotation.lastVerifyTime,
      lastVerifyReason: annotation.lastVerifyReason ?? "unknown",
      contextHash: annotation.contextHash,
      isStale: timeSinceVerify > staleThresholdMs,
    };
  }

  return {
    annotation,
    stateColor,
    stateLabel,
    graceStatus,
    recentEvents,
    verificationStatus,
  };
}

/**
 * Get color for annotation state
 */
export function getStateColor(state: string, colors: StateColorMap = DEFAULT_STATE_COLORS): string {
  const normalizedState = state.toLowerCase().replace(/-/g, "_");
  return (colors as Record<string, string>)[normalizedState] ?? colors.active_unverified;
}

/**
 * Format state label for display
 */
export function formatStateLabel(state: string): string {
  return state
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Format grace remaining time
 */
export function formatGraceRemaining(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "Expired";
  }
  if (remainingMs < 1000) {
    return `${remainingMs}ms`;
  }
  return `${(remainingMs / 1000).toFixed(1)}s`;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

/**
 * Format time ago
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) {
    return "just now";
  }
  if (diff < 60000) {
    return `${Math.floor(diff / 1000)}s ago`;
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`;
  }
  return `${Math.floor(diff / 3600000)}h ago`;
}

/**
 * Generate CSS for annotation visualizer
 */
export function generateAnnotationVisualizerCss(
  tokens: OverlayCssTokens = DEFAULT_CSS_TOKENS
): string {
  return `
.lfcc-anno-card {
  background: ${tokens.panelBg};
  border: 1px solid ${tokens.borderColor};
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
}

.lfcc-anno-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.lfcc-anno-state-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
}

.lfcc-anno-id {
  font-family: monospace;
  font-size: 12px;
  color: ${tokens.textColor};
  opacity: 0.8;
}

.lfcc-anno-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid ${tokens.borderColor};
}

.lfcc-anno-section-title {
  font-size: 10px;
  text-transform: uppercase;
  color: ${tokens.textColor};
  opacity: 0.6;
  margin-bottom: 4px;
}

.lfcc-grace-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: rgba(255, 152, 0, 0.2);
  border-radius: 4px;
  font-size: 11px;
}

.lfcc-grace-indicator--expired {
  background: rgba(244, 67, 54, 0.2);
}

.lfcc-grace-token {
  font-family: monospace;
  font-size: 10px;
  opacity: 0.7;
}

.lfcc-event-list {
  max-height: 150px;
  overflow-y: auto;
  font-size: 11px;
}

.lfcc-event-item {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid ${tokens.borderColor};
}

.lfcc-event-time {
  font-family: monospace;
  color: ${tokens.textColor};
  opacity: 0.6;
  flex-shrink: 0;
}

.lfcc-event-type {
  font-weight: 500;
}

.lfcc-verify-status {
  font-size: 11px;
}

.lfcc-verify-status--stale {
  color: ${tokens.warningColor};
}

.lfcc-hash-display {
  font-family: monospace;
  font-size: 10px;
  word-break: break-all;
  opacity: 0.7;
}
`.trim();
}

/**
 * Get event type display color
 */
export function getEventTypeColor(
  eventType: string,
  tokens: OverlayCssTokens = DEFAULT_CSS_TOKENS
): string {
  switch (eventType) {
    case "state_transition":
      return tokens.textColor;
    case "checkpoint":
      return tokens.successColor;
    case "grace_enter":
    case "grace_exit":
      return tokens.warningColor;
    case "mismatch_detected":
      return tokens.errorColor;
    case "repair_attempt":
      return tokens.warningColor;
    default:
      return tokens.textColor;
  }
}

/**
 * Filter events by annotation ID
 */
export function filterEventsByAnnotation(events: OverlayEvent[], annoId: string): OverlayEvent[] {
  return events.filter((e) => e.source === annoId || e.metadata?.annoId === annoId);
}
