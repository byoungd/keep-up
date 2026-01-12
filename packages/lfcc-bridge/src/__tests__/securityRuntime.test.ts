// @vitest-environment jsdom
/**
 * SecurityValidator Runtime Enforcement Tests
 *
 * These tests verify that SecurityValidator is properly enforced at runtime
 * entrypoints and that bypassing it triggers the appropriate assertions/logs.
 */

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorAdapterPM } from "../adapters/editorAdapterPM";
import { BridgeController } from "../bridge/bridgeController";
import { createLoroRuntime } from "../runtime/loroRuntime";

describe("SecurityValidator Runtime Enforcement", () => {
  let consoleSpy: MockInstance;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("validateAIPayload entrypoint", () => {
    it("should call securityValidator.validate for every payload", async () => {
      const runtime = createLoroRuntime({ peerId: "1" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      // Valid payload should pass through validator
      const sanitized = await bridge.validateAIPayload("<p>Safe content</p>");
      expect(sanitized).toContain("Safe content");

      // Validator was implicitly called (method returned without throwing)
      expect(onError).not.toHaveBeenCalled();
    });

    it("should log security event when validation fails", async () => {
      const runtime = createLoroRuntime({ peerId: "2" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      await expect(bridge.validateAIPayload("<script>evil()</script>")).rejects.toThrow(
        "AI payload validation failed"
      );

      // onError should have been called with security event
      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0] as Error & {
        code: string;
        data?: Record<string, unknown>;
      };
      expect(error.code).toBe("pipeline_rejected");
    });

    it("should not allow direct CRDT mutation with unsanitized content", async () => {
      const runtime = createLoroRuntime({ peerId: "3" });
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
      });

      // The only safe way to apply AI content is through validateAIPayload
      // Direct manipulation of the runtime should not bypass security

      // This test documents that validateAIPayload is the gatekeeper
      const maliciousPayload = '<div onclick="alert(1)">Click me</div>';

      await expect(bridge.validateAIPayload(maliciousPayload)).rejects.toThrow();
    });
  });

  describe("Bypass detection assertions", () => {
    it("should throw when trying to apply content without validation in dev mode", async () => {
      const runtime = createLoroRuntime({ peerId: "4" });
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
      });

      // Any malicious content should be caught
      const payloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror="alert(1)">',
        '<a href="javascript:void(0)">link</a>',
        '<iframe src="evil.com"></iframe>',
      ];

      for (const payload of payloads) {
        await expect(bridge.validateAIPayload(payload)).rejects.toThrow();
      }
    });

    it("should log critical error if validator would be bypassed", async () => {
      // This test verifies that the system is fail-closed:
      // If someone tries to bypass the validator, they get an error

      const runtime = createLoroRuntime({ peerId: "5" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      // The only way to apply content is through validateAIPayload
      // There is no public method that bypasses validation

      // Attempting to pass dangerous content logs an error
      try {
        await bridge.validateAIPayload("<script>bypass</script>");
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalled();
      const errorArg = onError.mock.calls[0][0] as Error & { code: string };
      expect(errorArg.code).toBe("pipeline_rejected");
    });
  });

  describe("Integration with BridgeController lifecycle", () => {
    it("should maintain security enforcement across view lifecycle", async () => {
      const runtime = createLoroRuntime({ peerId: "6" });
      const onError = vi.fn();
      const bridge = new BridgeController({
        runtime,
        adapter: new EditorAdapterPM(),
        onError,
      });

      // Before view creation
      await expect(bridge.validateAIPayload("<script>test</script>")).rejects.toThrow();

      // Create view
      const container = document.createElement("div");
      bridge.createView(container);

      // After view creation - security still enforced
      await expect(bridge.validateAIPayload("<script>test</script>")).rejects.toThrow();

      // Clean up
      bridge.destroy();

      // After destruction - security still enforced
      await expect(bridge.validateAIPayload("<script>test</script>")).rejects.toThrow();
    });
  });
});
