/**
 * LFCC Security - Annotation Relocation Validation
 *
 * Validates annotation relocations to ensure they don't exceed
 * allowed distances or violate security constraints.
 */

/** Configuration for relocation validation */
export interface RelocationValidatorConfig {
  /** Maximum allowed distance for relocation (in characters) */
  maxRelocationDistance: number;
  /** Whether cross-block relocations are allowed */
  allowCrossBlockRelocation: boolean;
  /** Whether to require context hash for verification */
  requireContextHash: boolean;
  /** Fuzzy tolerance for context matching (0-1) */
  maxFuzzyTolerance: number;
}

/** Default relocation validator configuration */
export const DEFAULT_RELOCATION_VALIDATOR_CONFIG: RelocationValidatorConfig = {
  maxRelocationDistance: 1000,
  allowCrossBlockRelocation: true,
  requireContextHash: false,
  maxFuzzyTolerance: 0.3,
};

/** Input for relocation validation */
export interface RelocationInput {
  originalBlockId: string;
  targetBlockId: string;
  originalOffset: number;
  targetOffset: number;
  originalContextHash?: string;
  targetContextHash?: string;
}

/** Result of relocation validation */
export interface RelocationValidationResult {
  /** Whether the relocation is valid */
  valid: boolean;
  /** Error code if invalid */
  code?: "DISTANCE_EXCEEDED" | "CROSS_BLOCK_DENIED" | "CONTEXT_MISMATCH";
  /** Human-readable message */
  message?: string;
  /** Computed distance */
  distance: number;
}

/**
 * Validator for annotation relocations.
 *
 * Ensures that annotations are not relocated beyond acceptable
 * distances or across blocks when disabled.
 */
export class RelocationValidator {
  private config: RelocationValidatorConfig;

  constructor(config: Partial<RelocationValidatorConfig> = {}) {
    this.config = { ...DEFAULT_RELOCATION_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Validate a proposed relocation.
   */
  validateRelocation(input: RelocationInput): RelocationValidationResult {
    const {
      originalBlockId,
      targetBlockId,
      originalOffset,
      targetOffset,
      originalContextHash,
      targetContextHash,
    } = input;

    // Check cross-block relocation
    if (originalBlockId !== targetBlockId && !this.config.allowCrossBlockRelocation) {
      return {
        valid: false,
        code: "CROSS_BLOCK_DENIED",
        message: "Cross-block relocations are not allowed by policy",
        distance: Number.POSITIVE_INFINITY,
      };
    }

    // Calculate distance
    const distance =
      originalBlockId === targetBlockId
        ? Math.abs(targetOffset - originalOffset)
        : Number.POSITIVE_INFINITY; // Cross-block distance is considered infinite for distance checks

    // Check distance limit (only for same-block)
    if (originalBlockId === targetBlockId && distance > this.config.maxRelocationDistance) {
      return {
        valid: false,
        code: "DISTANCE_EXCEEDED",
        message: `Relocation distance ${distance} exceeds maximum ${this.config.maxRelocationDistance}`,
        distance,
      };
    }

    // Check context hash if required
    if (this.config.requireContextHash) {
      if (!originalContextHash || !targetContextHash) {
        return {
          valid: false,
          code: "CONTEXT_MISMATCH",
          message: "Context hash required but not provided",
          distance,
        };
      }

      // For now, simple equality check; could implement fuzzy matching
      if (originalContextHash !== targetContextHash) {
        return {
          valid: false,
          code: "CONTEXT_MISMATCH",
          message: "Context hashes do not match",
          distance,
        };
      }
    }

    return { valid: true, distance };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): RelocationValidatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<RelocationValidatorConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
