import type { EditorSchemaValidator } from "@ku0/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createSecurityValidator, type SecurityValidator } from "../security/validator";

describe("SecurityValidator", () => {
  let validator: SecurityValidator;

  beforeEach(() => {
    validator = createSecurityValidator();
  });

  describe("XSS Attack Prevention", () => {
    it("should reject script tags", () => {
      const payload = '<p>Hello <script>alert("XSS")</script> World</p>';
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "DANGEROUS_PATTERN_DETECTED" || e.message.includes("script tag")
        )
      ).toBe(true);
    });

    it("should reject event handlers", () => {
      const payload = "<p onclick=\"alert('XSS')\">Click me</p>";
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "DANGEROUS_PATTERN_DETECTED" || e.message.includes("event handler")
        )
      ).toBe(true);
    });

    it("should reject style tags", () => {
      const payload = "<p>Hello <style>body { background: red; }</style> World</p>";
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "DANGEROUS_PATTERN_DETECTED" || e.message.includes("style tag")
        )
      ).toBe(true);
    });

    it("should reject iframe tags", () => {
      const payload = '<iframe src="evil.com"></iframe>';
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "DANGEROUS_PATTERN_DETECTED" || e.message.includes("iframe tag")
        )
      ).toBe(true);
    });

    it("should reject img with onerror", () => {
      const payload = '<img src="x" onerror="alert(\'XSS\')" />';
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "DANGEROUS_PATTERN_DETECTED" || e.message.includes("event handler")
        )
      ).toBe(true);
    });
  });

  describe("URL Validation", () => {
    it("should allow https URLs", () => {
      const payload = '<a href="https://example.com">Link</a>';
      const result = validator.validate(payload);
      expect(result.ok).toBe(true);
    });

    it("should allow http URLs", () => {
      const payload = '<a href="http://example.com">Link</a>';
      const result = validator.validate(payload);
      expect(result.ok).toBe(true);
    });

    it("should allow mailto URLs", () => {
      const payload = '<a href="mailto:test@example.com">Email</a>';
      const result = validator.validate(payload);
      expect(result.ok).toBe(true);
    });

    it("should allow unquoted https URLs", () => {
      const payload = "<a href=https://example.com>Link</a>";
      const result = validator.validate(payload);
      expect(result.ok).toBe(true);
    });

    it("should reject javascript: URLs", () => {
      const payload = "<a href=\"javascript:alert('XSS')\">Link</a>";
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "DANGEROUS_PATTERN_DETECTED" ||
            e.code === "DANGEROUS_URL_PATTERN" ||
            e.code === "INVALID_URL"
        )
      ).toBe(true);
    });

    it("should reject data: URLs", () => {
      const payload = '<a href="data:text/html,<script>alert(1)</script>">Link</a>';
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "DANGEROUS_URL_PATTERN" ||
            e.code === "DANGEROUS_PATTERN_DETECTED" ||
            e.message.includes("data: URL")
        )
      ).toBe(true);
    });

    it("should reject unquoted javascript: URLs", () => {
      const payload = "<a href=javascript:alert(1)>Link</a>";
      const result = validator.validate(payload);
      expect(result.ok).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "DANGEROUS_PATTERN_DETECTED" ||
            e.code === "DANGEROUS_URL_PATTERN" ||
            e.code === "INVALID_URL"
        )
      ).toBe(true);
    });
  });

  describe("Resource Limits", () => {
    it("should reject payloads exceeding size limit", () => {
      const largePayload = "A".repeat(2 * 1024 * 1024); // 2MB
      const result = validator.validate(largePayload);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "PAYLOAD_SIZE_EXCEEDED")).toBe(true);
    });

    it("should reject deeply nested structures", () => {
      let nestedPayload = "<p>Start</p>";
      for (let i = 0; i < 150; i++) {
        nestedPayload = `<div>${nestedPayload}</div>`;
      }
      const validatorWithStrictLimits = createSecurityValidator({
        maxNestingDepth: 100,
      });
      const result = validatorWithStrictLimits.validate(nestedPayload);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "NESTING_DEPTH_EXCEEDED")).toBe(true);
    });
  });

  describe("Sanitization", () => {
    it("should sanitize and return clean payload", () => {
      const payload = "<p>Hello <strong>World</strong></p>";
      const result = validator.validate(payload);
      expect(result.ok).toBe(true);
      expect(result.sanitized).toBeDefined();
      expect(result.sanitized).toContain("Hello");
      expect(result.sanitized).toContain("World");
    });

    it("should remove blocked tags but keep content", () => {
      const payload = "<p>Hello <script>alert(1)</script> World</p>";
      const result = validator.sanitizePayload(payload);
      expect(result.sanitized).toBeDefined();
      expect(result.sanitized).not.toContain("<script>");
      expect(result.sanitized).toContain("Hello");
      expect(result.sanitized).toContain("World");
    });
  });

  describe("Schema Dry-Run Validation (LFCC §11.2)", () => {
    it("should pass validation when no schema validator is provided", () => {
      const payload = "<p>Hello World</p>";
      const validatorWithoutSchema = createSecurityValidator();
      const result = validatorWithoutSchema.validate(payload);
      expect(result.ok).toBe(true);
    });

    it("should reject payload that passes sanitization but fails schema validation", () => {
      // Mock schema validator that rejects specific nesting patterns
      const rejectingSchemaValidator: EditorSchemaValidator = {
        dryRunApply: (_input) => ({
          ok: false,
          error: "Invalid nesting: blockquote cannot contain heading",
        }),
      };

      const validatorWithSchema = createSecurityValidator({
        schemaValidator: rejectingSchemaValidator,
      });

      // This payload is safe (passes sanitization) but violates schema rules
      const payload = "<blockquote><h1>Invalid nesting</h1></blockquote>";
      const result = validatorWithSchema.validate(payload);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "SCHEMA_VALIDATION_FAILED")).toBe(true);
      expect(result.errors.some((e) => e.detail?.includes("blockquote"))).toBe(true);
    });

    it("should pass payload that passes both sanitization and schema validation", () => {
      const acceptingSchemaValidator: EditorSchemaValidator = {
        dryRunApply: (_input) => ({ ok: true }),
      };

      const validatorWithSchema = createSecurityValidator({
        schemaValidator: acceptingSchemaValidator,
      });

      const payload = "<p>Valid paragraph content</p>";
      const result = validatorWithSchema.validate(payload);

      expect(result.ok).toBe(true);
      expect(result.sanitized).toContain("Valid paragraph content");
    });

    it("should reject payload with unknown block types when schema enforces strict mode", () => {
      const strictSchemaValidator: EditorSchemaValidator = {
        dryRunApply: (input) => {
          // Simulate schema that rejects unknown block types
          if (input.html?.includes("<custom-block>")) {
            return { ok: false, error: "Unknown block type: custom-block" };
          }
          return { ok: true };
        },
      };

      const validatorWithSchema = createSecurityValidator({
        schemaValidator: strictSchemaValidator,
      });

      const payload = "<custom-block>Unknown content</custom-block>";
      const result = validatorWithSchema.validate(payload);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "SCHEMA_VALIDATION_FAILED")).toBe(true);
    });

    it("should validate schema after sanitization passes", () => {
      // Ensure schema validation happens after sanitization
      let schemaValidatorCalled = false;
      const trackingSchemaValidator: EditorSchemaValidator = {
        dryRunApply: (_input) => {
          schemaValidatorCalled = true;
          return { ok: true };
        },
      };

      const validatorWithSchema = createSecurityValidator({
        schemaValidator: trackingSchemaValidator,
      });

      const payload = "<p>Safe content</p>";
      validatorWithSchema.validate(payload);

      expect(schemaValidatorCalled).toBe(true);
    });

    it("should not call schema validator if sanitization fails", () => {
      let schemaValidatorCalled = false;
      const trackingSchemaValidator: EditorSchemaValidator = {
        dryRunApply: (_input) => {
          schemaValidatorCalled = true;
          return { ok: true };
        },
      };

      const validatorWithSchema = createSecurityValidator({
        schemaValidator: trackingSchemaValidator,
      });

      // This should fail at dangerous pattern detection (before schema validation)
      const payload = "<script>alert('xss')</script>";
      validatorWithSchema.validate(payload);

      expect(schemaValidatorCalled).toBe(false);
    });
  });
});
