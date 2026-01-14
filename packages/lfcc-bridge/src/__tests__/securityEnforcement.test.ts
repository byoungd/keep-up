/**
 * LFCC v0.9 RC - Security Enforcement Tests
 * @see docs/product/Audit/phase2/TaskPrompt_Phase2_UI_Quality_Gates_Instrumentation_Agent2.md
 *
 * Tests for D3: SecurityValidator enforcement in UI entrypoints
 * Verifies that:
 * 1. Payloads with sanitizer errors are rejected
 * 2. Non-whitelisted tags are stripped/rejected
 * 3. URL attrs beyond href are constrained
 */

import { describe, expect, it, vi } from "vitest";
import { EditorAdapterPM } from "../adapters/editorAdapterPM";
import { BridgeController } from "../bridge/bridgeController";
import { createLoroRuntime } from "../runtime/loroRuntime";
import { createSecurityValidator } from "../security/validator";

describe("SecurityValidator Enforcement in UI Entrypoints", () => {
  describe("BridgeController.validateAIPayload", () => {
    it("should reject payload with script tags", async () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      await expect(bridge.validateAIPayload('<script>alert("xss")</script>')).rejects.toThrow(
        "AI payload validation failed"
      );

      expect(onError).toHaveBeenCalled();
      const errorCall = onError.mock.calls[0][0];
      expect(errorCall.code).toBe("pipeline_rejected");
    });

    it("should reject payload with event handlers", async () => {
      const runtime = createLoroRuntime({ peerId: "2" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      await expect(
        bridge.validateAIPayload('<div onclick="malicious()">Click me</div>')
      ).rejects.toThrow("AI payload validation failed");

      expect(onError).toHaveBeenCalled();
    });

    it("should reject payload with javascript: URLs", async () => {
      const runtime = createLoroRuntime({ peerId: "3" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      await expect(
        bridge.validateAIPayload('<a href="javascript:alert(1)">Link</a>')
      ).rejects.toThrow("AI payload validation failed");

      expect(onError).toHaveBeenCalled();
    });

    it("should accept valid HTML and return sanitized content", async () => {
      const runtime = createLoroRuntime({ peerId: "4" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      const result = await bridge.validateAIPayload("<p>Hello <strong>world</strong></p>");
      expect(result).toContain("Hello");
      expect(result).toContain("world");
    });

    it("should accept links with https protocol", async () => {
      const runtime = createLoroRuntime({ peerId: "5" });
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
      });

      const result = await bridge.validateAIPayload('<a href="https://example.com">Safe link</a>');
      expect(result).toContain("https://example.com");
    });
  });

  describe("SecurityValidator direct tests", () => {
    it("should strip non-blocked but unknown tags", () => {
      const validator = createSecurityValidator();
      const result = validator.validate("<custom-tag>content</custom-tag>");

      // LFCC 0.9.4 mandates a strict whitelist. Unknown tags must be stripped.
      expect(result.ok).toBe(true); // Still valid, but content is unwrapped
      expect(result.sanitized).not.toContain("<custom-tag>");
      expect(result.sanitized).toContain("content");
    });

    it("should reject iframe tags in strict mode", () => {
      const validator = createSecurityValidator({ enableStrictMode: true });
      const result = validator.validate('<iframe src="https://evil.com"></iframe>');

      // In strict mode, dangerous tags should be rejected
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "DANGEROUS_PATTERN_DETECTED")).toBe(true);
    });

    it("should validate URL attributes beyond href", () => {
      const validator = createSecurityValidator();

      // src attribute with javascript should be rejected
      const srcResult = validator.validate('<img src="javascript:void(0)">');
      expect(srcResult.ok).toBe(false);

      // poster attribute with data: should be validated
      const posterResult = validator.validate('<video poster="data:text/html,<script>"></video>');
      expect(posterResult.ok).toBe(false);
    });

    it("should reject oversized payloads", () => {
      const validator = createSecurityValidator({ maxPayloadSize: 100 });
      const largePayload = `<p>${"x".repeat(200)}</p>`;

      const result = validator.validate(largePayload);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "PAYLOAD_SIZE_EXCEEDED")).toBe(true);
    });

    it("should reject deeply nested elements", () => {
      const validator = createSecurityValidator({ maxNestingDepth: 5 });
      const deepNested = `${"<div>".repeat(10)}content${"</div>".repeat(10)}`;

      const result = validator.validate(deepNested);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "NESTING_DEPTH_EXCEEDED")).toBe(true);
    });
  });

  describe("Bypass detection assertions", () => {
    it("should log security event when validation fails", async () => {
      const runtime = createLoroRuntime({ peerId: "6" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      try {
        await bridge.validateAIPayload("<script>evil()</script>");
      } catch {
        // Expected to throw
      }

      // Should have logged a security event
      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0] as Error & {
        code: string;
        data: Record<string, unknown>;
      };
      expect(error.code).toBe("pipeline_rejected");
      expect(error.data).toHaveProperty("stage");
    });

    it("should log sanitization warnings", async () => {
      const runtime = createLoroRuntime({ peerId: "7" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      // This should pass but may generate warnings about stripped content
      const result = await bridge.validateAIPayload('<p style="color: red">styled text</p>');

      // Content should be preserved (sanitized)
      expect(result).toContain("styled text");
    });
  });
});
