/**
 * Security Integration for Annotation Verification
 *
 * Bridges @ku0/core security validators with LFCC-Bridge verification sync.
 * Provides P0.2 security validation for annotation relocations.
 */

import {
  RelocationValidator as CoreRelocationValidator,
  DEFAULT_RELOCATION_VALIDATOR_CONFIG,
  type RelocationValidationResult,
  type RelocationValidatorConfig,
} from "@ku0/core/security";
import type { RelocationValidator } from "./verificationSync";

// ============================================================================
// Types
// ============================================================================

/** Security integration configuration */
export interface SecurityIntegrationConfig {
  /** Enable relocation validation */
  enableRelocationValidation: boolean;
  /** Relocation validator configuration */
  relocationConfig: Partial<RelocationValidatorConfig>;
  /** Audit callback for security events */
  onSecurityEvent?: (event: SecurityEvent) => void;
}

/** Security event for audit logging */
export interface SecurityEvent {
  type: "relocation_validated" | "relocation_rejected" | "relocation_warning";
  timestamp: number;
  annotationId: string;
  originalSpan: { blockId: string; start: number; end: number };
  relocatedSpan: { blockId: string; start: number; end: number };
  result: RelocationValidationResult;
  details?: Record<string, unknown>;
}

/** Default security integration configuration */
export const DEFAULT_SECURITY_INTEGRATION_CONFIG: SecurityIntegrationConfig = {
  enableRelocationValidation: true,
  relocationConfig: DEFAULT_RELOCATION_VALIDATOR_CONFIG,
};

// ============================================================================
// Relocation Validator Factory
// ============================================================================

/**
 * Create a RelocationValidator compatible with verificationSync.
 *
 * This bridges the @ku0/core security validator with the
 * LFCC-Bridge verification sync pipeline.
 */
export function createSecureRelocationValidator(
  config: Partial<SecurityIntegrationConfig> = {}
): RelocationValidator {
  const fullConfig: SecurityIntegrationConfig = {
    ...DEFAULT_SECURITY_INTEGRATION_CONFIG,
    ...config,
  };

  // Create core validator
  const coreValidator = new CoreRelocationValidator(fullConfig.relocationConfig);

  return (
    annotationId: string,
    originalSpan: { blockId: string; start: number; end: number },
    relocatedSpan: { blockId: string; start: number; end: number },
    _blockLength: number,
    _documentBlockOrder?: string[]
  ): { ok: boolean; requiresConfirmation: boolean; error?: string } => {
    // Skip validation if disabled
    if (!fullConfig.enableRelocationValidation) {
      return { ok: true, requiresConfirmation: false };
    }

    // Validate using core validator
    const result = coreValidator.validateRelocation({
      originalBlockId: originalSpan.blockId,
      targetBlockId: relocatedSpan.blockId,
      originalOffset: originalSpan.start,
      targetOffset: relocatedSpan.start,
      // Context hashes would be provided if available
    });

    // Emit security event
    const event: SecurityEvent = {
      type: result.valid ? "relocation_validated" : "relocation_rejected",
      timestamp: Date.now(),
      annotationId,
      originalSpan,
      relocatedSpan,
      result,
      details: { distance: result.distance },
    };
    fullConfig.onSecurityEvent?.(event);

    if (!result.valid) {
      return {
        ok: false,
        requiresConfirmation: false,
        error: result.message ?? `Relocation validation failed: ${result.code}`,
      };
    }

    // Check if relocation requires user confirmation (e.g., large distance)
    const requiresConfirmation = shouldRequireConfirmation(
      originalSpan,
      relocatedSpan,
      fullConfig.relocationConfig
    );

    if (requiresConfirmation) {
      fullConfig.onSecurityEvent?.({
        type: "relocation_warning",
        timestamp: Date.now(),
        annotationId,
        originalSpan,
        relocatedSpan,
        result,
        details: { requiresConfirmation: true },
      });
    }

    return { ok: true, requiresConfirmation };
  };
}

/**
 * Check if a relocation should require user confirmation.
 */
function shouldRequireConfirmation(
  originalSpan: { blockId: string; start: number; end: number },
  relocatedSpan: { blockId: string; start: number; end: number },
  config: Partial<RelocationValidatorConfig>
): boolean {
  const maxDistance =
    config.maxRelocationDistance ?? DEFAULT_RELOCATION_VALIDATOR_CONFIG.maxRelocationDistance;

  // Require confirmation if:
  // 1. Cross-block relocation
  if (originalSpan.blockId !== relocatedSpan.blockId) {
    return true;
  }

  // 2. Large distance (> 50% of max allowed)
  const distance = Math.abs(relocatedSpan.start - originalSpan.start);
  if (distance > maxDistance * 0.5) {
    return true;
  }

  return false;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate a single relocation (convenience function).
 */
export function validateAnnotationRelocation(
  annotationId: string,
  originalSpan: { blockId: string; start: number; end: number },
  relocatedSpan: { blockId: string; start: number; end: number },
  config: Partial<SecurityIntegrationConfig> = {}
): { valid: boolean; requiresConfirmation: boolean; error?: string } {
  const validator = createSecureRelocationValidator(config);
  const result = validator(annotationId, originalSpan, relocatedSpan, 0);
  return {
    valid: result.ok,
    requiresConfirmation: result.requiresConfirmation,
    error: result.error,
  };
}

/**
 * Create a strict relocation validator (no cross-block, small distance).
 */
export function createStrictRelocationValidator(
  onSecurityEvent?: (event: SecurityEvent) => void
): RelocationValidator {
  return createSecureRelocationValidator({
    enableRelocationValidation: true,
    relocationConfig: {
      maxRelocationDistance: 100,
      allowCrossBlockRelocation: false,
      requireContextHash: true,
      maxFuzzyTolerance: 0.1,
    },
    onSecurityEvent,
  });
}

/**
 * Create a permissive relocation validator (for migrations, imports).
 */
export function createPermissiveRelocationValidator(
  onSecurityEvent?: (event: SecurityEvent) => void
): RelocationValidator {
  return createSecureRelocationValidator({
    enableRelocationValidation: true,
    relocationConfig: {
      maxRelocationDistance: 10000,
      allowCrossBlockRelocation: true,
      requireContextHash: false,
      maxFuzzyTolerance: 0.5,
    },
    onSecurityEvent,
  });
}
