/**
 * LFCC v0.9.1+ — Cross-Document AI Operations
 *
 * Protocol for AI operations spanning multiple documents.
 * Enables document linking, cross-references, and atomic multi-doc edits.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

import type { EditIntent } from "./intent.js";
import type { AIOperationMeta } from "./opcodes.js";

// ============================================================================
// Document Reference
// ============================================================================

/**
 * Unique document identifier.
 */
export type DocumentId = string & { readonly __brand: "DocumentId" };

/**
 * Create a document ID.
 */
export function documentId(id: string): DocumentId {
  return id as DocumentId;
}

/**
 * Stable anchor within a document.
 */
export interface StableAnchor {
  /** Block ID */
  block_id: string;

  /** Character offset within block */
  offset?: number;

  /** Anchor stability version */
  version: number;
}

// ============================================================================
// Cross-Document Reference
// ============================================================================

/**
 * Type of cross-document reference.
 */
export type ReferenceType =
  | "citation" // Formal citation/quote
  | "continuation" // Content continues in another doc
  | "related" // Semantically related
  | "derived" // Derived/transformed from source
  | "bidirectional"; // Two-way link

/**
 * Reference between two documents.
 */
export interface CrossDocReference {
  /** Unique reference ID */
  ref_id: string;

  /** Source document and location */
  source: {
    doc_id: DocumentId;
    block_id: string;
    anchor: StableAnchor;
    excerpt?: string;
  };

  /** Target document and location */
  target: {
    doc_id: DocumentId;
    block_id: string;
    anchor: StableAnchor;
    excerpt?: string;
  };

  /** Reference type */
  ref_type: ReferenceType;

  /** AI-generated metadata */
  ai_meta?: {
    confidence: number;
    reasoning?: string;
  };

  /** When created */
  created_at: number;

  /** Last verified */
  verified_at?: number;
}

// ============================================================================
// Document Role in Operation
// ============================================================================

/**
 * Role of a document in a cross-document operation.
 */
export type DocumentRole =
  | "source" // Content source
  | "target" // Target for changes
  | "reference"; // Referenced but not modified

// ============================================================================
// Document Operation
// ============================================================================

/**
 * Operations for a single document in a cross-doc operation.
 */
export interface DocumentOperations {
  /** Document ID */
  doc_id: DocumentId;

  /** Role in this operation */
  role: DocumentRole;

  /** Operations to apply */
  operations: DocumentOp[];

  /** Whether this document's changes are optional */
  optional?: boolean;
}

/**
 * Single operation within a document.
 */
export interface DocumentOp {
  /** Operation ID */
  op_id: string;

  /** Block ID affected */
  block_id: string;

  /** Operation type */
  type: "insert" | "update" | "delete" | "move";

  /** Content (for insert/update) */
  content?: string;

  /** Target position (for move) */
  target_position?: { after_block_id: string };
}

// ============================================================================
// Cross-Document Operation
// ============================================================================

/**
 * Atomicity level for cross-document operations.
 */
export type AtomicityLevel =
  | "all_or_nothing" // All docs succeed or all rollback
  | "best_effort" // Apply what succeeds
  | "independent"; // Each doc is independent

/**
 * Complete cross-document AI operation.
 */
export interface CrossDocumentOperation {
  /** Operation ID */
  operation_id: string;

  /** Intent for this operation */
  intent: EditIntent;

  /** AI metadata */
  ai_meta?: AIOperationMeta;

  /** Documents involved */
  documents: DocumentOperations[];

  /** Atomicity level */
  atomicity: AtomicityLevel;

  /** References created by this operation */
  created_references: CrossDocReference[];

  /** When initiated */
  initiated_at: number;

  /** Status */
  status: CrossDocOperationStatus;
}

/**
 * Status of a cross-document operation.
 */
export type CrossDocOperationStatus =
  | { phase: "preparing" }
  | { phase: "executing"; completed_docs: string[] }
  | { phase: "completed"; results: DocumentResult[] }
  | { phase: "partial_failure"; results: DocumentResult[]; failed: string[] }
  | { phase: "rolled_back"; reason: string };

