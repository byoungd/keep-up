/**
 * LFCC v0.9 RC - Liquid Refactoring Module
 * @see docs/product/reports/strategy/LFCC_AI_Killer_Features_Analysis.md
 *
 * Killer Feature #1: Structure-aware AI refactoring that preserves annotations.
 * AI performs OP_BLOCK_CONVERT and OP_REORDER instead of destructive delete/insert.
 *
 * Linear-quality implementation with:
 * - Branded ID types for compile-time safety
 * - Result types for explicit error handling
 * - Immutable data structures
 * - Observability hooks
 */

import type { Anchor } from "../mapping/anchors";
import type { BlockMapping } from "../mapping/types";
import {
  type AnnotationId,
  type BlockId,
  CONFIDENCE_THRESHOLDS,
  Err,
  LIMITS,
  Ok,
  type OpId,
  type Result,
  type TraceId,
  type ValidationError,
  annotationId,
  blockId,
  opId,
  traceId,
  validationError,
  withTiming,
} from "./primitives";

// ============================================
// Types (Immutable)
// ============================================

/** Structural operation types for liquid refactoring */
export type LiquidOpCode =
  | "OP_BLOCK_CONVERT"
  | "OP_REORDER"
  | "OP_BLOCK_SPLIT"
  | "OP_BLOCK_JOIN"
  | "OP_LIST_REPARENT";

/** A single liquid refactoring operation (immutable) */
export type LiquidOp = {
  readonly id: OpId;
  readonly opCode: LiquidOpCode;
  readonly blockId: BlockId;
  /** For CONVERT: the target block type */
  readonly targetType?: string;
  /** For CONVERT: optional replacement block ID (REPLACE-ID semantics) */
  readonly newBlockId?: BlockId;
  /** For REORDER: the new position index */
  readonly newIndex?: number;
  /** For SPLIT: the offset within the block */
  readonly splitOffset?: number;
  /** For JOIN: the block ID to join with */
  readonly joinWithBlockId?: BlockId;
  /** Timestamp for ordering */
  readonly timestamp: number;
};

/** Migration method used for annotation relocation */
export type MigrationMethod = "exact" | "mapped" | "fuzzy";

/** Annotation migration plan (immutable) */
export type AnnotationMigration = {
  readonly annotationId: AnnotationId;
  readonly oldAnchor: Readonly<Anchor>;
  readonly newAnchor: Readonly<Anchor>;
  readonly confidence: number;
  readonly method: MigrationMethod;
};

/** Diagnostic entry for debugging */
export type LiquidDiagnostic = {
  readonly kind: string;
  readonly detail: string;
  readonly severity: "info" | "warning" | "error";
  readonly blockId?: BlockId;
  readonly timestamp: number;
};

/** Result of a liquid refactoring operation (immutable) */
export type LiquidRefactoringResult = {
  readonly traceId: TraceId;
  readonly success: boolean;
  readonly ops: readonly LiquidOp[];
  readonly annotationMigrations: readonly AnnotationMigration[];
  /** Block ID mapping from old to new */
  readonly blockMapping: BlockMapping;
  /** Blocks that were affected */
  readonly affectedBlockIds: readonly BlockId[];
  /** Diagnostics for debugging */
  readonly diagnostics: readonly LiquidDiagnostic[];
  /** Timing information */
  readonly timingMs: number;
};

/** Input for liquid refactoring (immutable) */
export type LiquidRefactoringInput = {
  /** The AI's intent (e.g., "organize into formal document") */
  readonly intent: string;
  /** Source blocks being refactored */
  readonly sourceBlockIds: readonly BlockId[];
  /** The proposed new structure from AI */
  readonly proposedStructure: readonly ProposedBlock[];
  /** Current annotations attached to source blocks */
  readonly annotations: readonly AnnotationInput[];
};

/** Annotation input for refactoring */
export type AnnotationInput = {
  readonly id: AnnotationId;
  readonly anchor: Readonly<Anchor>;
  readonly content: string;
};

