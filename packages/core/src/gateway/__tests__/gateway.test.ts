/**
 * LFCC v0.9 RC - AI Gateway Controller Tests
 */

import { describe, expect, it } from "vitest";
import { createMockDocumentProvider } from "../conflict.js";
import {
  createAIGateway,
  createAIGatewayWithDefaults,
  createDefaultGatewayConfig,
} from "../gateway.js";
import type { AIGatewayRequest, SpanState } from "../types.js";

describe("AI Gateway Controller", () => {
  // Helper to create test provider
  const createTestProvider = (config?: {
    frontier?: string;
    spans?: Map<string, SpanState>;
    documents?: Set<string>;
  }) => {
    return createMockDocumentProvider({
      frontier: config?.frontier ?? "frontier:v1",
      spans: config?.spans ?? new Map(),
      documents: config?.documents ?? new Set(["doc123"]),
    });
  };

  describe("AIGateway", () => {
    describe("processRequest", () => {
      it("rejects invalid request structure", async () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        const result = await gateway.processRequest({ invalid: true });

        expect(result.status).toBe(400);
        if (result.status === 400) {
          expect(result.code).toBe("INVALID_REQUEST");
        }
      });

      it("rejects malicious payload", async () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
          payload: "<script>alert('xss')</script>",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(400);
        if (result.status === 400) {
          expect(result.code).toBe("MALICIOUS_PAYLOAD");
        }
      });

      it("rejects oversized payload", async () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        const largePayload = "x".repeat(2 * 1024 * 1024); // 2MB
        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
          payload: largePayload,
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(400);
        if (result.status === 400) {
          expect(result.code).toBe("PAYLOAD_TOO_LARGE");
        }
      });

      it("returns 409 for missing document", async () => {
        const provider = createTestProvider({ documents: new Set() });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(409);
        if (result.status === 409) {
          expect(result.reason).toBe("frontier_mismatch");
        }
      });

      it("returns 409 for stale frontier", async () => {
        const provider = createTestProvider({ frontier: "frontier:v1" });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v2", // Ahead
          target_spans: [],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(409);
        if (result.status === 409) {
          expect(result.reason).toBe("frontier_mismatch");
        }
      });

      it("returns 409 for failed preconditions", async () => {
        const spans = new Map<string, SpanState>([
          [
            "s1",
            {
              span_id: "s1",
              annotation_id: "a1",
              block_id: "b1",
              text: "A",
              context_hash: "h1",
              is_verified: true,
            },
          ],
        ]);
        const provider = createTestProvider({ frontier: "frontier:v1", spans });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "wrong" }],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(409);
        if (result.status === 409) {
          expect(result.reason).toBe("hash_mismatch");
          expect(result.failed_preconditions).toHaveLength(1);
        }
      });

      it("returns 409 for unverified target", async () => {
        const spans = new Map<string, SpanState>([
          [
            "s1",
            {
              span_id: "s1",
              annotation_id: "a1",
              block_id: "b1",
              text: "A",
              context_hash: "h1",
              is_verified: false,
            },
          ],
        ]);
        const provider = createTestProvider({ frontier: "frontier:v1", spans });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" }],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(409);
        if (result.status === 409) {
          expect(result.reason).toBe("unverified_target");
        }
      });

      it("processes valid request with payload", async () => {
        const spans = new Map<string, SpanState>([
          [
            "s1",
            {
              span_id: "s1",
              annotation_id: "a1",
              block_id: "b1",
              text: "A",
              context_hash: "h1",
              is_verified: true,
            },
          ],
        ]);
        const provider = createTestProvider({ frontier: "frontier:v1", spans });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" }],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
          payload: "<p>Hello world</p>",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.server_frontier_tag).toBe("frontier:v1");
          expect(result.apply_plan).toBeDefined();
          expect(result.apply_plan?.operations).toHaveLength(1);
        }
      });

      it("returns cached response for duplicate request_id", async () => {
        const spans = new Map<string, SpanState>([
          [
            "s1",
            {
              span_id: "s1",
              annotation_id: "a1",
              block_id: "b1",
              text: "A",
              context_hash: "h1",
              is_verified: true,
            },
          ],
        ]);
        const provider = createTestProvider({ frontier: "frontier:v1", spans });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" }],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
          payload: "<p>Hello world</p>",
        };

        const first = await gateway.processRequest(request);
        expect(first.status).toBe(200);

        spans.set("s1", {
          span_id: "s1",
          annotation_id: "a1",
          block_id: "b1",
          text: "A",
          context_hash: "changed",
          is_verified: true,
        });

        const second = await gateway.processRequest(request);
        expect(second).toBe(first);
      });

      it("returns canonical tree when requested", async () => {
        const spans = new Map<string, SpanState>([
          [
            "s1",
            {
              span_id: "s1",
              annotation_id: "a1",
              block_id: "b1",
              text: "A",
              context_hash: "h1",
              is_verified: true,
            },
          ],
        ]);
        const provider = createTestProvider({ frontier: "frontier:v1", spans });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [{ annotation_id: "a1", span_id: "s1", if_match_context_hash: "h1" }],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
          payload: "<p>Hello</p>",
          options: { return_canonical_tree: true },
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.canon_fragment).toBeDefined();
        }
      });

      it("processes request without payload", async () => {
        const provider = createTestProvider({ frontier: "frontier:v1" });
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.apply_plan).toBeUndefined();
        }
      });

      it("echoes client_request_id", async () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
          client_request_id: "req-123",
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.client_request_id).toBe("req-123");
          expect(result.request_id).toBe("req-123");
        }
      });

      it("handles markdown format", async () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        // Markdown-only payloads don't canonicalize (need HTML conversion)
        // This returns 409 with sanitization_reject
        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [],
          instructions: "Test",
          format: "markdown",
          request_id: "req-123",
          payload: "# Hello\n\nWorld",
        };

        const result = await gateway.processRequest(request);

        // Markdown without HTML conversion fails canonicalization
        expect(result.status).toBe(409);
        if (result.status === 409) {
          expect(result.reason).toBe("sanitization_reject");
        }
      });

      it("sanitizes payload and includes diagnostics", async () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        const request: AIGatewayRequest = {
          doc_id: "doc123",
          doc_frontier_tag: "frontier:v1",
          target_spans: [],
          instructions: "Test",
          format: "html",
          request_id: "req-123",
          payload: '<p style="color:red">Hello</p>',
        };

        const result = await gateway.processRequest(request);

        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.diagnostics.some((d) => d.kind === "removed_attr")).toBe(true);
        }
      });
    });

    describe("updateConfig", () => {
      it("updates gateway configuration", () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        gateway.updateConfig({ enableMaliciousCheck: false });

        const config = gateway.getConfig();
        expect(config.enableMaliciousCheck).toBe(false);
      });
    });

    describe("getConfig", () => {
      it("returns current configuration", () => {
        const provider = createTestProvider();
        const gateway = createAIGatewayWithDefaults(provider);

        const config = gateway.getConfig();

        expect(config.documentProvider).toBe(provider);
        expect(config.enableMaliciousCheck).toBe(true);
        expect(config.enableSizeValidation).toBe(true);
      });
    });
  });

  describe("createAIGateway", () => {
    it("creates gateway with custom config", () => {
      const provider = createTestProvider();
      const config = {
        ...createDefaultGatewayConfig(provider),
        enableMaliciousCheck: false,
      };

      const gateway = createAIGateway(config);

      expect(gateway.getConfig().enableMaliciousCheck).toBe(false);
    });
  });

  describe("createAIGatewayWithDefaults", () => {
    it("creates gateway with default config", () => {
      const provider = createTestProvider();
      const gateway = createAIGatewayWithDefaults(provider);

      const config = gateway.getConfig();
      expect(config.enableMaliciousCheck).toBe(true);
      expect(config.enableSizeValidation).toBe(true);
    });
  });

  describe("createDefaultGatewayConfig", () => {
    it("creates config with provider", () => {
      const provider = createTestProvider();
      const config = createDefaultGatewayConfig(provider);

      expect(config.documentProvider).toBe(provider);
      expect(config.enableMaliciousCheck).toBe(true);
      expect(config.enableSizeValidation).toBe(true);
      expect(config.defaultSanitizationPolicy).toBeDefined();
    });
  });
});
