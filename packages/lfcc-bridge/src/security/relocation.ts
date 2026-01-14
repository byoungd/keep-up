/**
 * LFCC v0.9 RC - Relocation Security
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/18_Security_Best_Practices.md
 *
 * Implements relocation policy validation with security boundaries
 * for Level 1 (exact), Level 2 (distance limit), and Level 3 (block radius).
 */

import type { RelocationPolicy } from "@ku0/core";
import type { SpanRange } from "../selection/selectionMapping";

export type RelocationLevel = 1 | 2 | 3;

export type BlockOrder = Map<string, number>;

export type RelocationResult = {
  ok: boolean;
  error?: RelocationError;
  requiresConfirmation: boolean;
  distance?: number;
  blockRadius?: number;
};

/**
 * Options for relocation validation (P0.3)
 */
export type RelocationValidationOptions = {
  /** Block order map for computing radius (required for Level 3) */
  blockOrder?: BlockOrder;
};

export type RelocationError = {
  code: string;
  message: string;
  detail?: string;
};

export type UserConfirmation = {
  annotationId: string;
  originalSpan: SpanRange;
  relocatedSpan: SpanRange;
  level: RelocationLevel;
  timestamp: number;
};

/**
 * Relocation Security Validator
 */
export class RelocationSecurity {
  private policy: RelocationPolicy;
  private confirmations: Map<string, UserConfirmation> = new Map();

  constructor(policy: RelocationPolicy) {
    this.policy = policy;
  }

  /**
   * Validate relocation according to policy
   */
  validateRelocation(
    originalSpan: SpanRange,
    relocatedSpan: SpanRange,
    level: RelocationLevel,
    blockLength: number,
    options?: RelocationValidationOptions
  ): RelocationResult {
    // Level 1: Exact match only (no relocation allowed)
    if (level === 1) {
      return {
        ok: false,
        error: {
          code: "RELOCATION_NOT_ALLOWED",
          message: "Level 1 relocation requires exact match only",
        },
        requiresConfirmation: false,
      };
    }

    // Level 2: Distance limit validation
    if (level === 2) {
      if (!this.policy.enable_level_2) {
        return {
          ok: false,
          error: {
            code: "LEVEL_2_DISABLED",
            message: "Level 2 relocation is disabled by policy",
          },
          requiresConfirmation: false,
        };
      }

      const distance = this.computeDistance(originalSpan, relocatedSpan, blockLength);
      const maxDistance = this.policy.level_2_max_distance_ratio * blockLength;

      if (distance > maxDistance) {
        return {
          ok: false,
          error: {
            code: "RELOCATION_DISTANCE_EXCEEDED",
            message: `Relocation distance ${distance} exceeds maximum ${maxDistance}`,
            detail: `Max allowed: ${(this.policy.level_2_max_distance_ratio * 100).toFixed(1)}% of block length`,
          },
          requiresConfirmation: false,
          distance,
        };
      }

      // Level 2 requires user confirmation
      return {
        ok: true,
        requiresConfirmation: true,
        distance,
      };
    }

    // Level 3: Block radius validation
    if (level === 3) {
      if (!this.policy.enable_level_3) {
        return {
          ok: false,
          error: {
            code: "LEVEL_3_DISABLED",
            message: "Level 3 relocation is disabled by policy",
          },
          requiresConfirmation: false,
        };
      }

      // P0.3: Require block order for Level 3 validation
      if (!options?.blockOrder) {
        return {
          ok: false,
          error: {
            code: "BLOCK_ORDER_REQUIRED",
            message: "Block order is required for Level 3 relocation validation",
          },
          requiresConfirmation: false,
        };
      }

      const blockRadius = this.computeBlockRadius(originalSpan, relocatedSpan, options.blockOrder);

      if (blockRadius > this.policy.level_3_max_block_radius) {
        return {
          ok: false,
          error: {
            code: "RELOCATION_BLOCK_RADIUS_EXCEEDED",
            message: `Block radius ${blockRadius} exceeds maximum ${this.policy.level_3_max_block_radius}`,
            detail: `Max allowed: ${this.policy.level_3_max_block_radius} blocks`,
          },
          requiresConfirmation: false,
          blockRadius,
        };
      }

      // Level 3 requires explicit user confirmation
      return {
        ok: true,
        requiresConfirmation: true,
        blockRadius,
      };
    }

    return {
      ok: false,
      error: {
        code: "INVALID_RELOCATION_LEVEL",
        message: `Invalid relocation level: ${level}`,
      },
      requiresConfirmation: false,
    };
  }

