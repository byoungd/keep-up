/**
 * LFCC v0.9 RC - Security Validator
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/18_Security_Best_Practices.md
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md Section B
 *
 * Implements whitelist sanitization, URL validation, resource limits,
 * and schema dry-run validation (LFCC §11.2) for AI payloads.
 */

import { type EditorSchemaValidator, observability } from "@ku0/core";

export type SecurityValidationResult = {
  ok: boolean;
  errors: SecurityError[];
  warnings: SecurityWarning[];
  sanitized?: string;
};

export type SecurityError = {
  code: string;
  message: string;
  detail?: string;
};

export type SecurityWarning = {
  code: string;
  message: string;
  detail?: string;
};

export type SecurityValidatorOptions = {
  maxPayloadSize?: number; // bytes, default 1MB
  maxNestingDepth?: number; // default 100
  maxAttributesPerElement?: number; // default 1000
  allowedProtocols?: string[]; // default: ["https:", "http:", "mailto:"]
  enableStrictMode?: boolean; // default: true
  enablePerformanceLogging?: boolean; // P2.1: Log slow validations, default: false
  /**
   * LFCC §11.2: Schema validator for dry-run apply
   * When provided, payloads must pass schema validation in addition to sanitization
   */
  schemaValidator?: EditorSchemaValidator;
};

const logger = observability.getLogger();

const DEFAULT_OPTIONS: Omit<Required<SecurityValidatorOptions>, "schemaValidator"> & {
  schemaValidator: EditorSchemaValidator | undefined;
} = {
  maxPayloadSize: 1024 * 1024, // 1MB
  maxNestingDepth: 100,
  maxAttributesPerElement: 1000,
  allowedProtocols: ["https:", "http:", "mailto:"],
  enableStrictMode: true,
  enablePerformanceLogging: false, // P2.1: Disabled by default
  schemaValidator: undefined, // LFCC §11.2: No schema validation by default
};

const URL_ATTRIBUTES = [
  { regex: /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, name: "href" },
  { regex: /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, name: "src" },
  { regex: /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, name: "srcset" },
  { regex: /\bxlink:href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, name: "xlink:href" },
  { regex: /\bposter\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, name: "poster" },
];

/**
 * Security Validator for AI payloads and user content
 */
export class SecurityValidator {
  private options: typeof DEFAULT_OPTIONS;