/** AI-proposed block structure (immutable) */
export type ProposedBlock = {
  /** Original block ID if this is a transformation, null if new */
  readonly sourceBlockId: BlockId | null;
  /** Optional replacement block ID if identity is replaced */
  readonly newBlockId?: BlockId;
  /** New block type */
  readonly type: string;
  /** Content text */
  readonly text: string;
  /** New position in document order */
  readonly orderIndex: number;
  /** Nested children for hierarchical structures */
  readonly children?: readonly ProposedBlock[];
};

/** Validation result for liquid plan */
export type LiquidPlanValidation = {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationError[];
};

// ============================================
// Core Functions
// ============================================

let opCounter = 0;

/** Generate a unique operation ID */
function nextOpId(): OpId {
  return opId(`liquid-op-${Date.now()}-${opCounter++}`);
}

/** Validate input for liquid refactoring */
function validateInput(input: LiquidRefactoringInput): ValidationError | null {
  if (input.sourceBlockIds.length === 0) {
    return validationError("EMPTY_SOURCE", "No source blocks provided for refactoring");
  }
  if (input.sourceBlockIds.length > LIMITS.MAX_LIQUID_OPS) {
    return validationError(
      "TOO_MANY_BLOCKS",
      `Cannot refactor more than ${LIMITS.MAX_LIQUID_OPS} blocks at once`,
      { details: { count: input.sourceBlockIds.length, limit: LIMITS.MAX_LIQUID_OPS } }
    );
  }
  const uniqueSourceIds = new Set(input.sourceBlockIds);
  if (uniqueSourceIds.size !== input.sourceBlockIds.length) {
    return validationError(
      "DUPLICATE_SOURCE_BLOCKS",
      "Source blocks must be unique for deterministic refactoring",
      {
        details: {
          count: input.sourceBlockIds.length,
          unique: uniqueSourceIds.size,
        },
      }
    );
  }
  return null;
}

function flattenProposedBlocks(proposed: readonly ProposedBlock[]): ProposedBlock[] {
  const result: ProposedBlock[] = [];
  const visit = (blocks: readonly ProposedBlock[]) => {
    for (const block of blocks) {
      result.push(block);
      if (block.children && block.children.length > 0) {
        visit(block.children);
      }
    }
  };

  visit(proposed);

  return result;
}

/** Build source to proposed block mapping */
function buildSourceMapping(proposedStructure: readonly ProposedBlock[]): {
  sourceToProposed: Map<BlockId, ProposedBlock>;
  affectedBlockIds: Set<BlockId>;
  duplicateSourceIds: Set<BlockId>;
} {
  const sourceToProposed = new Map<BlockId, ProposedBlock>();
  const affectedBlockIds = new Set<BlockId>();
  const duplicateSourceIds = new Set<BlockId>();
  const flattened = flattenProposedBlocks(proposedStructure);

  for (const proposed of flattened) {
    if (proposed.sourceBlockId) {
      if (sourceToProposed.has(proposed.sourceBlockId)) {
        duplicateSourceIds.add(proposed.sourceBlockId);
        continue;
      }
      sourceToProposed.set(proposed.sourceBlockId, proposed);
      affectedBlockIds.add(proposed.sourceBlockId);
    }
  }
  return { sourceToProposed, affectedBlockIds, duplicateSourceIds };
}

function buildSourceIndex(sourceBlockIds: readonly BlockId[]): Map<BlockId, number> {
  const sourceIndexById = new Map<BlockId, number>();
  for (let i = 0; i < sourceBlockIds.length; i++) {
    sourceIndexById.set(sourceBlockIds[i], i);
  }
  return sourceIndexById;
}