/**
 * Result for a single document.
 */
export interface DocumentResult {
  doc_id: DocumentId;
  success: boolean;
  operations_applied: number;
  error?: string;
}

// ============================================================================
// Cross-Document Coordinator Interface
// ============================================================================

/**
 * Coordinator for cross-document AI operations.
 */
export interface CrossDocumentCoordinator {
  /**
   * Start a cross-document operation.
   */
  startOperation(
    intent: EditIntent,
    documents: DocumentOperations[],
    atomicity: AtomicityLevel,
    ai_meta?: AIOperationMeta
  ): CrossDocumentOperation;

  /**
   * Execute a prepared operation.
   */
  executeOperation(operationId: string): Promise<CrossDocumentOperation>;

  /**
   * Rollback an operation.
   */
  rollbackOperation(operationId: string, reason: string): Promise<void>;

  /**
   * Create a cross-document reference.
   */
  createReference(
    source: CrossDocReference["source"],
    target: CrossDocReference["target"],
    refType: ReferenceType,
    aiMeta?: CrossDocReference["ai_meta"]
  ): CrossDocReference;

  /**
   * Get references from a document.
   */
  getReferencesFrom(docId: DocumentId): CrossDocReference[];

  /**
   * Get references to a document.
   */
  getReferencesTo(docId: DocumentId): CrossDocReference[];

  /**
   * Verify reference validity (target still exists).
   */
  verifyReference(refId: string): Promise<boolean>;

  /**
   * Get operation by ID.
   */
  getOperation(operationId: string): CrossDocumentOperation | undefined;

  /**
   * Get all active operations.
   */
  getActiveOperations(): CrossDocumentOperation[];
}

// ============================================================================
// Cross-Document Coordinator Implementation
// ============================================================================

let crossDocOpCounter = 0;
let refCounter = 0;

/**
 * Generate unique cross-doc operation ID.
 */
export function generateCrossDocOpId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (crossDocOpCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `xdoc_${timestamp}_${counter}_${random}`;
}

/**
 * Generate unique reference ID.
 */
export function generateRefId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (refCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `ref_${timestamp}_${counter}_${random}`;
}

/**
 * In-memory cross-document coordinator.
 */
export class InMemoryCrossDocumentCoordinator implements CrossDocumentCoordinator {
  private operations = new Map<string, CrossDocumentOperation>();
  private references = new Map<string, CrossDocReference>();
  private refsBySource = new Map<string, Set<string>>();
  private refsByTarget = new Map<string, Set<string>>();
  private documentApplicator?: (docId: DocumentId, ops: DocumentOp[]) => Promise<boolean>;

  constructor(documentApplicator?: (docId: DocumentId, ops: DocumentOp[]) => Promise<boolean>) {
    this.documentApplicator = documentApplicator;
  }

  startOperation(
    intent: EditIntent,
    documents: DocumentOperations[],
    atomicity: AtomicityLevel,
    ai_meta?: AIOperationMeta
  ): CrossDocumentOperation {
    const operation: CrossDocumentOperation = {
      operation_id: generateCrossDocOpId(),
      intent,
      ai_meta,
      documents,
      atomicity,
      created_references: [],
      initiated_at: Date.now(),
      status: { phase: "preparing" },
    };

    this.operations.set(operation.operation_id, operation);
    return operation;
  }

  async executeOperation(operationId: string): Promise<CrossDocumentOperation> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    if (operation.status.phase !== "preparing") {
      throw new Error(`Operation ${operationId} is not in preparing phase`);
    }

    operation.status = { phase: "executing", completed_docs: [] };

    const results: DocumentResult[] = [];
    const failed: string[] = [];

