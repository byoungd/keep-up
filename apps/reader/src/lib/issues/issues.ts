import type { DisplayAnnoState, SyncClientState } from "@ku0/core";

export type IssueKind =
  | "ORPHAN"
  | "PARTIAL"
  | "UNVERIFIED"
  | "DIVERGENCE"
  | "SECURITY_REJECTED"
  | "RELOCATION_BLOCKED"
  | "MAPPING_FAILED"
  | "NETWORK_OFFLINE"
  | "MISSING"
  | "POLICY_DEGRADED";

export type IssueSeverity = "info" | "warn" | "blocking";

export type IssueAction = "copy_diagnostics" | "export_repro" | "reload" | "read_only" | "dismiss";

export type IssueDefinition = {
  kind: IssueKind;
  label: string;
  summary: string;
  cause: string;
  action: string;
  severity: IssueSeverity;
  actions: IssueAction[];
  blocksEdits: boolean;
  blocksAnnotationOps: boolean;
};

export const ISSUE_DEFINITIONS: Record<IssueKind, IssueDefinition> = {
  ORPHAN: {
    kind: "ORPHAN",
    label: "Orphaned",
    summary: "The original target no longer exists, so the highlight is hidden.",
    cause: "The block referenced by the annotation was deleted or replaced.",
    action: "Undo the deletion if possible, or recreate the annotation.",
    severity: "warn",
    actions: ["copy_diagnostics", "reload", "dismiss"],
    blocksEdits: false,
    blocksAnnotationOps: false,
  },
  PARTIAL: {
    kind: "PARTIAL",
    label: "Partial match",
    summary: "Only part of the original span could be resolved safely.",
    cause: "Edits, splits, or reorders broke strict adjacency requirements.",
    action: "Review the highlight, or re-annotate the intended text.",
    severity: "warn",
    actions: ["copy_diagnostics", "reload", "dismiss"],
    blocksEdits: false,
    blocksAnnotationOps: false,
  },
  UNVERIFIED: {
    kind: "UNVERIFIED",
    label: "Unverified",
    summary: "Verification is pending to avoid incorrect anchoring.",
    cause: "The annotation has not yet passed strict verification.",
    action: "Wait for verification or reload to re-run checks.",
    severity: "info",
    actions: ["reload", "dismiss"],
    blocksEdits: false,
    blocksAnnotationOps: false,
  },
  DIVERGENCE: {
    kind: "DIVERGENCE",
    label: "Divergence",
    summary: "Editor and CRDT state no longer match.",
    cause: "Checksum mismatch detected during integrity scan.",
    action: "Export a repro bundle, then reload to recover.",
    severity: "blocking",
    actions: ["export_repro", "copy_diagnostics", "reload", "read_only"],
    blocksEdits: true,
    blocksAnnotationOps: true,
  },
  SECURITY_REJECTED: {
    kind: "SECURITY_REJECTED",
    label: "Security rejected",
    summary: "A payload was rejected by security validation.",
    cause: "The content failed sanitization or policy limits.",
    action: "Remove the unsafe content and retry.",
    severity: "blocking",
    actions: ["copy_diagnostics"],
    blocksEdits: false,
    blocksAnnotationOps: true,
  },
  RELOCATION_BLOCKED: {
    kind: "RELOCATION_BLOCKED",
    label: "Relocation blocked",
    summary: "Relocation was blocked by policy or user confirmation.",
    cause: "The relocation attempt exceeded configured limits.",
    action: "Reduce the change scope or adjust the policy.",
    severity: "warn",
    actions: ["copy_diagnostics", "dismiss"],
    blocksEdits: false,
    blocksAnnotationOps: true,
  },
  MAPPING_FAILED: {
    kind: "MAPPING_FAILED",
    label: "Verification failed",
    summary: "Integrity verification failed; the highlight is paused.",
    cause: "Anchor verification did not pass strict checks.",
    action: "Reload to re-verify or copy diagnostics for support.",
    severity: "blocking",
    actions: ["copy_diagnostics", "reload"],
    blocksEdits: false,
    blocksAnnotationOps: true,
  },
  NETWORK_OFFLINE: {
    kind: "NETWORK_OFFLINE",
    label: "Offline",
    summary: "You are offline; changes are local until sync resumes.",
    cause: "Network connection is unavailable.",
    action: "Reconnect to sync changes.",
    severity: "info",
    actions: ["dismiss"],
    blocksEdits: false,
    blocksAnnotationOps: false,
  },
  MISSING: {
    kind: "MISSING",
    label: "Missing annotation",
    summary: "The requested annotation was not found.",
    cause: "The annotation ID does not exist in this document.",
    action: "Verify the link or refresh the document.",
    severity: "warn",
    actions: ["reload", "dismiss"],
    blocksEdits: false,
    blocksAnnotationOps: false,
  },
  POLICY_DEGRADED: {
    kind: "POLICY_DEGRADED",
    label: "Degraded mode",
    summary: "Policy negotiation tightened capabilities.",
    cause: "Collaboration continues in degraded mode due to policy mismatch.",
    action: "Dismiss or refresh to re-negotiate.",
    severity: "warn",
    actions: ["copy_diagnostics", "dismiss"],
    blocksEdits: false,
    blocksAnnotationOps: false,
  },
};

export function getIssueDefinition(kind: IssueKind): IssueDefinition {
  return ISSUE_DEFINITIONS[kind];
}

export function issueKindFromDisplayState(state: DisplayAnnoState): IssueKind | null {
  switch (state) {
    case "orphan":
      return "ORPHAN";
    case "active_partial":
      return "PARTIAL";
    case "active_unverified":
      return "UNVERIFIED";
    case "broken_grace":
      return "MAPPING_FAILED";
    default:
      return null;
  }
}

export function getIssueDefinitionForAnnotationState(
  state: DisplayAnnoState
): IssueDefinition | null {
  const kind = issueKindFromDisplayState(state);
  if (!kind) {
    return null;
  }
  return getIssueDefinition(kind);
}

export function issueKindFromSyncState(state: SyncClientState): IssueKind | null {
  if (state === "disconnected" || state === "error") {
    return "NETWORK_OFFLINE";
  }
  return null;
}