/** Generate operations for proposed blocks */
function generateOps(input: LiquidRefactoringInput, diagnostics: LiquidDiagnostic[]): LiquidOp[] {
  const ops: LiquidOp[] = [];
  let timestamp = Date.now();
  const sourceIndexById = buildSourceIndex(input.sourceBlockIds);
  const flattened = flattenProposedBlocks(input.proposedStructure);

  for (const proposed of flattened) {
    if (!proposed.sourceBlockId) {
      diagnostics.push({
        kind: "new_block",
        detail: `New block at index ${proposed.orderIndex} requires insert operation`,
        severity: "info",
        timestamp: Date.now(),
      });
      continue;
    }

    const sourceId = proposed.sourceBlockId;
    const sourceIdx = sourceIndexById.get(sourceId);
    if (sourceIdx === undefined) {
      diagnostics.push({
        kind: "unknown_source_block",
        detail: `Block ${sourceId} not present in sourceBlockIds; skipping ops`,
        severity: "warning",
        blockId: sourceId,
        timestamp: Date.now(),
      });
      continue;
    }
    ops.push({
      id: nextOpId(),
      opCode: "OP_BLOCK_CONVERT",
      blockId: sourceId,
      targetType: proposed.type,
      newBlockId: proposed.newBlockId,
      timestamp: timestamp++,
    });

    if (sourceIdx !== proposed.orderIndex) {
      ops.push({
        id: nextOpId(),
        opCode: "OP_REORDER",
        blockId: sourceId,
        newIndex: proposed.orderIndex,
        timestamp: timestamp++,
      });
    }
  }
  return ops;
}

/** Plan annotation migrations */
function planAnnotationMigrations(
  annotations: readonly AnnotationInput[],
  blockMapping: BlockMapping,
  diagnostics: LiquidDiagnostic[]
): AnnotationMigration[] {
  const migrations: AnnotationMigration[] = [];

  for (const anno of annotations) {
    const mapped = blockMapping.mapOldToNew(anno.anchor.blockId, anno.anchor.offset);
    if (mapped) {
      const newAnchor: Anchor = {
        ...anno.anchor,
        blockId: mapped.newBlockId,
        offset: mapped.newAbsInBlock,
      };
      const isExact =
        newAnchor.blockId === anno.anchor.blockId && newAnchor.offset === anno.anchor.offset;
      if (!isExact) {
        diagnostics.push({
          kind: "mapped_annotation",
          detail: `Annotation ${anno.id} mapped from ${anno.anchor.blockId}:${anno.anchor.offset} to ${newAnchor.blockId}:${newAnchor.offset}`,
          severity: "info",
          blockId: anno.anchor.blockId as BlockId,
          timestamp: Date.now(),
        });
      }
      migrations.push({
        annotationId: anno.id,
        oldAnchor: anno.anchor,
        newAnchor,
        confidence: isExact ? 1.0 : CONFIDENCE_THRESHOLDS.HIGH,
        method: isExact ? "exact" : "mapped",
      });
    } else {
      diagnostics.push({
        kind: "orphan_annotation",
        detail: `Annotation ${anno.id} on block ${anno.anchor.blockId} requires fuzzy relocation`,
        severity: "warning",
        blockId: anno.anchor.blockId as BlockId,
        timestamp: Date.now(),
      });
      migrations.push({
        annotationId: anno.id,
        oldAnchor: anno.anchor,
        newAnchor: anno.anchor,
        confidence: 0.0,
        method: "fuzzy",
      });
    }
  }
  return migrations;
}

/**
 * Plan a liquid refactoring operation.
 *
 * Instead of destructive delete+insert, this generates structural operations
 * that preserve block identity and allow annotation migration.
 */
