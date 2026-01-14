/**
 * LFCC Conformance Kit - Adapter Interfaces (Part A)
 *
 * Pluggable interfaces for Loro, Shadow Model, and Canonicalizer.
 * Allows running with real implementations or mocks/stubs.
 */

import type { CanonNode } from "@ku0/core";
import type { FuzzOp } from "../op-fuzzer/types";

/**
 * Adapter for Loro replicated state
 */
export interface LoroAdapter {
  /** Load document from snapshot bytes */
  loadSnapshot(bytes: Uint8Array): void;

  /** Export current state as snapshot bytes */
  exportSnapshot(): Uint8Array;

  /** Apply a fuzz operation */
  applyOp(op: FuzzOp): ApplyResult;

  /** Get frontier tag for logging (encoded version vector) */
  getFrontierTag(): string;

  /** Get list of block IDs in document order */
  getBlockIds(): string[];

  /** Get block by ID */
  getBlock(blockId: string): BlockInfo | null;

  /** Get text length of a block */
  getTextLength(blockId: string): number;
}

/**
 * Adapter for LFCC Shadow Model
 */
export interface ShadowAdapter {
  /** Load document from snapshot bytes */
  loadSnapshot(bytes: Uint8Array): void;

  /** Export current state as snapshot bytes */
  exportSnapshot(): Uint8Array;

  /** Apply a fuzz operation */
  applyOp(op: FuzzOp): ApplyResult;

  /** Get list of block IDs in document order */
  getBlockIds(): string[];

  /** Get block by ID */
  getBlock(blockId: string): BlockInfo | null;

  /** Get text length of a block */
  getTextLength(blockId: string): number;
}

/**
 * Adapter for canonicalization
 */
export interface CanonicalizerAdapter {
  /** Canonicalize from Loro state */
  canonicalizeFromLoro(loro: LoroAdapter): CanonNode;

  /** Canonicalize from Shadow state */
  canonicalizeFromShadow(shadow: ShadowAdapter): CanonNode;

  /** Optional: Canonicalize from ProseMirror doc JSON */
  canonicalizeFromPm?(pmDocJson: unknown): CanonNode;
}

/**
 * Result of applying an operation
 */
export type ApplyResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Block information for generators
 */
export type BlockInfo = {
  id: string;
  type: string;
  textLength: number;
  parentId: string | null;
  childIds: string[];
  marks: MarkInfo[];
};

/**
 * Mark information
 */
export type MarkInfo = {
  type: string;
  from: number;
  to: number;
  attrs?: Record<string, unknown>;
};

/**
 * Adapter factory for creating adapters
 */
export interface AdapterFactory {
  createLoroAdapter(): LoroAdapter;
  createShadowAdapter(): ShadowAdapter;
  createCanonicalizerAdapter(): CanonicalizerAdapter;
}
