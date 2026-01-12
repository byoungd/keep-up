/**
 * LFCC v0.9 RC - AI Gateway Dry-Run Pipeline
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md Section B
 *
 * Pipeline stages:
 * 1. Sanitize - Whitelist tags/attrs, strip unsafe content
 * 2. Normalize - Convert to LFCC Canonical Tree
 * 3. Schema Apply Simulation - Validate against editor schema
 */

import { dryRunAIPayload } from "../kernel/ai/dryRun";
import { createSanitizer } from "../kernel/ai/sanitizer";
import type {
  AIPayloadSanitizer,
  AISanitizationPolicyV1,
  EditorSchemaValidator,
} from "../kernel/ai/types";
import { DEFAULT_AI_SANITIZATION_POLICY } from "../kernel/ai/types";
import type { CanonNode } from "../kernel/canonicalizer/types";
import type { GatewayDiagnostic } from "./types";

// ============================================================================
// Pipeline Result Types
// ============================================================================

/** Pipeline stage */
export type PipelineStage = "sanitize" | "normalize" | "schema_validate";

/** Pipeline result */
export type PipelineResult =
  | { ok: true; canonRoot: CanonNode; diagnostics: GatewayDiagnostic[] }
  | { ok: false; stage: PipelineStage; reason: string; diagnostics: GatewayDiagnostic[] };

// ============================================================================
// Pipeline Configuration
// ============================================================================

/** Pipeline configuration */
export type PipelineConfig = {
  /** Sanitization policy */
  sanitizationPolicy: AISanitizationPolicyV1;
  /** Custom sanitizer (optional) */
  sanitizer?: AIPayloadSanitizer;
  /** Custom schema validator (optional) */
  schemaValidator?: EditorSchemaValidator;
  /** Skip schema validation (dev only) */
  skipSchemaValidation?: boolean;
};

/** Default pipeline configuration */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  sanitizationPolicy: DEFAULT_AI_SANITIZATION_POLICY,
};

// ============================================================================
// Pipeline Implementation
// ============================================================================

/**
 * Execute the dry-run pipeline
 *
 * Fail-closed: Any stage failure rejects the entire payload.
 */
export async function executePipeline(
  payload: { html?: string; markdown?: string },
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): Promise<PipelineResult> {
  const diagnostics: GatewayDiagnostic[] = [];

  // Validate input
  if (!payload.html && !payload.markdown) {
    return {
      ok: false,
      stage: "sanitize",
      reason: "No payload provided (html or markdown required)",
      diagnostics,
    };
  }

  // Get sanitizer
  const sanitizer = config.sanitizer ?? createSanitizer();

  // Get schema validator
  const schemaValidator = config.schemaValidator ?? createPassThroughValidator();

  // Execute dry-run pipeline
  const result = await dryRunAIPayload(
    payload,
    sanitizer,
    schemaValidator,
    config.sanitizationPolicy
  );

  // Convert diagnostics
  for (const diag of result.diagnostics) {
    diagnostics.push({
      severity: diag.kind.startsWith("removed") ? "warning" : "info",
      kind: diag.kind,
      detail: diag.detail,
    });
  }

  if (!result.ok) {
    // Determine which stage failed
    const stage = determineFailedStage(result.reason ?? "Unknown error");

    return {
      ok: false,
      stage,
      reason: result.reason ?? "Pipeline failed",
      diagnostics,
    };
  }

  // Ensure we have a canonical root
  if (!result.canon_root) {
    return {
      ok: false,
      stage: "normalize",
      reason: "Canonicalization produced no output",
      diagnostics,
    };
  }

  return {
    ok: true,
    canonRoot: result.canon_root,
    diagnostics,
  };
}

/**
 * Determine which stage failed based on error message
 */
function determineFailedStage(reason: string): PipelineStage {
  const lower = reason.toLowerCase();

  if (lower.includes("sanitiz") || lower.includes("payload")) {
    return "sanitize";
  }
  if (lower.includes("canonical") || lower.includes("normaliz")) {
    return "normalize";
  }
  if (lower.includes("schema") || lower.includes("valid")) {
    return "schema_validate";
  }

  return "sanitize"; // Default to first stage
}

