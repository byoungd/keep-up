/**
 * LFCC v0.9.4 - Negotiator
 * @see docs/specs/LFCC_v0.9_RC.md §2.2 (Negotiation Protocol)
 *
 * Implements the handshake protocol for LFCC sessions.
 * Uses the core negotiate function and wraps it with message types.
 *
 * Key rules:
 * - structure_mode: Must match exactly (Hard Refusal)
 * - extensions: Intersection of compatible versions
 */

import { type PolicyManifestV09, areManifestsCompatible, negotiate } from "@keepup/core";

// ============================================================================
// Types
// ============================================================================

/**
 * Negotiation message types (LFCC §2.2.1)
 */
export type NegotiationMessageType = "HELLO" | "OFFER" | "ACK" | "REJECT";

/**
 * Hello message - sent on connection to advertise local manifest
 */
export interface HelloMessage {
  type: "HELLO";
  manifest: PolicyManifestV09;
  clientId: string;
  protocolVersion: string;
}

/**
 * Offer message - sent after Hello to propose effective manifest
 */
export interface OfferMessage {
  type: "OFFER";
  effectiveManifest: PolicyManifestV09;
  clientId: string;
}

/**
 * Ack message - confirms acceptance of offered manifest
 */
export interface AckMessage {
  type: "ACK";
  clientId: string;
}

/**
 * Reject message - hard refusal due to incompatibility
 */
export interface RejectMessage {
  type: "REJECT";
  clientId: string;
  reason: NegotiationRejectReason;
  details?: string;
}

export type NegotiationMessage = HelloMessage | OfferMessage | AckMessage | RejectMessage;

/**
 * Reasons for hard refusal (LFCC §2.2.1)
 */
export type NegotiationRejectReason =
  | "STRUCTURE_MODE_MISMATCH"
  | "PROTOCOL_VERSION_INCOMPATIBLE"
  | "INCOMPATIBLE_MANIFESTS"
  | "UNKNOWN_ERROR";

/**
 * Negotiation result
 */
export interface NegotiationResult {
  success: boolean;
  effectiveManifest?: PolicyManifestV09;
  rejectReason?: NegotiationRejectReason;
  rejectDetails?: string;
}

// ============================================================================
// Negotiator
// ============================================================================

/**
 * LFCC Negotiator - Implements §2.2 Handshake Protocol
 * Wraps the core negotiate function with message-based protocol.
 */
export class Negotiator {
  private readonly localManifest: PolicyManifestV09;
  private readonly clientId: string;
  private readonly protocolVersion: string;

  constructor(localManifest: PolicyManifestV09, clientId: string, protocolVersion = "0.9.4") {
    this.localManifest = localManifest;
    this.clientId = clientId;
    this.protocolVersion = protocolVersion;
  }

  /**
   * Create a HELLO message to send on connection
   */
  createHello(): HelloMessage {
    return {
      type: "HELLO",
      manifest: this.localManifest,
      clientId: this.clientId,
      protocolVersion: this.protocolVersion,
    };
  }

  /**
   * Process a received HELLO message and determine compatibility
   * Returns either an OFFER or REJECT message
   */
  processHello(hello: HelloMessage): OfferMessage | RejectMessage {
    // Check structure_mode match first (hard refusal)
    if (hello.manifest.structure_mode !== this.localManifest.structure_mode) {
      return {
        type: "REJECT",
        clientId: this.clientId,
        reason: "STRUCTURE_MODE_MISMATCH",
        details: `Local: ${this.localManifest.structure_mode}, Remote: ${hello.manifest.structure_mode}`,
      };
    }

    // Use core negotiate function
    const result = negotiate([this.localManifest, hello.manifest]);

    if (!result.success) {
      return {
        type: "REJECT",
        clientId: this.clientId,
        reason: "INCOMPATIBLE_MANIFESTS",
        details: result.errors.map((e) => e.message).join("; "),
      };
    }

    return {
      type: "OFFER",
      effectiveManifest: result.manifest,
      clientId: this.clientId,
    };
  }

  /**
   * Process a received OFFER message
   * Returns ACK if acceptable, REJECT otherwise
   */
  processOffer(offer: OfferMessage): AckMessage | RejectMessage {
    // Verify the offer is compatible with our local manifest
    if (!areManifestsCompatible(this.localManifest, offer.effectiveManifest)) {
      return {
        type: "REJECT",
        clientId: this.clientId,
        reason: "INCOMPATIBLE_MANIFESTS",
        details: "Effective manifest is not compatible with local manifest",
      };
    }

    return {
      type: "ACK",
      clientId: this.clientId,
    };
  }

  /**
   * Get the local manifest
   */
  getLocalManifest(): PolicyManifestV09 {
    return this.localManifest;
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a negotiator instance
 */
export function createNegotiator(
  manifest: PolicyManifestV09,
  clientId: string,
  protocolVersion?: string
): Negotiator {
  return new Negotiator(manifest, clientId, protocolVersion);
}
