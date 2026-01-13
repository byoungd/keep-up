/**
 * LFCC v0.9 RC - AI Security Validator
 *
 * Security validation for AI-generated payloads.
 * Integrates with AI Gateway and verification sync pipelines.
 *
 * Features:
 * - XSS prevention (script, event handlers, data URIs)
 * - DoS prevention (payload size, depth limits)
 * - Content validation (allowed tags, attributes)
 * - Relocation validation (prevents unauthorized span movement)
 */

import type { AISanitizationPolicyV1 } from "../kernel/ai/types.js";
import { DEFAULT_AI_SANITIZATION_POLICY } from "../kernel/ai/types.js";

// ============================================================================
// Types
// ============================================================================

/** AI payload validation configuration */
export interface AIValidatorConfig {
  /** Maximum payload size in bytes */
  maxPayloadSize: number;
  /** Maximum nesting depth */
  maxNestingDepth: number;
  /** Maximum number of elements */
  maxElementCount: number;
  /** Blocked tag patterns (regex) */
  blockedTags: RegExp[];
  /** Blocked attribute patterns (regex) */
  blockedAttributes: RegExp[];
  /** Blocked URL schemes */
  blockedUrlSchemes: string[];
  /** Enable XSS detection */
  enableXssDetection: boolean;
  /** Enable DoS detection */
  enableDosDetection: boolean;
  /** Sanitization policy */
  sanitizationPolicy: AISanitizationPolicyV1;
}

/** Validation result */
export interface AIValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Error code if invalid */
  code?: AIValidationErrorCode;
  /** Human-readable message */
  message?: string;
  /** Detailed findings */
  findings?: AISecurityFinding[];
  /** Severity (for valid payloads with warnings) */
  severity?: "error" | "warning" | "info";
}

/** Validation error codes */
export type AIValidationErrorCode =
  | "XSS_DETECTED"
  | "DOS_RISK"
  | "PAYLOAD_TOO_LARGE"
  | "NESTING_TOO_DEEP"
  | "ELEMENT_COUNT_EXCEEDED"
  | "BLOCKED_TAG"
  | "BLOCKED_ATTRIBUTE"
  | "BLOCKED_URL_SCHEME"
  | "MALFORMED_HTML"
  | "INVALID_STRUCTURE";

/** Security finding */
export interface AISecurityFinding {
  /** Finding type */
  type: AIValidationErrorCode;
  /** Severity */
  severity: "error" | "warning" | "info";
  /** Description */
  description: string;
  /** Location (if applicable) */
  location?: string;
  /** Recommendation */
  recommendation?: string;
}

/** Relocation validation configuration */
export interface RelocationValidatorConfig {
  /** Maximum relocation distance (character offset) */
  maxRelocationDistance: number;
  /** Allow cross-block relocation */
  allowCrossBlockRelocation: boolean;
  /** Require context hash match */
  requireContextHash: boolean;
  /** Maximum fuzzy match tolerance */
  maxFuzzyTolerance: number;
}

