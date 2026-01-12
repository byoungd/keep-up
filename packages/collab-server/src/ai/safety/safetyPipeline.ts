/**
 * Safety Pipeline - Dry-Run Validation & Sanitization
 *
 * Validates and sanitizes AI-generated content before application.
 * Implements fail-safe mechanisms to prevent:
 * - Content injection attacks
 * - Markdown/HTML injection
 * - PII exposure
 * - Excessive content generation
 * - Invalid UTF-16 offsets
 */

/** Validation result */
export interface ValidationResult {
  /** Whether the content passed validation */
  valid: boolean;
  /** Validation errors (if any) */
  errors: ValidationError[];
  /** Validation warnings (non-blocking) */
  warnings: ValidationWarning[];
  /** Sanitized content (if valid) */
  sanitizedContent?: string;
  /** Metadata about the validation */
  metadata: ValidationMetadata;
}

/** Validation error */
export interface ValidationError {
  /** Error code */
  code: ValidationErrorCode;
  /** Human-readable message */
  message: string;
  /** Position in content (if applicable) */
  position?: { start: number; end: number };
  /** Severity */
  severity: "error";
}

/** Validation warning */
export interface ValidationWarning {
  /** Warning code */
  code: ValidationWarningCode;
  /** Human-readable message */
  message: string;
  /** Position in content (if applicable) */
  position?: { start: number; end: number };
  /** Severity */
  severity: "warning";
}

/** Validation metadata */
export interface ValidationMetadata {
  /** Original content length */
  originalLength: number;
  /** Sanitized content length */
  sanitizedLength?: number;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Checks performed */
  checksPerformed: string[];
}

/** Validation error codes */
export type ValidationErrorCode =
  | "CONTENT_TOO_LONG"
  | "INVALID_UTF16"
  | "HTML_INJECTION"
  | "SCRIPT_INJECTION"
  | "PII_DETECTED"
  | "UNSAFE_URL"
  | "MALFORMED_MARKDOWN"
  | "EMPTY_CONTENT"
  | "BINARY_CONTENT";

/** Validation warning codes */
export type ValidationWarningCode =
  | "CONTENT_TRUNCATED"
  | "SUSPICIOUS_PATTERN"
  | "EXCESSIVE_WHITESPACE"
  | "UNUSUAL_CHARACTERS"
  | "POTENTIAL_PII";

/** Safety pipeline configuration */
export interface SafetyPipelineConfig {
  /** Maximum content length in characters */
  maxContentLength?: number;
  /** Maximum content length in tokens */
  maxTokenLength?: number;
  /** Whether to sanitize HTML tags */
  sanitizeHtml?: boolean;
  /** Whether to check for PII */
  checkPii?: boolean;
  /** Whether to validate URLs */
  validateUrls?: boolean;
  /** Custom blocklist patterns */
  blocklistPatterns?: RegExp[];
  /** Allowed markdown elements */
  allowedMarkdown?: string[];
}

/** Default configuration */
const DEFAULT_CONFIG: Required<SafetyPipelineConfig> = {
  maxContentLength: 100000, // 100KB
  maxTokenLength: 16000, // ~16K tokens
  sanitizeHtml: true,
  checkPii: true,
  validateUrls: true,
  blocklistPatterns: [],
  allowedMarkdown: ["bold", "italic", "link", "code", "heading", "list", "blockquote"],
};

/** Patterns for detection */
const PATTERNS = {
  // HTML/Script injection
  htmlTags: /<[^>]+>/g,
  scriptTags: /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  eventHandlers: /\bon\w+\s*=/gi,
  javascriptUrls: /javascript:/gi,
  dataUrls: /data:(?!image\/(png|jpeg|gif|webp))/gi,

  // PII patterns (simplified - real implementation would be more comprehensive)
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // Suspicious patterns
  excessiveWhitespace: /\s{10,}/g,
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control character detection is required for sanitization
  nullBytes: /\u0000/g,
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control character detection is required for sanitization
  controlChars: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,

  // URL validation
  unsafeProtocols: /^(javascript|data|vbscript|file):/i,
};