export function planLiquidRefactoring(
  input: LiquidRefactoringInput
): Result<LiquidRefactoringResult, ValidationError> {
  const trace = traceId();
  const startTime = performance.now();

  return withTiming(
    "planLiquidRefactoring",
    () => {
      const validationErr = validateInput(input);
      if (validationErr) {
        return Err(validationErr);
      }

      const diagnostics: LiquidDiagnostic[] = [];
      const {
        sourceToProposed: _sourceToProposed,
        affectedBlockIds,
        duplicateSourceIds,
      } = buildSourceMapping(input.proposedStructure);
      if (duplicateSourceIds.size > 0) {
        diagnostics.push({
          kind: "duplicate_source_blocks",
          detail: `Duplicate source blocks detected: ${[...duplicateSourceIds].join(", ")}`,
          severity: "warning",
          timestamp: Date.now(),
        });
      }
      const ops = generateOps(input, diagnostics);
      const blockMappingResult = createLiquidBlockMapping(input.proposedStructure);
      const annotationMigrations = planAnnotationMigrations(
        input.annotations,
        blockMappingResult,
        diagnostics
      );

      const result: LiquidRefactoringResult = {
        traceId: trace,
        success: true,
        ops: Object.freeze([...ops]),
        annotationMigrations: Object.freeze([...annotationMigrations]),
        blockMapping: blockMappingResult,
        affectedBlockIds: Object.freeze([...affectedBlockIds]),
        diagnostics: Object.freeze([...diagnostics]),
        timingMs: performance.now() - startTime,
      };

      return Ok(result);
    },
    { intent: input.intent, sourceBlockCount: input.sourceBlockIds.length }
  );
}

/**
 * Create a BlockMapping from liquid refactoring results.
 */
function createLiquidBlockMapping(proposedStructure: readonly ProposedBlock[]): BlockMapping {
  const sourceToProposed = new Map<BlockId, ProposedBlock>();
  const flattened = flattenProposedBlocks(proposedStructure);
  for (const proposed of flattened) {
    if (proposed.sourceBlockId) {
      sourceToProposed.set(proposed.sourceBlockId, proposed);
    }
  }

  return {
    mapOldToNew(oldBlockId: string, oldAbsInBlock: number) {
      const proposed = sourceToProposed.get(oldBlockId as BlockId);
      if (!proposed) {
        return null; // Block was removed
      }
      const mappedId = proposed.newBlockId ?? (oldBlockId as BlockId);
      // In real impl, would adjust offset based on text changes
      return { newBlockId: mappedId, newAbsInBlock: oldAbsInBlock };
    },
    derivedBlocksFrom(oldBlockId: string) {
      const proposed = sourceToProposed.get(oldBlockId as BlockId);
      if (!proposed) {
        return [];
      }
      const mappedId = proposed.newBlockId ?? (oldBlockId as BlockId);
      return [mappedId]; // Block identity preserved unless replaced
    },
  };
}

/**
 * Validate that a liquid refactoring plan preserves annotation integrity.
 */
export function validateLiquidPlan(result: LiquidRefactoringResult): LiquidPlanValidation {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check for orphaned annotations
  const fuzzyMigrations = result.annotationMigrations.filter((m) => m.method === "fuzzy");
  if (fuzzyMigrations.length > 0) {
    warnings.push(
      validationError(
        "FUZZY_MIGRATIONS",
        `${fuzzyMigrations.length} annotation(s) require fuzzy relocation`,
        { details: { count: fuzzyMigrations.length } }
      )
    );
  }

  // Check for low-confidence migrations
  const lowConfidence = result.annotationMigrations.filter(
    (m) => m.confidence < CONFIDENCE_THRESHOLDS.MEDIUM
  );
  if (lowConfidence.length > 0) {
    warnings.push(
      validationError(
        "LOW_CONFIDENCE_MIGRATIONS",
        `${lowConfidence.length} annotation(s) have low migration confidence`,
        {
          details: {
            count: lowConfidence.length,
            threshold: CONFIDENCE_THRESHOLDS.MEDIUM,
          },
        }
      )
    );
  }

  // Check for critical confidence (below LOW threshold)
  const criticalConfidence = result.annotationMigrations.filter(
    (m) => m.confidence < CONFIDENCE_THRESHOLDS.LOW
  );
  if (criticalConfidence.length > 0) {
    errors.push(
      validationError(
        "CRITICAL_CONFIDENCE_MIGRATIONS",
        `${criticalConfidence.length} annotation(s) have critically low confidence and may be lost`,
        {
          details: {
            count: criticalConfidence.length,
            threshold: CONFIDENCE_THRESHOLDS.LOW,
          },
        }
      )
    );
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze([...errors]),
    warnings: Object.freeze([...warnings]),
  };
}