  constructor(options: SecurityValidatorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get the schema validator (for pipeline integration)
   */
  getSchemaValidator(): EditorSchemaValidator | undefined {
    return this.options.schemaValidator;
  }

  /**
   * Main validation entry point
   * Validates payload for security threats and resource limits
   *
   * Fail-closed: Any security violation rejects the entire operation
   *
   * P2.1: Performance monitoring enabled
   */
  validate(payload: string): SecurityValidationResult {
    const startTime = performance.now();
    const errors: SecurityError[] = [];
    const warnings: SecurityWarning[] = [];

    try {
      // Step 1: Resource limit checks
      const resourceCheck = this.validateResourceLimits(payload);
      if (!resourceCheck.ok) {
        errors.push(...resourceCheck.errors);
        return { ok: false, errors, warnings };
      }

      // Step 2: Check for dangerous patterns (fail-closed)
      const patternCheck = this.validateDangerousPatterns(payload);
      if (!patternCheck.ok) {
        errors.push(...patternCheck.errors);
        return { ok: false, errors, warnings };
      }

      // Step 3: Sanitize payload (whitelist approach) - for warnings only
      const sanitizeResult = this.sanitizePayload(payload);
      warnings.push(...sanitizeResult.warnings);

      // Step 4: Validate URLs in original payload (before sanitization)
      const urlCheck = this.validateURLsInPayload(payload);
      if (!urlCheck.ok) {
        errors.push(...urlCheck.errors);
        return { ok: false, errors, warnings };
      }
      warnings.push(...urlCheck.warnings);

      // Step 5: Schema dry-run validation (LFCC §11.2)
      const schemaCheck = this.validateSchema(payload);
      if (!schemaCheck.ok) {
        errors.push(...schemaCheck.errors);
        return { ok: false, errors, warnings };
      }

      // P2.1: Performance monitoring
      this.logPerformance(startTime, payload.length);

      return {
        ok: true,
        errors: [],
        warnings,
        sanitized: sanitizeResult.sanitized ?? payload,
      };
    } catch (error) {
      this.logPerformanceError(startTime, error);
      throw error;
    }
  }

  /**
   * Check for dangerous patterns (fail-closed)
   * P2.1: Scope checks to attributes only (not plain text content)
   */
  private validateDangerousPatterns(payload: string): SecurityValidationResult {
    const errors: SecurityError[] = [];
    const criticalDangerousPatterns = [
      { pattern: /<script[^>]*>/gi, name: "script tag" },
      { pattern: /<style[^>]*>/gi, name: "style tag" },
      { pattern: /<iframe[^>]*>/gi, name: "iframe tag" },
      {
        pattern: /\s+\w+\s*=\s*(?:"[^"]*javascript:|'[^']*javascript:|[^"'\s>]*javascript:)/gi,
        name: "javascript: URL in attribute",
      },
      {
        pattern: /\s+\w+\s*=\s*(?:"[^"]*data:|'[^']*data:|[^"'\s>]*data:)/gi,
        name: "data: URL in attribute",
      },
      { pattern: /\s+on\w+\s*=/gi, name: "event handler attribute" },
    ];

    for (const { pattern, name } of criticalDangerousPatterns) {
      const matches = payload.match(pattern);
      if (matches && matches.length > 0) {
        errors.push({
          code: "DANGEROUS_PATTERN_DETECTED",
          message: `Dangerous pattern detected: ${name}`,
          detail: `Found ${matches.length} occurrence(s) - payload rejected (fail-closed)`,
        });
      }
    }

    return { ok: errors.length === 0, errors, warnings: [] };
  }

  /**
   * P2.1: Log slow validations
   */
  private logPerformance(startTime: number, payloadLength: number): void {
    if (!this.options.enablePerformanceLogging) {
      return;
    }
    const durationMs = performance.now() - startTime;
    if (durationMs > 10) {
      logger.warn("gateway", "Slow validation", {
        durationMs,
        payloadLength,
      });
    }
  }

  /**
   * P2.1: Log validation errors with timing
   */
  private logPerformanceError(startTime: number, error: unknown): void {
    if (!this.options.enablePerformanceLogging) {
      return;
    }
    const durationMs = performance.now() - startTime;
    logger.error(
      "gateway",
      "Validation error",
      error instanceof Error ? error : new Error(String(error)),
      { durationMs }
    );
  }

  /**
   * Validate resource limits
   */
  validateResourceLimits(payload: string): SecurityValidationResult {
    const errors: SecurityError[] = [];

    // Check payload size
    const sizeBytes = new TextEncoder().encode(payload).length;
    if (sizeBytes > this.options.maxPayloadSize) {
      errors.push({
        code: "PAYLOAD_SIZE_EXCEEDED",
        message: `Payload size ${sizeBytes} bytes exceeds limit of ${this.options.maxPayloadSize} bytes`,
        detail: `Max allowed: ${this.options.maxPayloadSize} bytes`,
      });
    }

    // Check nesting depth
    const nestingDepth = this.computeNestingDepth(payload);
    if (nestingDepth > this.options.maxNestingDepth) {
      errors.push({
        code: "NESTING_DEPTH_EXCEEDED",
        message: `Nesting depth ${nestingDepth} exceeds limit of ${this.options.maxNestingDepth}`,
        detail: `Max allowed: ${this.options.maxNestingDepth} levels`,
      });
    }

    // Check attribute count (approximate)
    const maxAttributes = this.computeMaxAttributes(payload);
    if (maxAttributes > this.options.maxAttributesPerElement) {
      errors.push({
        code: "ATTRIBUTE_COUNT_EXCEEDED",
        message: `Element has ${maxAttributes} attributes, exceeds limit of ${this.options.maxAttributesPerElement}`,
        detail: `Max allowed: ${this.options.maxAttributesPerElement} attributes per element`,
      });
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * LFCC §11.2: Schema dry-run validation
   * Validates payload against the editor schema to ensure structural compliance
   */
  validateSchema(payload: string): SecurityValidationResult {
    if (!this.options.schemaValidator) {
      return { ok: true, errors: [], warnings: [] };
    }

    const schemaResult = this.options.schemaValidator.dryRunApply({ html: payload });
    if (!schemaResult.ok) {
      return {
        ok: false,
        errors: [
          {
            code: "SCHEMA_VALIDATION_FAILED",
            message: "Schema dry-run validation failed",
            detail: schemaResult.error ?? "Payload does not conform to editor schema",
          },
        ],
        warnings: [],
      };
    }

    return { ok: true, errors: [], warnings: [] };
  }

  /**
   * LFCC Appendix B Whitelist Configuration
   * Only these tags/attributes are allowed; all others are stripped.
   */
  private static readonly ALLOWED_TAGS = new Set([
    // Block elements
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "ul",
    "ol",
    "li",
    "pre",
    "code",
    "hr",
    "br",
    // Inline elements
    "strong",
    "em",
    "s",
    "u",
    "a",
    "span",
    "sub",
    "sup",
    // Media (LFCC Appendix B.2)
    "img",
    "video",
    // Table elements
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ]);

  /**
   * LFCC Appendix B.2 Attribute Whitelist
   * Tag-specific allowed attributes
   */
  private static readonly ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
    // Media attributes (LFCC Appendix B.2)
    img: new Set(["src", "alt", "title", "width", "height"]),
    video: new Set(["src", "poster", "controls", "width", "height"]),
    // Link attributes
    a: new Set(["href", "title", "target", "rel"]),
    // Code block attributes
    code: new Set(["language", "class"]),
    pre: new Set(["language", "class"]),
    // Table cell attributes
    td: new Set(["rowspan", "colspan"]),
    th: new Set(["rowspan", "colspan"]),
    // Global allowed on all elements
    _global: new Set(["id", "class", "data-block-id", "data-annotation-id"]),
  };

  /**
   * Sanitize payload using STRICT WHITELIST approach (LFCC Appendix B)
   * Only allowed tags and attributes pass through; everything else is stripped.
   */
  sanitizePayload(html: string): SecurityValidationResult {
    const errors: SecurityError[] = [];
    const warnings: SecurityWarning[] = [];
    let sanitized = html;

    // Step 1: Remove all tags not in whitelist
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    const tagsToRemove: string[] = [];

    for (const match of sanitized.matchAll(tagPattern)) {
      const tagName = match[1].toLowerCase();
      if (!SecurityValidator.ALLOWED_TAGS.has(tagName)) {
        tagsToRemove.push(tagName);
      }
    }

    // Remove disallowed tags (unwrap content, don't delete)
    for (const tag of [...new Set(tagsToRemove)]) {
      // Remove opening and closing tags but keep inner content
      const openTagRegex = new RegExp(`<${tag}[^>]*>`, "gi");
      const closeTagRegex = new RegExp(`</${tag}>`, "gi");
      if (sanitized.match(openTagRegex)) {
        warnings.push({
          code: "DISALLOWED_TAG_STRIPPED",
          message: `Stripped disallowed tag: <${tag}>`,
        });
        sanitized = sanitized.replace(openTagRegex, "");
        sanitized = sanitized.replace(closeTagRegex, "");
      }
    }

    // Step 2: Strip disallowed attributes from allowed tags
    const attrPattern = /<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
    sanitized = sanitized.replace(attrPattern, (_match, tagName: string, attrString: string) => {
      const tag = tagName.toLowerCase();
      if (!SecurityValidator.ALLOWED_TAGS.has(tag)) {
        return _match; // Already handled above
      }

      const cleanAttrs = this.parseAndFilterAttributes(tag, attrString, warnings);
      return cleanAttrs.length > 0 ? `<${tagName} ${cleanAttrs.join(" ")}>` : `<${tagName}>`;
    });

    // Step 3: Final safety check - reject if dangerous patterns remain
    const dangerousPatterns = [
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi, // Any remaining event handler
    ];

    for (const pattern of dangerousPatterns) {
      const matches = sanitized.match(pattern);
      if (matches) {
        errors.push({
          code: "DANGEROUS_PATTERN_DETECTED",
          message: `Dangerous pattern detected after sanitization: ${pattern.source}`,
          detail: `Found ${matches.length} occurrence(s) - rejecting payload`,
        });
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      sanitized: errors.length === 0 ? sanitized : undefined,
    };
  }

  /**
   * Parse and filter attributes based on whitelist (LFCC Appendix B.2)
   */
  private parseAndFilterAttributes(
    tag: string,
    attrString: string,
    warnings: SecurityWarning[]
  ): string[] {
    const allowedForTag = SecurityValidator.ALLOWED_ATTRS_BY_TAG[tag] ?? new Set<string>();
    const globalAllowed = SecurityValidator.ALLOWED_ATTRS_BY_TAG._global;
    const cleanAttrs: string[] = [];

    // Use matchAll for cleaner iteration
    const attrRegex = /([a-zA-Z][-a-zA-Z0-9]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
    const matches = attrString.matchAll(attrRegex);

    for (const attrMatch of matches) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

      // Check if attribute is allowed (tag-specific or global)
      if (allowedForTag.has(attrName) || globalAllowed.has(attrName)) {
        // For URL attributes, validate the URL
        if (["href", "src", "poster"].includes(attrName)) {
          if (this.validateURL(attrValue)) {
            cleanAttrs.push(`${attrName}="${this.escapeHtml(attrValue)}"`);
          } else {
            warnings.push({
              code: "INVALID_URL_REMOVED",
              message: `Removed invalid URL in ${attrName}: ${attrValue.substring(0, 50)}...`,
            });
          }
        } else {
          cleanAttrs.push(`${attrName}="${this.escapeHtml(attrValue)}"`);
        }
      }
    }

    return cleanAttrs;
  }

  /**
   * Escape HTML entities in attribute values
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  /**
   * Validate URLs in payload
   */
  validateURL(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Only allow safe protocols
      if (!this.options.allowedProtocols.includes(parsed.protocol)) {
        return false;
      }

      // Block javascript: and data: URLs explicitly
      if (url.toLowerCase().startsWith("javascript:") || url.toLowerCase().startsWith("data:")) {
        return false;
      }

      return true;
    } catch {
      // Invalid URL format
      return false;
    }
  }

  private isDangerousUrlScheme(url: string): boolean {
    return url.startsWith("javascript:") || url.startsWith("data:") || url.startsWith("vbscript:");
  }

  private createInvalidUrlError(name: string, url: string): SecurityError {
    return {
      code: "INVALID_URL",
      message: `Invalid or unsafe URL in ${name}: ${url}`,
      detail: "URL must use https:, http:, or mailto: protocol",
    };
  }

  private createDangerousUrlError(name: string, url: string): SecurityError {
    return {
      code: "DANGEROUS_URL_PATTERN",
      message: `Dangerous URL in ${name}: ${url}`,
      detail: "javascript:, data:, and vbscript: URLs are not allowed",
    };
  }

  private validateSrcset(url: string): SecurityError[] {
    const urls = url.split(",").map((entry) => entry.trim().split(/\s+/)[0]);
    const errors: SecurityError[] = [];

    for (const entry of urls) {
      if (!this.validateURL(entry)) {
        errors.push(this.createInvalidUrlError("srcset", entry));
      }
    }

    return errors;
  }

  private validateUrlAttribute(name: string, url: string): SecurityError[] {
    const lowerUrl = url.toLowerCase();
    if (this.isDangerousUrlScheme(lowerUrl)) {
      return [this.createDangerousUrlError(name, url)];
    }

    if (name === "srcset") {
      return this.validateSrcset(url);
    }

    if (!this.validateURL(url)) {
      return [this.createInvalidUrlError(name, url)];
    }

    return [];
  }

  /**
   * Validate all URLs in sanitized payload
   * P1.2: Extend to cover all URL-bearing attributes (src, srcset, xlink:href, poster)
   */
  validateURLsInPayload(sanitized: string): SecurityValidationResult {
    const errors: SecurityError[] = [];
    const warnings: SecurityWarning[] = [];

    for (const { regex, name } of URL_ATTRIBUTES) {
      const matches = Array.from(sanitized.matchAll(regex));
      for (const match of matches) {
        const url = match[1] ?? match[2] ?? match[3] ?? "";
        errors.push(...this.validateUrlAttribute(name, url));
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Compute maximum nesting depth in HTML
   */
  private computeNestingDepth(html: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    // Simple tag-based depth calculation
    const tagRegex = /<\/?[a-zA-Z][^>]*>/g;
    const matches = Array.from(html.matchAll(tagRegex));

    for (const match of matches) {
      const tag = match[0];
      if (tag.startsWith("</")) {
        // Closing tag
        currentDepth = Math.max(0, currentDepth - 1);
      } else if (!tag.endsWith("/>")) {
        // Opening tag (not self-closing)
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      }
    }

    return maxDepth;
  }

  /**
   * Compute maximum number of attributes in any single element
   */
  private computeMaxAttributes(html: string): number {
    let maxAttributes = 0;

    // Find all opening tags
    const tagRegex = /<[a-zA-Z][^>]*>/g;
    const matches = Array.from(html.matchAll(tagRegex));

    for (const match of matches) {
      const tagContent = match[0];
      // Count attributes (approximate: count = signs)
      const attributeMatches = tagContent.match(/\s+\w+\s*=/g);
      const attributeCount = attributeMatches ? attributeMatches.length : 0;
      maxAttributes = Math.max(maxAttributes, attributeCount);
    }

    return maxAttributes;
  }
}

/**
 * Create a default security validator
 */
export function createSecurityValidator(options?: SecurityValidatorOptions): SecurityValidator {
  return new SecurityValidator(options);
}
