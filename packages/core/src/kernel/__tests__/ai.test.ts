/**
 * LFCC v0.9 RC - AI Dry-Run Pipeline Tests
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md Section 7
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  create409Conflict,
  createAIRequestEnvelope,
  createPassThroughValidator,
  createPatternRejectValidator,
  createSanitizer,
  DEFAULT_AI_SANITIZATION_POLICY,
  dryRunAIPayload,
  is409Conflict,
  validatePreconditions,
} from "../ai/index.js";

describe("AI Sanitizer", () => {
  const sanitizer = createSanitizer();

  it("should remove script tags", () => {
    const result = sanitizer.sanitize(
      { html: '<p>Hello</p><script>alert("xss")</script><p>World</p>' },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("<script>");
    expect(result.sanitized_html).not.toContain('alert("xss")');
    expect(result.sanitized_html).toContain("<p>Hello</p>");
    expect(result.sanitized_html).toContain("<p>World</p>");
    expect(result.diagnostics.some((d) => d.kind === "removed_tag")).toBe(true);
  });

  it("should remove style tags", () => {
    const result = sanitizer.sanitize(
      { html: "<style>body{color:red}</style><p>Text</p>" },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("<style>");
    expect(result.sanitized_html).toContain("<p>Text</p>");
  });

  it("should remove iframe tags", () => {
    const result = sanitizer.sanitize(
      { html: '<p>Before</p><iframe src="evil.com"></iframe><p>After</p>' },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("<iframe>");
  });

  it("should remove event handlers", () => {
    const result = sanitizer.sanitize(
      { html: '<p onclick="alert(1)">Click me</p>' },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("onclick");
    expect(result.diagnostics.some((d) => d.kind === "removed_attr")).toBe(true);
  });

  it("should remove style attributes", () => {
    const result = sanitizer.sanitize(
      { html: '<p style="color:red">Styled</p>' },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("style=");
  });

  it("should sanitize javascript: URLs", () => {
    const result = sanitizer.sanitize(
      { html: '<a href="javascript:alert(1)">Click</a>' },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("javascript:");
    expect(result.diagnostics.some((d) => d.kind === "sanitized_url")).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("should enforce dangerous URL scheme handling", () => {
    const cases = [
      { url: "javascript:alert(1)", expectsError: false },
      { url: "vbscript:alert(1)", expectsError: true },
      { url: "data:text/html,<script>", expectsError: true },
    ];

    for (const testCase of cases) {
      const result = sanitizer.sanitize(
        { html: `<a href="${testCase.url}">Click</a>` },
        DEFAULT_AI_SANITIZATION_POLICY
      );

      if (testCase.expectsError) {
        expect(result.errors?.length).toBeGreaterThan(0);
      } else {
        expect(result.errors).toBeUndefined();
      }
      expect(result.sanitized_html).not.toContain(testCase.url);
    }
  });

  // P0.1: Test fail-closed for sanitization errors
  it("should reject payload with vbscript: URL (fail-closed)", async () => {
    const validator = createPassThroughValidator();
    const result = await dryRunAIPayload(
      { html: '<a href="vbscript:alert(1)">Click</a>' },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    // P0.1: vbscript: should cause sanitization error and pipeline rejection
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Sanitization errors");
    expect(result.diagnostics.some((d) => d.kind === "critical_security_violation")).toBe(true);
  });

  // P0.2: Test whitelist removes non-allowed tags
  it("should remove non-whitelisted tags (svg, meta, link)", () => {
    const result = sanitizer.sanitize(
      {
        html: '<p>Text</p><svg><circle/></svg><meta name="test"><link rel="stylesheet"><p>More</p>',
      },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("<svg>");
    expect(result.sanitized_html).not.toContain("<meta");
    expect(result.sanitized_html).not.toContain("<link");
    expect(result.sanitized_html).toContain("<p>Text</p>");
    expect(result.sanitized_html).toContain("<p>More</p>");
    expect(result.diagnostics.some((d) => d.kind === "removed_tag")).toBe(true);
  });

  // P1.2: Test URL validation for all URL attributes
  it("should validate src, srcset, xlink:href attributes", () => {
    const result = sanitizer.sanitize(
      {
        html: '<img src="javascript:alert(1)"><img srcset="data:image,evil.jpg"><svg><use xlink:href="vbscript:bad"></use></svg>',
      },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    // These should be caught as errors (P0.1) or removed
    expect(result.errors).toBeDefined();
    if (result.errors) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
    expect(result.diagnostics.some((d) => d.kind === "sanitized_url")).toBe(true);
  });

  it("should sanitize srcset with unsafe entries", () => {
    const result = sanitizer.sanitize(
      {
        html: '<img srcset="https://safe.com/1x.png 1x, JavaScript:alert(1) 2x">',
      },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).not.toContain("srcset");
    expect(result.diagnostics.some((d) => d.kind === "sanitized_url")).toBe(true);
  });

  // P2.1: Test that plain text with data: or onload= is not rejected
  it("should not reject plain text containing data: or onload=", () => {
    const result = sanitizer.sanitize(
      {
        html: "<p>This is data: text and onload= code example</p>",
      },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    // Should pass - these are in plain text, not attributes
    expect(result.sanitized_html).toContain("data:");
    expect(result.sanitized_html).toContain("onload=");
    expect(result.errors).toBeUndefined();
  });

  it("should allow safe URLs", () => {
    const result = sanitizer.sanitize(
      { html: '<a href="https://example.com">Link</a>' },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_html).toContain('href="https://example.com"');
  });

  it("should reject obfuscated critical URLs", () => {
    const result = sanitizer.sanitize(
      { html: '<a href=" DaTa:\ntext/html,evil">Bad</a>' },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.errors?.some((e) => e.kind === "critical_security_violation")).toBe(true);
  });

  it("should never allow unsafe URL schemes in href (fuzz)", () => {
    const unsafeSchemes = [
      "javascript:",
      "JaVaScRiPt:",
      "vbscript:",
      "VBScript:",
      "data:",
      "DaTa:",
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...unsafeSchemes),
        fc.string({
          unit: fc.constantFrom(" ", "\t", "\n"),
          maxLength: 3,
        }),
        fc.string({
          unit: fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~:/?&=%"
          ),
          maxLength: 20,
        }),
        (scheme, padding, rest) => {
          const value = `${padding}${scheme}${padding}${rest}`;
          const result = sanitizer.sanitize(
            { html: `<a href="${value}">Link</a>` },
            DEFAULT_AI_SANITIZATION_POLICY
          );
          const sanitized = result.sanitized_html ?? "";
          expect(sanitized).not.toContain("javascript:");
          expect(sanitized).not.toContain("vbscript:");
          expect(sanitized).not.toContain("data:");
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should reject payload exceeding size limit", () => {
    const largeHtml = `<p>${"x".repeat(2 * 1024 * 1024)}</p>`;
    const result = sanitizer.sanitize({ html: largeHtml }, DEFAULT_AI_SANITIZATION_POLICY);

    expect(result.diagnostics.some((d) => d.kind === "payload_too_large")).toBe(true);
  });

  it("should remove HTML from markdown", () => {
    const result = sanitizer.sanitize(
      { markdown: "# Title\n<script>bad</script>\nContent" },
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.sanitized_markdown).not.toContain("<script>");
    expect(result.sanitized_markdown).toContain("# Title");
  });
});

describe("AI Dry-Run Pipeline", () => {
  const sanitizer = createSanitizer();

  it("should pass valid HTML through pipeline", async () => {
    const validator = createPassThroughValidator();
    const result = await dryRunAIPayload(
      { html: "<p>Hello <b>world</b></p>" },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.ok).toBe(true);
    expect(result.canon_root).toBeDefined();
  });

  it("should reject payload with banned tags", async () => {
    const validator = createPassThroughValidator();
    const result = await dryRunAIPayload(
      { html: '<p>Hello</p><script>alert("xss")</script>' },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    // Sanitizer removes script, so it should still pass
    expect(result.ok).toBe(true);
    expect(result.diagnostics.some((d) => d.kind === "removed_tag")).toBe(true);
  });

  it("should reject when schema validation fails", async () => {
    const validator = createPatternRejectValidator([/invalid-pattern/]);
    const result = await dryRunAIPayload(
      { html: "<p>Contains invalid-pattern here</p>" },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Schema validation failed");
  });

  it("should reject empty payload after sanitization", async () => {
    const validator = createPassThroughValidator();
    const result = await dryRunAIPayload(
      { html: "<script>only script</script>" },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("empty");
  });

  it("should return canonical tree on success", async () => {
    const validator = createPassThroughValidator();
    const result = await dryRunAIPayload(
      { html: "<p><b>Bold</b> and <i>italic</i></p>" },
      sanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.ok).toBe(true);
    expect(result.canon_root).toBeDefined();
  });

  it("should use sanitizer parser when provided", async () => {
    const validator = createPassThroughValidator();
    const parserSanitizer = {
      sanitize: () => ({
        sanitized_html: "<p>fallback</p>",
        diagnostics: [],
      }),
      parseHtmlToInputTree: () => ({
        kind: "element" as const,
        tag: "h1",
        attrs: {},
        children: [{ kind: "text" as const, text: "Native parser" }],
      }),
    };

    const result = await dryRunAIPayload(
      { html: "<p>ignored</p>" },
      parserSanitizer,
      validator,
      DEFAULT_AI_SANITIZATION_POLICY
    );

    expect(result.ok).toBe(true);
    if (result.canon_root && "type" in result.canon_root) {
      expect(result.canon_root.type).toBe("heading");
    } else {
      throw new Error("Expected canonical block from native parser");
    }
  });
});

describe("AI Envelope", () => {
  describe("createAIRequestEnvelope", () => {
    it("should create valid envelope", () => {
      const envelope = createAIRequestEnvelope({
        docFrontier: "frontier123",
        opsXml: "<replace_spans>content</replace_spans>",
        preconditions: [{ span_id: "span1", if_match_context_hash: "abc123" }],
        requestId: "req-001",
        agentId: "agent-001",
        intent: {
          id: "intent-001",
          category: "content_modification",
          description: { short: "Rewrite text", locale: "en-US" },
          structured: { action: "rewrite" },
        },
        returnCanonicalTree: true,
      });

      expect(envelope.doc_frontier).toBe("frontier123");
      expect(envelope.ops_xml).toContain("replace_spans");
      expect(envelope.preconditions).toHaveLength(1);
      expect(envelope.request_id).toBe("req-001");
      expect(envelope.agent_id).toBe("agent-001");
      expect(envelope.options?.return_canonical_tree).toBe(true);
    });
  });

  describe("create409Conflict", () => {
    it("should create valid conflict response", () => {
      const conflict = create409Conflict({
        currentFrontier: "new-frontier",
        failedPreconditions: [
          { spanId: "span1", reason: "hash_mismatch" },
          { spanId: "span2", reason: "span_missing" },
        ],
      });

      expect(conflict.code).toBe("CONFLICT");
      expect(conflict.current_frontier).toBe("new-frontier");
      expect(conflict.failed_preconditions).toHaveLength(2);
    });
  });

  describe("is409Conflict", () => {
    it("should identify conflict responses", () => {
      const conflict = create409Conflict({
        currentFrontier: "f",
        failedPreconditions: [],
      });

      expect(is409Conflict(conflict)).toBe(true);
      expect(is409Conflict({ code: "OTHER" })).toBe(false);
      expect(is409Conflict(null)).toBe(false);
      expect(is409Conflict("string")).toBe(false);
    });
  });

  describe("validatePreconditions", () => {
    it("should pass when all hashes match", () => {
      const getHash = (id: string) => (id === "span1" ? "hash1" : null);
      const failures = validatePreconditions(
        [{ span_id: "span1", if_match_context_hash: "hash1" }],
        getHash
      );

      expect(failures).toHaveLength(0);
    });

    it("should fail on hash mismatch", () => {
      const getHash = () => "different-hash";
      const failures = validatePreconditions(
        [{ span_id: "span1", if_match_context_hash: "expected-hash" }],
        getHash
      );

      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBe("hash_mismatch");
    });

    it("should fail on missing span", () => {
      const getHash = () => null;
      const failures = validatePreconditions(
        [{ span_id: "span1", if_match_context_hash: "any" }],
        getHash
      );

      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBe("span_missing");
    });
  });
});
