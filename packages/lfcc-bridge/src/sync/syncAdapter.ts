import type { PolicyManifestV09 } from "@keepup/core";
import { negotiate } from "@keepup/core";

import { type DegradationStep, degradationPath } from "../policy/policyDegradation";
import type { LoroRuntime } from "../runtime/loroRuntime";

export type SyncAdapterStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type SyncAdapterOptions = {
  docId: string;
  runtime: LoroRuntime;
  manifest: PolicyManifestV09;
  onRemoteUpdate?: (bytes: Uint8Array) => void;
  onNegotiated?: (manifest: PolicyManifestV09) => void;
};

export interface SyncAdapter {
  status: SyncAdapterStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendUpdate: (bytes: Uint8Array) => void;
}

export class NoopSyncAdapter implements SyncAdapter {
  status: SyncAdapterStatus = "idle";
  private readonly options: SyncAdapterOptions;

  constructor(options: SyncAdapterOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    this.status = "connected";
    this.options.onNegotiated?.(this.options.manifest);
  }

  disconnect(): void {
    this.status = "disconnected";
  }

  sendUpdate(_bytes: Uint8Array): void {
    // Intentionally no-op for local-only skeleton.
  }
}

/**
 * Computes the effective policy manifest from a set of peer manifests.
 * P1.2: Bridge-Core Alignment - Uses Core's negotiate() function to ensure identical results.
 *
 * This function is a wrapper around Core's negotiate() function to ensure Bridge and Core
 * produce identical negotiation results.
 *
 * @param manifests - Array of policy manifests to negotiate
 * @returns Effective policy manifest (or throws if negotiation fails)
 * @throws Error if negotiation fails (e.g., critical field mismatches)
 */
export type EffectiveManifestResult = {
  manifest: PolicyManifestV09;
  degraded: boolean;
  steps: DegradationStep[];
};

export function computeEffectiveManifest(manifests: PolicyManifestV09[]): EffectiveManifestResult {
  // P1.2: Use Core's negotiate() function directly to ensure alignment
  const result = negotiate(manifests);

  if (!result.success) {
    // Convert negotiation errors to thrown error for backward compatibility
    const errorMessages = result.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    throw new Error(`Policy negotiation failed: ${errorMessages}`);
  }

  const preferred = manifests[0];
  const degradation = degradationPath(preferred, result.manifest);

  return {
    manifest: result.manifest,
    degraded: degradation.degraded,
    steps: degradation.steps,
  };
}
