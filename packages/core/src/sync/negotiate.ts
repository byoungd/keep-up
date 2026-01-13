/**
 * LFCC v0.9 RC - Policy Manifest Negotiation (Sync)
 *
 * Delegates to the kernel policy negotiation for full LFCC compliance.
 */

import {
  type CanonMark,
  type NegotiationError,
  type PolicyManifestV09,
  areManifestsCompatible,
  negotiate,
  validateManifest,
} from "../kernel/policy/index.js";
import { DEFAULT_POLICY_MANIFEST } from "../kernel/policy/types.js";
import type { NegotiationLogEntry } from "./protocol.js";

/** Negotiation result */
export type SyncNegotiationResult = {
  /** Whether negotiation succeeded */
  success: boolean;
  /** Effective manifest (if success) */
  effectiveManifest?: PolicyManifestV09;
  /** Negotiation log (reserved for future detail) */
  log: NegotiationLogEntry[];
  /** Rejection reason (if failed) */
  rejectionReason?: string;
  /** Structured negotiation errors (if failed) */
  errors?: NegotiationError[];
};

/**
 * Negotiate between client and server policy manifests (LFCC v0.9).
 */
export function negotiateManifests(
  clientManifest: PolicyManifestV09,
  serverManifest: PolicyManifestV09
): SyncNegotiationResult {
  if (!areManifestsCompatible(clientManifest, serverManifest)) {
    return {
      success: false,
      log: [],
      rejectionReason: "Critical policy mismatch - co-edit refused",
      errors: [
        {
          field: "compatibility",
          message: "Policy manifests are not compatible for co-editing",
          values: [clientManifest.policy_id, serverManifest.policy_id],
        },
      ],
    };
  }

  const result = negotiate([clientManifest, serverManifest]);
  if (!result.success) {
    return {
      success: false,
      log: [],
      rejectionReason: "Policy negotiation failed",
      errors: result.errors,
    };
  }

  return {
    success: true,
    effectiveManifest: result.manifest,
    log: [],
  };
}

/**
 * Create default policy manifest
 */
export function createDefaultSyncManifest(): PolicyManifestV09 {
  return structuredClone(DEFAULT_POLICY_MANIFEST);
}

/**
 * Validate policy manifest structure
 */
export function validateSyncManifest(manifest: unknown): manifest is PolicyManifestV09 {
  return validateManifest(manifest).valid;
}

/**
 * Check if a feature is supported by the effective manifest
 */
export function isSyncFeatureSupported(
  manifest: PolicyManifestV09,
  feature: { type: "mark" | "block"; name: string }
): boolean {
  if (feature.type === "mark") {
    return manifest.ai_sanitization_policy.allowed_marks.includes(feature.name as CanonMark);
  }
  return manifest.ai_sanitization_policy.allowed_block_types.includes(feature.name);
}

/**
 * Get degraded features (features client wanted but not in effective)
 */
export function getSyncDegradedFeatures(
  clientManifest: PolicyManifestV09,
  effectiveManifest: PolicyManifestV09
): { marks: string[]; blocks: string[] } {
  const degradedMarks = clientManifest.ai_sanitization_policy.allowed_marks.filter(
    (mark) => !effectiveManifest.ai_sanitization_policy.allowed_marks.includes(mark)
  );
  const degradedBlocks = clientManifest.ai_sanitization_policy.allowed_block_types.filter(
    (block) => !effectiveManifest.ai_sanitization_policy.allowed_block_types.includes(block)
  );
  return { marks: degradedMarks, blocks: degradedBlocks };
}