/**
 * Create a pass-through validator (accepts all)
 */
function createPassThroughValidator(): EditorSchemaValidator {
  return {
    dryRunApply(_input: { html?: string; markdown?: string }) {
      return { ok: true };
    },
  };
}

// ============================================================================
// Malicious Payload Detection
// ============================================================================

/** Known malicious patterns (scoped to tags/attributes) */
const MALICIOUS_PATTERNS = [
  /<\s*script\b/i,
  /<\s*style\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*form\b/i,
  /<[^>]+\son\w+\s*=\s*["'][^"']*["']/i,
  /<[^>]+\s(?:href|src|srcset|poster|xlink:href)\s*=\s*["'][^"']*(?:javascript|vbscript|data)\s*:/i,
  /<[^>]+\sstyle\s*=\s*["'][^"']*(expression\s*\(|url\s*\(\s*["']?\s*javascript)/i,
];

/** Combined RegExp for fast rejection */
const COMBINED_MALICIOUS_PATTERN = new RegExp(
  MALICIOUS_PATTERNS.map((p) => p.source).join("|"),
  "i"
);

/**
 * Quick check for obviously malicious payloads
 * This is a fast pre-check before full sanitization.
 */
export function detectMaliciousPayload(payload: string): {
  isMalicious: boolean;
  patterns: string[];
} {
  // Fast path: single pass check
  if (!COMBINED_MALICIOUS_PATTERN.test(payload)) {
    return { isMalicious: false, patterns: [] };
  }

  // Slow path: identify specific patterns for reporting
  const matched: string[] = [];
  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(payload)) {
      matched.push(pattern.source);
    }
  }

  return {
    isMalicious: true,
    patterns: matched,
  };
}

// ============================================================================
// Payload Size Validation
// ============================================================================

/** Size limits */
export const SIZE_LIMITS = {
  /** Maximum payload size (1MB) */
  maxPayloadBytes: 1024 * 1024,
  /** Maximum number of nodes */
  maxNodes: 10000,
  /** Maximum nesting depth */
  maxDepth: 50,
} as const;

/**
 * Validate payload size
 */
export function validatePayloadSize(payload: string): {
  ok: boolean;
  size: number;
  limit: number;
} {
  const size = new TextEncoder().encode(payload).length;
  return {
    ok: size <= SIZE_LIMITS.maxPayloadBytes,
    size,
    limit: SIZE_LIMITS.maxPayloadBytes,
  };
}

// ============================================================================
// Pipeline Builder
// ============================================================================

/**
 * Builder for creating customized pipelines
 */
export class PipelineBuilder {
  private config: PipelineConfig;

  constructor() {
    this.config = { ...DEFAULT_PIPELINE_CONFIG };
  }

  /**
   * Set sanitization policy
   */
  withSanitizationPolicy(policy: AISanitizationPolicyV1): this {
    this.config.sanitizationPolicy = policy;
    return this;
  }

  /**
   * Set custom sanitizer
   */
  withSanitizer(sanitizer: AIPayloadSanitizer): this {
    this.config.sanitizer = sanitizer;
    return this;
  }

  /**
   * Set custom schema validator
   */
  withSchemaValidator(validator: EditorSchemaValidator): this {
    this.config.schemaValidator = validator;
    return this;
  }

  /**
   * Skip schema validation (dev only)
   */
  skipSchemaValidation(): this {
    this.config.skipSchemaValidation = true;
    return this;
  }

  /**
   * Build the pipeline executor
   */
  build(): (payload: { html?: string; markdown?: string }) => Promise<PipelineResult> {
    const config = { ...this.config };
    return (payload) => executePipeline(payload, config);
  }

  /**
   * Get current configuration
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }
}

/**
 * Create a new pipeline builder
 */
export function createPipelineBuilder(): PipelineBuilder {
  return new PipelineBuilder();
}