/** Relocation validation result */
export interface RelocationValidationResult {
  /** Whether relocation is valid */
  valid: boolean;
  /** Error code if invalid */
  code?:
    | "DISTANCE_EXCEEDED"
    | "CROSS_BLOCK_DENIED"
    | "CONTEXT_MISMATCH"
    | "FUZZY_THRESHOLD_EXCEEDED";
  /** Human-readable message */
  message?: string;
  /** Computed relocation distance */
  distance?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default AI validator configuration */
export const DEFAULT_AI_VALIDATOR_CONFIG: AIValidatorConfig = {
  maxPayloadSize: 512 * 1024, // 512KB
  maxNestingDepth: 32,
  maxElementCount: 10000,
  blockedTags: [
    /^script$/i,
    /^style$/i,
    /^iframe$/i,
    /^object$/i,
    /^embed$/i,
    /^form$/i,
    /^input$/i,
    /^button$/i,
    /^select$/i,
    /^textarea$/i,
    /^meta$/i,
    /^link$/i,
    /^base$/i,
    /^applet$/i,
    /^frame$/i,
    /^frameset$/i,
    /^layer$/i,
    /^bgsound$/i,
  ],
  blockedAttributes: [
    /^on\w+$/i, // Event handlers: onclick, onload, etc.
    /^javascript:/i,
    /^vbscript:/i,
    /^data:/i, // Data URIs (potential XSS vector)
    /^expression\(/i, // CSS expressions (IE)
    /^behavior:/i, // IE behaviors
    /-moz-binding/i, // Firefox XBL
  ],
  blockedUrlSchemes: ["javascript:", "vbscript:", "data:", "blob:", "file:"],
  enableXssDetection: true,
  enableDosDetection: true,
  sanitizationPolicy: DEFAULT_AI_SANITIZATION_POLICY,
};

/** Default relocation validator configuration */
export const DEFAULT_RELOCATION_VALIDATOR_CONFIG: RelocationValidatorConfig = {
  maxRelocationDistance: 1000, // Characters
  allowCrossBlockRelocation: false,
  requireContextHash: true,
  maxFuzzyTolerance: 0.3, // 30% tolerance
};

// ============================================================================
// AI Payload Validator
// ============================================================================

/**
 * AI Payload Validator
 *
 * Validates AI-generated payloads for security risks.
 * Should be called BEFORE the dry-run pipeline.
 */
export class AIPayloadValidator {
  private config: AIValidatorConfig;

  constructor(config: Partial<AIValidatorConfig> = {}) {
    this.config = { ...DEFAULT_AI_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Validate an AI payload.
   */
  /**
   * Validate an AI payload.
   */
  validate(payload: { html?: string; markdown?: string }): AIValidationResult {
    const findings: AISecurityFinding[] = [];

    // Get content to validate
    const content = payload.html ?? payload.markdown ?? "";
    if (!content) {
      return { valid: true };
    }

    // 1. Size validation
    const sizeResult = this.runSizeValidation(content);
    if (!sizeResult.valid) {
      return sizeResult;
    }

    // 2. XSS detection
    if (this.config.enableXssDetection) {
      const xssResult = this.runXssValidation(content, findings);
      if (!xssResult.valid) {
        return xssResult;
      }
    }

    // 3. Structure validation (for HTML)
    if (payload.html) {
      const structureResult = this.runStructureValidation(payload.html, findings);
      if (!structureResult.valid) {
        return structureResult;
      }
    }

    // 4. DoS detection
    if (this.config.enableDosDetection && payload.html) {
      const dosResult = this.runDosValidation(payload.html, findings);
      if (!dosResult.valid) {
        return dosResult;
      }
    }

    // All checks passed
    const hasWarnings = findings.some((f) => f.severity === "warning");
    return {
      valid: true,
      findings: findings.length > 0 ? findings : undefined,
      severity: hasWarnings ? "warning" : "info",
    };
  }

  private runSizeValidation(content: string): AIValidationResult {
    if (this.config.enableDosDetection) {
      const sizeResult = this.validateSize(content);
      if (!sizeResult.valid) {
        return sizeResult;
      }
    }
    return { valid: true };
  }

  private runXssValidation(content: string, findings: AISecurityFinding[]): AIValidationResult {
    const xssFindings = this.detectXss(content);
    findings.push(...xssFindings);

    const xssErrors = xssFindings.filter((f) => f.severity === "error");
    if (xssErrors.length > 0) {
      return {
        valid: false,
        code: "XSS_DETECTED",
        message: `XSS risk detected: ${xssErrors.map((f) => f.description).join("; ")}`,
        findings,
        severity: "error",
      };
    }
    return { valid: true };
  }

  private runStructureValidation(html: string, findings: AISecurityFinding[]): AIValidationResult {
    const structureResult = this.validateStructure(html);
    if (!structureResult.valid) {
      return { ...structureResult, findings };
    }
    if (structureResult.findings) {
      findings.push(...structureResult.findings);
    }
    return { valid: true };
  }

  private runDosValidation(html: string, findings: AISecurityFinding[]): AIValidationResult {
    const dosResult = this.detectDos(html);
    if (!dosResult.valid) {
      return { ...dosResult, findings };
    }
    if (dosResult.findings) {
      findings.push(...dosResult.findings);
    }
    return { valid: true };
  }

  /**
   * Validate payload size.
   */
  private validateSize(content: string): AIValidationResult {
    const sizeBytes = new TextEncoder().encode(content).length;

    if (sizeBytes > this.config.maxPayloadSize) {
      return {
        valid: false,
        code: "PAYLOAD_TOO_LARGE",
        message: `Payload size ${sizeBytes} bytes exceeds limit of ${this.config.maxPayloadSize} bytes`,
        severity: "error",
      };
    }

    return { valid: true };
  }

  /**
   * Detect XSS vulnerabilities.
   */
  private detectXss(content: string): AISecurityFinding[] {
    const findings: AISecurityFinding[] = [];

    // Check for blocked tags
    for (const pattern of this.config.blockedTags) {
      const tagMatch = content.match(new RegExp(`<${pattern.source}[\\s>]`, "gi"));
      if (tagMatch) {
        findings.push({
          type: "BLOCKED_TAG",
          severity: "error",
          description: `Blocked tag detected: ${tagMatch[0]}`,
          recommendation: "Remove script, style, iframe, and other potentially dangerous tags",
        });
      }
    }

    // Check for event handlers
    const eventHandlerPattern = /\bon\w+\s*=\s*["'][^"']*["']/gi;
    const eventHandlers = content.match(eventHandlerPattern);
    if (eventHandlers) {
      findings.push({
        type: "BLOCKED_ATTRIBUTE",
        severity: "error",
        description: `Event handler detected: ${eventHandlers.slice(0, 3).join(", ")}${eventHandlers.length > 3 ? "..." : ""}`,
        recommendation: "Remove all on* event handler attributes",
      });
    }

    // Check for javascript: URLs
    const jsUrlPattern = /(?:href|src|action|data)\s*=\s*["']?\s*javascript:/gi;
    if (jsUrlPattern.test(content)) {
      findings.push({
        type: "BLOCKED_URL_SCHEME",
        severity: "error",
        description: "javascript: URL scheme detected",
        recommendation: "Use https: or relative URLs only",
      });
    }

    // Check for data: URLs (potential XSS vector)
    const dataUrlPattern = /(?:href|src)\s*=\s*["']?\s*data:/gi;
    if (dataUrlPattern.test(content)) {
      findings.push({
        type: "BLOCKED_URL_SCHEME",
        severity: "warning",
        description: "data: URL scheme detected",
        recommendation: "Avoid data: URLs in links and images",
      });
    }

    // Check for CSS expressions
    const cssExpressionPattern = /expression\s*\(/gi;
    if (cssExpressionPattern.test(content)) {
      findings.push({
        type: "XSS_DETECTED",
        severity: "error",
        description: "CSS expression detected",
        recommendation: "Remove CSS expressions",
      });
    }

    // Check for base64 encoded scripts
    const base64ScriptPattern = /<script[^>]*src\s*=\s*["']data:text\/javascript;base64,/gi;
    if (base64ScriptPattern.test(content)) {
      findings.push({
        type: "XSS_DETECTED",
        severity: "error",
        description: "Base64 encoded script detected",
        recommendation: "Remove base64 encoded scripts",
      });
    }

    return findings;
  }

  /**
   * Validate HTML structure.
   */
  private validateStructure(html: string): AIValidationResult {
    const findings: AISecurityFinding[] = [];

    // Count elements (approximate)
    const tagMatches = html.match(/<[a-z][^>]*>/gi);
    const elementCount = tagMatches?.length ?? 0;

    if (elementCount > this.config.maxElementCount) {
      return {
        valid: false,
        code: "ELEMENT_COUNT_EXCEEDED",
        message: `Element count ${elementCount} exceeds limit of ${this.config.maxElementCount}`,
        severity: "error",
      };
    }

    // Check nesting depth
    const depth = this.computeMaxDepth(html);
    if (depth > this.config.maxNestingDepth) {
      return {
        valid: false,
        code: "NESTING_TOO_DEEP",
        message: `Nesting depth ${depth} exceeds limit of ${this.config.maxNestingDepth}`,
        severity: "error",
      };
    }

    // Check for blocked tags
    for (const pattern of this.config.blockedTags) {
      const match = html.match(new RegExp(`<${pattern.source}[\\s>]`, "gi"));
      if (match) {
        findings.push({
          type: "BLOCKED_TAG",
          severity: "error",
          description: `Blocked tag: ${match[0]}`,
          recommendation: "Use allowed HTML tags only",
        });
      }
    }

    if (findings.some((f) => f.severity === "error")) {
      return {
        valid: false,
        code: "BLOCKED_TAG",
        message: findings.map((f) => f.description).join("; "),
        findings,
        severity: "error",
      };
    }

    return { valid: true, findings };
  }

  /**
   * Detect DoS risks.
   */
  private detectDos(html: string): AIValidationResult {
    const findings: AISecurityFinding[] = [];

    // Check for deeply nested comments (comment bomb)
    const commentDepth = (html.match(/<!--/g) ?? []).length;
    if (commentDepth > 100) {
      findings.push({
        type: "DOS_RISK",
        severity: "warning",
        description: `High number of HTML comments: ${commentDepth}`,
        recommendation: "Reduce number of comments",
      });
    }

    // Check for repetitive patterns (zip bomb style)
    const repetitionThreshold = 1000;
    const repetitivePatterns = html.match(/(.{10,})\1{10,}/g);
    if (repetitivePatterns?.some((p) => p.length > repetitionThreshold)) {
      return {
        valid: false,
        code: "DOS_RISK",
        message: "Suspicious repetitive pattern detected",
        findings,
        severity: "error",
      };
    }

    return { valid: true, findings };
  }

  /**
   * Compute maximum nesting depth (approximate).
   */
  private computeMaxDepth(html: string): number {
    let depth = 0;
    let maxDepth = 0;

    // Simple state machine for tag tracking
    const openTagPattern = /<([a-z][a-z0-9]*)[^>]*(?<!\/)\s*>/gi;
    const closeTagPattern = /<\/([a-z][a-z0-9]*)>/gi;
    const _selfClosingPattern = /<([a-z][a-z0-9]*)[^>]*\/>/gi;

    // Self-closing tags don't affect depth
    const selfClosingTags = new Set([
      "br",
      "hr",
      "img",
      "input",
      "meta",
      "link",
      "area",
      "base",
      "col",
      "embed",
      "param",
      "source",
      "track",
      "wbr",
    ]);

    // Interleave open and close tags by position
    const events: Array<{ pos: number; isOpen: boolean; tag: string }> = [];

    for (const openMatch of html.matchAll(openTagPattern)) {
      const tag = openMatch[1].toLowerCase();
      if (!selfClosingTags.has(tag)) {
        events.push({ pos: openMatch.index ?? 0, isOpen: true, tag });
      }
    }

    for (const closeMatch of html.matchAll(closeTagPattern)) {
      events.push({
        pos: closeMatch.index ?? 0,
        isOpen: false,
        tag: closeMatch[1].toLowerCase(),
      });
    }

    // Sort by position
    events.sort((a, b) => a.pos - b.pos);

    // Calculate max depth
    for (const event of events) {
      if (event.isOpen) {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else {
        depth = Math.max(0, depth - 1);
      }
    }

    return maxDepth;
  }
}

// ============================================================================
// Relocation Validator
// ============================================================================

/**
 * Relocation Validator
 *
 * Validates annotation span relocations during verification sync.
 * Prevents unauthorized movement of annotations.
 */
export class RelocationValidator {
  private config: RelocationValidatorConfig;

  constructor(config: Partial<RelocationValidatorConfig> = {}) {
    this.config = { ...DEFAULT_RELOCATION_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Validate a relocation.
   */
  validateRelocation(params: {
    originalBlockId: string;
    targetBlockId: string;
    originalOffset: number;
    targetOffset: number;
    originalContextHash?: string;
    targetContextHash?: string;
    fuzzyMatchScore?: number;
  }): RelocationValidationResult {
    const {
      originalBlockId,
      targetBlockId,
      originalOffset,
      targetOffset,
      originalContextHash,
      targetContextHash,
      fuzzyMatchScore,
    } = params;

    // 1. Cross-block relocation check
    if (!this.config.allowCrossBlockRelocation && originalBlockId !== targetBlockId) {
      return {
        valid: false,
        code: "CROSS_BLOCK_DENIED",
        message: "Cross-block relocation is not allowed",
      };
    }

    // 2. Distance check (only for same-block relocations)
    if (originalBlockId === targetBlockId) {
      const distance = Math.abs(targetOffset - originalOffset);
      if (distance > this.config.maxRelocationDistance) {
        return {
          valid: false,
          code: "DISTANCE_EXCEEDED",
          message: `Relocation distance ${distance} exceeds limit of ${this.config.maxRelocationDistance}`,
          distance,
        };
      }
    }

    // 3. Context hash check
    if (this.config.requireContextHash) {
      if (originalContextHash && targetContextHash && originalContextHash !== targetContextHash) {
        return {
          valid: false,
          code: "CONTEXT_MISMATCH",
          message: "Context hash mismatch",
        };
      }
    }

    // 4. Fuzzy match tolerance check
    if (fuzzyMatchScore !== undefined && fuzzyMatchScore < 1 - this.config.maxFuzzyTolerance) {
      return {
        valid: false,
        code: "FUZZY_THRESHOLD_EXCEEDED",
        message: `Fuzzy match score ${fuzzyMatchScore.toFixed(2)} below threshold ${(1 - this.config.maxFuzzyTolerance).toFixed(2)}`,
      };
    }

    return { valid: true };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AI payload validator with default config.
 */
export function createAIPayloadValidator(
  config: Partial<AIValidatorConfig> = {}
): AIPayloadValidator {
  return new AIPayloadValidator(config);
}

/**
 * Create a relocation validator with default config.
 */
export function createRelocationValidator(
  config: Partial<RelocationValidatorConfig> = {}
): RelocationValidator {
  return new RelocationValidator(config);
}

/**
 * Validate an AI payload (convenience function).
 */
export function validateAIPayload(
  payload: { html?: string; markdown?: string },
  config: Partial<AIValidatorConfig> = {}
): AIValidationResult {
  const validator = new AIPayloadValidator(config);
  return validator.validate(payload);
}

/**
 * Validate a relocation (convenience function).
 */
export function validateRelocation(
  params: {
    originalBlockId: string;
    targetBlockId: string;
    originalOffset: number;
    targetOffset: number;
    originalContextHash?: string;
    targetContextHash?: string;
    fuzzyMatchScore?: number;
  },
  config: Partial<RelocationValidatorConfig> = {}
): RelocationValidationResult {
  const validator = new RelocationValidator(config);
  return validator.validateRelocation(params);
}