type ValidationState = {
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedContent: string;
  checksPerformed: string[];
};

/**
 * Safety Pipeline
 *
 * Validates and sanitizes AI-generated content.
 */
export class SafetyPipeline {
  private readonly config: Required<SafetyPipelineConfig>;

  constructor(config: SafetyPipelineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate and sanitize content.
   */
  validate(content: string): ValidationResult {
    const startTime = performance.now();
    const state: ValidationState = {
      errors: [],
      warnings: [],
      sanitizedContent: content,
      checksPerformed: [],
    };

    if (this.handleEmptyContent(content, state)) {
      return this.buildResult(
        content,
        state.sanitizedContent,
        state.errors,
        state.warnings,
        state.checksPerformed,
        startTime
      );
    }

    this.applyLengthCheck(content, state);
    this.applyBinaryCheck(state);
    this.applyUtf16Check(state.sanitizedContent, state);
    this.applyHtmlCheck(state);
    this.applyPiiCheck(state);
    this.applyUrlCheck(state);
    this.applyBlocklistCheck(state);
    this.applyWhitespaceCheck(state);

    return this.buildResult(
      content,
      state.sanitizedContent,
      state.errors,
      state.warnings,
      state.checksPerformed,
      startTime
    );
  }

  /**
   * Quick validation without full sanitization.
   */
  quickValidate(content: string): { valid: boolean; reason?: string } {
    if (!content || content.trim().length === 0) {
      return { valid: false, reason: "Empty content" };
    }

    if (content.length > this.config.maxContentLength) {
      return { valid: false, reason: "Content too long" };
    }

    if (PATTERNS.scriptTags.test(content)) {
      return { valid: false, reason: "Script injection detected" };
    }

    if (PATTERNS.nullBytes.test(content)) {
      return { valid: false, reason: "Binary content detected" };
    }

    return { valid: true };
  }

  /**
   * Sanitize content (removes dangerous elements but keeps valid content).
   */
  sanitize(content: string): string {
    let sanitized = content;

    // Remove control characters
    sanitized = sanitized.replace(PATTERNS.controlChars, "");

    // Remove script tags
    sanitized = sanitized.replace(PATTERNS.scriptTags, "");

    // Remove event handlers
    sanitized = sanitized.replace(PATTERNS.eventHandlers, "");

    // Normalize whitespace
    sanitized = sanitized.replace(PATTERNS.excessiveWhitespace, " ");

    return sanitized.trim();
  }

  private handleEmptyContent(content: string, state: ValidationState): boolean {
    state.checksPerformed.push("empty_check");
    if (!content || content.trim().length === 0) {
      state.errors.push({
        code: "EMPTY_CONTENT",
        message: "Content is empty or contains only whitespace",
        severity: "error",
      });
      return true;
    }
    return false;
  }

  private applyLengthCheck(content: string, state: ValidationState): void {
    state.checksPerformed.push("length_check");
    if (content.length > this.config.maxContentLength) {
      state.errors.push({
        code: "CONTENT_TOO_LONG",
        message: `Content exceeds maximum length of ${this.config.maxContentLength} characters`,
        severity: "error",
      });
    }
  }

  private applyBinaryCheck(state: ValidationState): void {
    state.checksPerformed.push("binary_check");
    const binaryResult = this.checkBinaryContent(state.sanitizedContent);
    if (binaryResult.hasBinary) {
      state.errors.push({
        code: "BINARY_CONTENT",
        message: "Content contains binary or control characters",
        severity: "error",
      });
      state.sanitizedContent = binaryResult.cleaned;
    }
  }

  private applyUtf16Check(content: string, state: ValidationState): void {
    state.checksPerformed.push("utf16_check");
    const utf16Result = this.validateUtf16(content);
    if (!utf16Result.valid) {
      state.errors.push({
        code: "INVALID_UTF16",
        message: "Content contains invalid UTF-16 sequences",
        position: utf16Result.invalidPosition,
        severity: "error",
      });
    }
  }

  private applyHtmlCheck(state: ValidationState): void {
    if (!this.config.sanitizeHtml) {
      return;
    }
    state.checksPerformed.push("html_injection_check");
    const htmlResult = this.checkHtmlInjection(state.sanitizedContent);
    if (htmlResult.hasInjection) {
      state.errors.push({
        code: "HTML_INJECTION",
        message: "Content contains potentially dangerous HTML",
        severity: "error",
      });
    }
    if (htmlResult.hasScript) {
      state.errors.push({
        code: "SCRIPT_INJECTION",
        message: "Content contains script injection attempt",
        severity: "error",
      });
    }
    state.sanitizedContent = htmlResult.sanitized;
  }

  private applyPiiCheck(state: ValidationState): void {
    if (!this.config.checkPii) {
      return;
    }
    state.checksPerformed.push("pii_check");
    const piiResult = this.checkPii(state.sanitizedContent);
    if (!piiResult.hasPii) {
      return;
    }
    for (const detection of piiResult.detections) {
      if (detection.confidence > 0.8) {
        state.errors.push({
          code: "PII_DETECTED",
          message: `Potential ${detection.type} detected in content`,
          position: detection.position,
          severity: "error",
        });
      } else {
        state.warnings.push({
          code: "POTENTIAL_PII",
          message: `Possible ${detection.type} pattern detected`,
          position: detection.position,
          severity: "warning",
        });
      }
    }
  }

  private applyUrlCheck(state: ValidationState): void {
    if (!this.config.validateUrls) {
      return;
    }
    state.checksPerformed.push("url_check");
    const urlResult = this.checkUrls(state.sanitizedContent);
    for (const unsafeUrl of urlResult.unsafeUrls) {
      state.errors.push({
        code: "UNSAFE_URL",
        message: `Unsafe URL protocol detected: ${unsafeUrl}`,
        severity: "error",
      });
    }
  }

  private applyBlocklistCheck(state: ValidationState): void {
    state.checksPerformed.push("blocklist_check");
    for (const pattern of this.config.blocklistPatterns) {
      const matcher = new RegExp(pattern);
      if (matcher.test(state.sanitizedContent)) {
        state.warnings.push({
          code: "SUSPICIOUS_PATTERN",
          message: `Content matches blocklist pattern: ${pattern.source}`,
          severity: "warning",
        });
      }
    }
  }

  private applyWhitespaceCheck(state: ValidationState): void {
    state.checksPerformed.push("whitespace_check");
    const whitespacePattern = new RegExp(PATTERNS.excessiveWhitespace);
    if (whitespacePattern.test(state.sanitizedContent)) {
      state.warnings.push({
        code: "EXCESSIVE_WHITESPACE",
        message: "Content contains excessive whitespace",
        severity: "warning",
      });
      state.sanitizedContent = state.sanitizedContent.replace(whitespacePattern, " ");
    }
  }

  /**
   * Check for binary/control characters.
   */
  private checkBinaryContent(content: string): { hasBinary: boolean; cleaned: string } {
    const hasNull = PATTERNS.nullBytes.test(content);
    const hasControl = PATTERNS.controlChars.test(content);

    if (!hasNull && !hasControl) {
      return { hasBinary: false, cleaned: content };
    }

    const cleaned = content.replace(PATTERNS.nullBytes, "").replace(PATTERNS.controlChars, "");

    return { hasBinary: true, cleaned };
  }

  /**
   * Validate UTF-16 encoding.
   */
  private validateUtf16(content: string): {
    valid: boolean;
    invalidPosition?: { start: number; end: number };
  } {
    // Check for unpaired surrogates
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);

      // High surrogate
      if (code >= 0xd800 && code <= 0xdbff) {
        // Must be followed by low surrogate
        if (i + 1 >= content.length) {
          return { valid: false, invalidPosition: { start: i, end: i + 1 } };
        }
        const next = content.charCodeAt(i + 1);
        if (next < 0xdc00 || next > 0xdfff) {
          return { valid: false, invalidPosition: { start: i, end: i + 2 } };
        }
        i++; // Skip the low surrogate
      }
      // Low surrogate without high surrogate
      else if (code >= 0xdc00 && code <= 0xdfff) {
        return { valid: false, invalidPosition: { start: i, end: i + 1 } };
      }
    }

