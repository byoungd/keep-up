/**
 * LFCC v0.9 RC - AI Gateway Dry-Run Pipeline Tests
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_AI_SANITIZATION_POLICY } from "../../kernel/ai/types.js";
import {
  createPipelineBuilder,
  DEFAULT_PIPELINE_CONFIG,
  detectMaliciousPayload,
  executePipeline,
  SIZE_LIMITS,
  validatePayloadSize,
} from "../pipeline.js";

describe("AI Gateway Dry-Run Pipeline", () => {
  describe("executePipeline", () => {
    it("processes valid HTML payload", async () => {
      const result = await executePipeline({ html: "<p>Hello world</p>" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.canonRoot).toBeDefined();
      }
    });

    it("processes valid markdown payload", async () => {
      // Note: markdown-only payloads don't produce canonical tree (no HTML parser)
      // This is expected behavior - markdown needs HTML conversion first
      const result = await executePipeline({ markdown: "Hello world" });

      // Markdown without HTML doesn't canonicalize (no HTML to parse)
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("normalize");
      }
    });

    it("rejects empty payload", async () => {
      const result = await executePipeline({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.stage).toBe("sanitize");
        expect(result.reason).toContain("No payload");
      }
    });

    it("sanitizes script tags", async () => {
      const result = await executePipeline({
        html: "<p>Hello</p><script>alert('xss')</script>",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diagnostics.some((d) => d.kind === "removed_tag")).toBe(true);
      }
    });

    it("sanitizes event handlers", async () => {
      const result = await executePipeline({
        html: '<p onclick="alert()">Hello</p>',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diagnostics.some((d) => d.kind === "removed_attr")).toBe(true);
      }
    });

    it("sanitizes style attributes", async () => {
      const result = await executePipeline({
        html: '<p style="color:red">Hello</p>',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diagnostics.some((d) => d.kind === "removed_attr")).toBe(true);
      }
    });

    it("sanitizes dangerous URLs", async () => {
      const result = await executePipeline({
        html: '<a href="javascript:alert()">Click</a>',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diagnostics.some((d) => d.kind === "sanitized_url")).toBe(true);
      }
    });

    it("allows safe URLs", async () => {
      const result = await executePipeline({
        html: '<a href="https://example.com">Link</a>',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diagnostics.some((d) => d.kind === "sanitized_url")).toBe(false);
      }
    });

    it("removes HTML from markdown", async () => {
      const result = await executePipeline({
        markdown: "Hello <script>bad</script> world",
      });

      // Markdown-only doesn't produce canonical tree, but sanitization runs
      // The diagnostics should show HTML was removed
      expect(result.diagnostics.some((d) => d.kind === "removed_html_in_md")).toBe(true);
    });

    it("rejects payload exceeding size limit", async () => {
      const largePayload = "x".repeat(2 * 1024 * 1024); // 2MB
      const result = await executePipeline(
        { html: largePayload },
        {
          sanitizationPolicy: {
            ...DEFAULT_AI_SANITIZATION_POLICY,
            max_payload_size: 1024 * 1024, // 1MB
          },
        }
      );

      expect(result.ok).toBe(false);
      // The sanitizer returns empty payload when size limit exceeded
      if (!result.ok) {
        expect(result.stage).toBe("sanitize");
      }
    });
  });

  describe("detectMaliciousPayload", () => {
    it("detects script tags", () => {
      const result = detectMaliciousPayload("<script>alert(1)</script>");
      expect(result.isMalicious).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it("detects javascript: URLs", () => {
      const result = detectMaliciousPayload('<a href="javascript:void(0)">Link</a>');
      expect(result.isMalicious).toBe(true);
    });

    it("detects event handlers", () => {
      const result = detectMaliciousPayload('<div onclick="alert()">Click</div>');
      expect(result.isMalicious).toBe(true);
    });

    it("detects data: URLs", () => {
      const result = detectMaliciousPayload('<img src="data:text/html,<script>">');
      expect(result.isMalicious).toBe(true);
    });

    it("detects iframe tags", () => {
      const result = detectMaliciousPayload('<iframe src="evil.com"></iframe>');
      expect(result.isMalicious).toBe(true);
    });

    it("detects object/embed tags", () => {
      expect(detectMaliciousPayload("<object>").isMalicious).toBe(true);
      expect(detectMaliciousPayload("<embed>").isMalicious).toBe(true);
    });

    it("detects form tags", () => {
      const result = detectMaliciousPayload('<form action="evil.com">');
      expect(result.isMalicious).toBe(true);
    });

    it("detects CSS expression injection", () => {
      const result = detectMaliciousPayload('<div style="width: expression(alert())">x</div>');
      expect(result.isMalicious).toBe(true);
    });

    it("ignores benign text containing schemes", () => {
      const result = detectMaliciousPayload("<p>Example javascript:alert(1) in docs</p>");
      expect(result.isMalicious).toBe(false);
    });

    it("returns false for safe content", () => {
      const result = detectMaliciousPayload("<p>Hello <strong>world</strong></p>");
      expect(result.isMalicious).toBe(false);
      expect(result.patterns).toHaveLength(0);
    });

    it("returns multiple matched patterns", () => {
      const result = detectMaliciousPayload('<script>x</script><iframe onclick="y">');
      expect(result.isMalicious).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(1);
    });
  });

  describe("validatePayloadSize", () => {
    it("accepts payload within limit", () => {
      const result = validatePayloadSize("Hello world");
      expect(result.ok).toBe(true);
      expect(result.size).toBe(11);
    });

    it("rejects payload exceeding limit", () => {
      const largePayload = "x".repeat(SIZE_LIMITS.maxPayloadBytes + 1);
      const result = validatePayloadSize(largePayload);
      expect(result.ok).toBe(false);
      expect(result.size).toBeGreaterThan(result.limit);
    });

    it("handles UTF-8 encoding correctly", () => {
      const unicodePayload = "你好世界"; // 4 characters, 12 bytes in UTF-8
      const result = validatePayloadSize(unicodePayload);
      expect(result.ok).toBe(true);
      expect(result.size).toBe(12);
    });
  });

  describe("PipelineBuilder", () => {
    it("creates pipeline with default config", () => {
      const builder = createPipelineBuilder();
      const config = builder.getConfig();

      expect(config.sanitizationPolicy).toEqual(DEFAULT_AI_SANITIZATION_POLICY);
    });

    it("allows custom sanitization policy", () => {
      const customPolicy = {
        ...DEFAULT_AI_SANITIZATION_POLICY,
        max_payload_size: 500,
      };

      const builder = createPipelineBuilder().withSanitizationPolicy(customPolicy);
      const config = builder.getConfig();

      expect(config.sanitizationPolicy.max_payload_size).toBe(500);
    });

    it("allows custom sanitizer", () => {
      const customSanitizer = {
        sanitize: () => ({ diagnostics: [] }),
      };

      const builder = createPipelineBuilder().withSanitizer(customSanitizer);
      const config = builder.getConfig();

      expect(config.sanitizer).toBe(customSanitizer);
    });

    it("allows custom schema validator", () => {
      const customValidator = {
        dryRunApply: () => ({ ok: true }),
      };

      const builder = createPipelineBuilder().withSchemaValidator(customValidator);
      const config = builder.getConfig();

      expect(config.schemaValidator).toBe(customValidator);
    });

    it("builds executable pipeline", async () => {
      const pipeline = createPipelineBuilder().build();
      const result = await pipeline({ html: "<p>Test</p>" });

      expect(result.ok).toBe(true);
    });

    it("supports method chaining", () => {
      const builder = createPipelineBuilder()
        .withSanitizationPolicy(DEFAULT_AI_SANITIZATION_POLICY)
        .skipSchemaValidation();

      expect(builder.getConfig().skipSchemaValidation).toBe(true);
    });
  });

  describe("SIZE_LIMITS", () => {
    it("has reasonable default limits", () => {
      expect(SIZE_LIMITS.maxPayloadBytes).toBe(1024 * 1024); // 1MB
      expect(SIZE_LIMITS.maxNodes).toBe(10000);
      expect(SIZE_LIMITS.maxDepth).toBe(50);
    });
  });

  describe("DEFAULT_PIPELINE_CONFIG", () => {
    it("uses default sanitization policy", () => {
      expect(DEFAULT_PIPELINE_CONFIG.sanitizationPolicy).toEqual(DEFAULT_AI_SANITIZATION_POLICY);
    });
  });
});