// ============================================
// Application Phase
// ============================================

/** Callbacks for applying liquid refactoring */
export type ApplyLiquidCallbacks = {
  readonly applyOp: (op: LiquidOp) => Promise<boolean>;
  readonly migrateAnnotation: (migration: AnnotationMigration) => Promise<boolean>;
  readonly onProgress?: (progress: number, message: string) => void;
};

/** Result of applying liquid refactoring */
export type ApplyLiquidResult = {
  readonly traceId: TraceId;
  readonly success: boolean;
  readonly failedOps: readonly LiquidOp[];
  readonly failedMigrations: readonly AnnotationMigration[];
  readonly timingMs: number;
};

/**
 * Apply a liquid refactoring result.
 *
 * This is the execution phase after planning is approved.
 */
export async function applyLiquidRefactoring(
  result: LiquidRefactoringResult,
  callbacks: ApplyLiquidCallbacks
): Promise<ApplyLiquidResult> {
  const trace = traceId();
  const startTime = performance.now();

  const failedOps: LiquidOp[] = [];
  const failedMigrations: AnnotationMigration[] = [];
  const totalSteps = result.ops.length + result.annotationMigrations.length;
  let completedSteps = 0;

  // Apply structural operations first
  for (const op of result.ops) {
    const success = await callbacks.applyOp(op);
    if (!success) {
      failedOps.push(op);
    }
    completedSteps++;
    callbacks.onProgress?.(
      (completedSteps / totalSteps) * 100,
      `Applied ${op.opCode} to ${op.blockId}`
    );
  }

  // Then migrate annotations
  for (const migration of result.annotationMigrations) {
    const success = await callbacks.migrateAnnotation(migration);
    if (!success) {
      failedMigrations.push(migration);
    }
    completedSteps++;
    callbacks.onProgress?.(
      (completedSteps / totalSteps) * 100,
      `Migrated annotation ${migration.annotationId}`
    );
  }

  return {
    traceId: trace,
    success: failedOps.length === 0 && failedMigrations.length === 0,
    failedOps: Object.freeze([...failedOps]),
    failedMigrations: Object.freeze([...failedMigrations]),
    timingMs: performance.now() - startTime,
  };
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a LiquidRefactoringInput from raw data.
 * Converts plain strings to branded types.
 */
export function createLiquidInput(raw: {
  intent: string;
  sourceBlockIds: readonly string[];
  proposedStructure: readonly RawProposedBlock[];
  annotations: readonly {
    id: string;
    anchor: Anchor;
    content: string;
  }[];
}): LiquidRefactoringInput {
  const convertProposedBlock = (block: RawProposedBlock): ProposedBlock => ({
    sourceBlockId: block.sourceBlockId ? blockId(block.sourceBlockId) : null,
    newBlockId: block.newBlockId ? blockId(block.newBlockId) : undefined,
    type: block.type,
    text: block.text,
    orderIndex: block.orderIndex,
    children: block.children ? block.children.map(convertProposedBlock) : undefined,
  });

  return {
    intent: raw.intent,
    sourceBlockIds: raw.sourceBlockIds.map((id) => blockId(id)),
    proposedStructure: raw.proposedStructure.map(convertProposedBlock),
    annotations: raw.annotations.map((a) => ({
      id: annotationId(a.id),
      anchor: a.anchor,
      content: a.content,
    })),
  };
}

type RawProposedBlock = {
  sourceBlockId: string | null;
  newBlockId?: string;
  type: string;
  text: string;
  orderIndex: number;
  children?: readonly RawProposedBlock[];
};