    return { valid: true };
  }

  /**
   * Check for HTML/Script injection.
   */
  private checkHtmlInjection(content: string): {
    hasInjection: boolean;
    hasScript: boolean;
    sanitized: string;
  } {
    const hasScript =
      PATTERNS.scriptTags.test(content) ||
      PATTERNS.eventHandlers.test(content) ||
      PATTERNS.javascriptUrls.test(content);

    const hasHtml = PATTERNS.htmlTags.test(content);

    // Sanitize
    let sanitized = content;
    if (hasScript) {
      sanitized = sanitized
        .replace(PATTERNS.scriptTags, "")
        .replace(PATTERNS.eventHandlers, "")
        .replace(PATTERNS.javascriptUrls, "");
    }

    return {
      hasInjection: hasHtml,
      hasScript,
      sanitized,
    };
  }

  /**
   * Check for PII.
   */
  private checkPii(content: string): {
    hasPii: boolean;
    detections: Array<{
      type: string;
      confidence: number;
      position: { start: number; end: number };
    }>;
  } {
    const detections: Array<{
      type: string;
      confidence: number;
      position: { start: number; end: number };
    }> = [];

    for (const match of content.matchAll(new RegExp(PATTERNS.email.source, "g"))) {
      const index = match.index ?? 0;
      detections.push({
        type: "email",
        confidence: 0.9,
        position: { start: index, end: index + match[0].length },
      });
    }

    for (const match of content.matchAll(new RegExp(PATTERNS.phone.source, "g"))) {
      const index = match.index ?? 0;
      detections.push({
        type: "phone",
        confidence: 0.7, // Lower confidence due to false positives
        position: { start: index, end: index + match[0].length },
      });
    }

    for (const match of content.matchAll(new RegExp(PATTERNS.ssn.source, "g"))) {
      const index = match.index ?? 0;
      detections.push({
        type: "ssn",
        confidence: 0.95,
        position: { start: index, end: index + match[0].length },
      });
    }

    for (const match of content.matchAll(new RegExp(PATTERNS.creditCard.source, "g"))) {
      const index = match.index ?? 0;
      detections.push({
        type: "credit_card",
        confidence: 0.85,
        position: { start: index, end: index + match[0].length },
      });
    }

    return {
      hasPii: detections.length > 0,
      detections,
    };
  }

  /**
   * Check for unsafe URLs.
   */
  private checkUrls(content: string): { unsafeUrls: string[] } {
    const unsafeUrls: string[] = [];

    // Find all URL-like patterns
    const urlPattern = /(?:href|src)=["']([^"']+)["']/gi;
    for (const match of content.matchAll(urlPattern)) {
      const url = match[1];
      if (PATTERNS.unsafeProtocols.test(url)) {
        unsafeUrls.push(url);
      }
    }

    // Also check for standalone javascript: URLs
    if (PATTERNS.javascriptUrls.test(content)) {
      unsafeUrls.push("javascript:");
    }

    return { unsafeUrls };
  }

  /**
   * Build validation result.
   */
  private buildResult(
    originalContent: string,
    sanitizedContent: string,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    checksPerformed: string[],
    startTime: number
  ): ValidationResult {
    const valid = errors.length === 0;

    return {
      valid,
      errors,
      warnings,
      sanitizedContent: valid ? sanitizedContent : undefined,
      metadata: {
        originalLength: originalContent.length,
        sanitizedLength: valid ? sanitizedContent.length : undefined,
        processingTimeMs: performance.now() - startTime,
        checksPerformed,
      },
    };
  }
}

/**
 * Create a safety pipeline with default configuration.
 */
export function createSafetyPipeline(config: SafetyPipelineConfig = {}): SafetyPipeline {
  return new SafetyPipeline(config);
}

/**
 * Quick validation helper.
 */
export function quickValidate(content: string): boolean {
  const pipeline = new SafetyPipeline();
  return pipeline.quickValidate(content).valid;
}