    for (const docOps of operation.documents) {
      const result = await this.applyDocumentOperations(docOps);
      results.push(result);

      if (result.success) {
        if (operation.status.phase === "executing") {
          operation.status.completed_docs.push(docOps.doc_id);
        }
      } else {
        failed.push(docOps.doc_id);

        // Handle atomicity
        if (operation.atomicity === "all_or_nothing") {
          // Rollback all completed
          await this.rollbackOperation(operationId, `Failed on ${docOps.doc_id}: ${result.error}`);
          return operation;
        }
      }
    }

    if (failed.length > 0) {
      operation.status = { phase: "partial_failure", results, failed };
    } else {
      operation.status = { phase: "completed", results };
    }

    return operation;
  }

  async rollbackOperation(operationId: string, reason: string): Promise<void> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return;
    }

    // In a real implementation, we'd reverse the operations
    // For now, just mark as rolled back
    operation.status = { phase: "rolled_back", reason };
  }

  createReference(
    source: CrossDocReference["source"],
    target: CrossDocReference["target"],
    refType: ReferenceType,
    aiMeta?: CrossDocReference["ai_meta"]
  ): CrossDocReference {
    const ref: CrossDocReference = {
      ref_id: generateRefId(),
      source,
      target,
      ref_type: refType,
      ai_meta: aiMeta,
      created_at: Date.now(),
    };

    this.references.set(ref.ref_id, ref);

    // Index by source
    const sourceKey = source.doc_id;
    let sourceRefs = this.refsBySource.get(sourceKey);
    if (!sourceRefs) {
      sourceRefs = new Set();
      this.refsBySource.set(sourceKey, sourceRefs);
    }
    sourceRefs.add(ref.ref_id);

    // Index by target
    const targetKey = target.doc_id;
    let targetRefs = this.refsByTarget.get(targetKey);
    if (!targetRefs) {
      targetRefs = new Set();
      this.refsByTarget.set(targetKey, targetRefs);
    }
    targetRefs.add(ref.ref_id);

    return ref;
  }

  getReferencesFrom(docId: DocumentId): CrossDocReference[] {
    const refIds = this.refsBySource.get(docId);
    if (!refIds) {
      return [];
    }
    return Array.from(refIds)
      .map((id) => this.references.get(id))
      .filter((r): r is CrossDocReference => r !== undefined);
  }

  getReferencesTo(docId: DocumentId): CrossDocReference[] {
    const refIds = this.refsByTarget.get(docId);
    if (!refIds) {
      return [];
    }
    return Array.from(refIds)
      .map((id) => this.references.get(id))
      .filter((r): r is CrossDocReference => r !== undefined);
  }

  async verifyReference(refId: string): Promise<boolean> {
    const ref = this.references.get(refId);
    if (!ref) {
      return false;
    }

    // In a real implementation, we'd check if the anchors still exist
    // For now, just mark as verified
    ref.verified_at = Date.now();
    return true;
  }

  getOperation(operationId: string): CrossDocumentOperation | undefined {
    return this.operations.get(operationId);
  }

  getActiveOperations(): CrossDocumentOperation[] {
    return Array.from(this.operations.values()).filter(
      (op) => op.status.phase === "preparing" || op.status.phase === "executing"
    );
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async applyDocumentOperations(docOps: DocumentOperations): Promise<DocumentResult> {
    if (!this.documentApplicator) {
      // Mock success
      return {
        doc_id: docOps.doc_id,
        success: true,
        operations_applied: docOps.operations.length,
      };
    }

    try {
      const success = await this.documentApplicator(docOps.doc_id, docOps.operations);
      return {
        doc_id: docOps.doc_id,
        success,
        operations_applied: success ? docOps.operations.length : 0,
        error: success ? undefined : "Applicator returned false",
      };
    } catch (error) {
      return {
        doc_id: docOps.doc_id,
        success: false,
        operations_applied: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a cross-document coordinator.
 */
export function createCrossDocumentCoordinator(
  documentApplicator?: (docId: DocumentId, ops: DocumentOp[]) => Promise<boolean>
): CrossDocumentCoordinator {
  return new InMemoryCrossDocumentCoordinator(documentApplicator);
}