  /**
   * Check if user confirmation exists for relocation
   */
  hasUserConfirmation(
    annotationId: string,
    originalSpan: SpanRange,
    relocatedSpan: SpanRange,
    level: RelocationLevel
  ): boolean {
    const key = this.getConfirmationKey(annotationId, originalSpan, relocatedSpan, level);
    const confirmation = this.confirmations.get(key);

    if (!confirmation) {
      return false;
    }

    // Check if confirmation is still valid (not expired)
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    if (now - confirmation.timestamp > maxAge) {
      this.confirmations.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Record user confirmation for relocation
   */
  recordUserConfirmation(
    annotationId: string,
    originalSpan: SpanRange,
    relocatedSpan: SpanRange,
    level: RelocationLevel
  ): void {
    const key = this.getConfirmationKey(annotationId, originalSpan, relocatedSpan, level);
    this.confirmations.set(key, {
      annotationId,
      originalSpan,
      relocatedSpan,
      level,
      timestamp: Date.now(),
    });
  }

  /**
   * Compute distance between spans (in UTF-16 code units)
   * Returns absolute distance, not normalized
   */
  computeDistance(span1: SpanRange, span2: SpanRange, _blockLength: number): number {
    // If spans are in different blocks, distance is infinite
    if (span1.blockId !== span2.blockId) {
      return Number.POSITIVE_INFINITY;
    }

    // Compute distance between span centers
    const center1 = (span1.start + span1.end) / 2;
    const center2 = (span2.start + span2.end) / 2;
    const distance = Math.abs(center2 - center1);

    // Return absolute distance (will be compared against maxDistance which is already normalized)
    return distance;
  }

  /**
   * Compute block radius (number of blocks between spans) - P0.3 Fix
   * Returns the distance in block order between the two spans
   */
  computeBlockRadius(span1: SpanRange, span2: SpanRange, blockOrder: BlockOrder): number {
    // If spans are in the same block, radius is 0
    if (span1.blockId === span2.blockId) {
      return 0;
    }

    // Get block positions from order map
    const pos1 = blockOrder.get(span1.blockId);
    const pos2 = blockOrder.get(span2.blockId);

    // If either block is not in the order map, return a large radius (reject)
    if (pos1 === undefined || pos2 === undefined) {
      return Number.POSITIVE_INFINITY;
    }

    // Compute absolute distance in block order
    return Math.abs(pos2 - pos1);
  }

  /**
   * Get confirmation key for tracking
   */
  private getConfirmationKey(
    annotationId: string,
    originalSpan: SpanRange,
    relocatedSpan: SpanRange,
    level: RelocationLevel
  ): string {
    return `${annotationId}:${level}:${originalSpan.blockId}:${originalSpan.start}:${originalSpan.end}:${relocatedSpan.blockId}:${relocatedSpan.start}:${relocatedSpan.end}`;
  }

  /**
   * Clear expired confirmations
   */
  clearExpiredConfirmations(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, confirmation] of this.confirmations.entries()) {
      if (now - confirmation.timestamp > maxAge) {
        this.confirmations.delete(key);
      }
    }
  }
}

/**
 * Create a relocation security validator
 */
export function createRelocationSecurity(policy: RelocationPolicy): RelocationSecurity {
  return new RelocationSecurity(policy);
}
