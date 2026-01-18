/**
 * LFCC v0.9.3 - Reference Store Types
 *
 * Defines the logical record shape and storage interface for cross-document references.
 * Storage backends (e.g., Loro workspace graph) live outside the core package.
 */

import type { DocumentId, ReferenceType, StableAnchor } from "./crossDocument.js";

export type ReferenceStatus = "active" | "orphan" | "deleted";

export type ReferenceStoreFrontier = {
  loro_frontier: string[];
};

export type CrossDocReferenceRecord = {
  ref_id: string;
  ref_type: ReferenceType;
  source: {
    doc_id: DocumentId;
    block_id: string;
    start: StableAnchor;
    end: StableAnchor;
    if_match_context_hash?: string | null;
  };
  target: {
    doc_id: DocumentId;
    block_id: string;
    anchor: StableAnchor;
  };
  created_at_ms: number;
  created_by: { agent_id: string; request_id: string };
  verified_at_ms?: number;
  v: 1;
};

export type ReferenceEntry = {
  record: CrossDocReferenceRecord;
  status: ReferenceStatus;
};

export interface ReferenceStore {
  createReference(record: CrossDocReferenceRecord): Promise<void>;
  updateReferenceStatus(refId: string, status: ReferenceStatus, reason: string): Promise<void>;
  refreshVerification(refId: string): Promise<boolean>;

  getReference(refId: string): ReferenceEntry | undefined;
  getReferencesFromDoc(docId: DocumentId): ReferenceEntry[];
  getReferencesToDoc(docId: DocumentId): ReferenceEntry[];

  exportUpdates(since?: ReferenceStoreFrontier): Uint8Array;
  importUpdates(updates: Uint8Array): void;
  getFrontier(): ReferenceStoreFrontier;
}
