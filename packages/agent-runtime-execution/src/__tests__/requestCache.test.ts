/**
 * Request Cache Tests
 *
 * Tests for cache key generation, collision prevention, and deduplication.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { AgentLLMRequest, AgentLLMResponse } from "../orchestrator/orchestrator";
import { createRequestCache, type RequestCache } from "../orchestrator/requestCache";
import type { AgentMessage } from "../types";

// ============================================================================
// Test Helpers
// ============================================================================

function createRequest(
  messages: AgentMessage[],
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }> = [],
  options: { systemPrompt?: string; temperature?: number } = {}
): AgentLLMRequest {
  return {
    messages,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
    })),
    systemPrompt: options.systemPrompt,
    temperature: options.temperature,
  };
}

function createResponse(content: string): AgentLLMResponse {
  return {
    content,
    finishReason: "stop",
  };
}

// ============================================================================
// Cache Basic Functionality Tests
// ============================================================================

describe("RequestCache", () => {
  let cache: RequestCache;

  beforeEach(() => {
    cache = createRequestCache({ ttlMs: 60000 });
  });

  it("should cache and retrieve responses", () => {
    const request = createRequest([{ role: "user", content: "Hello" }]);
    const response = createResponse("Hi there!");

    cache.set(request, response);
    const cached = cache.get(request);

    expect(cached).toEqual(response);
  });

  it("should return null for uncached requests", () => {
    const request = createRequest([{ role: "user", content: "New question" }]);
    const cached = cache.get(request);

    expect(cached).toBeNull();
  });

  it("should expire entries after TTL", async () => {
    const shortTTLCache = createRequestCache({ ttlMs: 50 });
    const request = createRequest([{ role: "user", content: "Test" }]);
    const response = createResponse("Response");

    shortTTLCache.set(request, response);
    expect(shortTTLCache.get(request)).toEqual(response);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 60));
    expect(shortTTLCache.get(request)).toBeNull();
  });

  it("should track cache statistics", () => {
    const request1 = createRequest([{ role: "user", content: "Q1" }]);
    const request2 = createRequest([{ role: "user", content: "Q2" }]);
    const response = createResponse("Answer");

    cache.set(request1, response);
    cache.get(request1); // hit
    cache.get(request1); // hit
    cache.get(request2); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
  });
});

// ============================================================================
// Collision Prevention Tests (B1)
// ============================================================================

describe("RequestCache Collision Prevention", () => {
  let cache: RequestCache;

  beforeEach(() => {
    cache = createRequestCache();
  });

  it("should NOT produce false hits when messages share 200-char prefix but differ", () => {
    // Create two messages that share the same first 200 characters
    const prefix = "A".repeat(200);
    const message1: AgentMessage = { role: "user", content: `${prefix} FIRST` };
    const message2: AgentMessage = { role: "user", content: `${prefix} SECOND` };

    const request1 = createRequest([message1]);
    const request2 = createRequest([message2]);

    const response1 = createResponse("Response to FIRST");
    const response2 = createResponse("Response to SECOND");

    cache.set(request1, response1);
    cache.set(request2, response2);

    // Each should get its own response, not a collision
    expect(cache.get(request1)).toEqual(response1);
    expect(cache.get(request2)).toEqual(response2);
  });

  it("should produce different cache keys for different full content", () => {
    const prefix = "X".repeat(200);
    const request1 = createRequest([{ role: "user", content: `${prefix}_ONE` }]);
    const request2 = createRequest([{ role: "user", content: `${prefix}_TWO` }]);

    const response1 = createResponse("One");

    cache.set(request1, response1);

    // request2 should NOT hit the cache entry for request1
    const cached = cache.get(request2);
    expect(cached).toBeNull();
  });

  it("should differentiate requests with same messages but different tools", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "Do something" }];

    const request1 = createRequest(messages, [{ name: "toolA", inputSchema: { type: "string" } }]);
    const request2 = createRequest(messages, [{ name: "toolB", inputSchema: { type: "number" } }]);

    const response1 = createResponse("Used toolA");
    const response2 = createResponse("Used toolB");

    cache.set(request1, response1);
    cache.set(request2, response2);

    expect(cache.get(request1)).toEqual(response1);
    expect(cache.get(request2)).toEqual(response2);
  });

  it("should differentiate requests with same tool names but different schemas", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "Execute" }];

    const request1 = createRequest(messages, [
      { name: "execute", inputSchema: { properties: { command: { type: "string" } } } },
    ]);
    const request2 = createRequest(messages, [
      { name: "execute", inputSchema: { properties: { script: { type: "string" } } } },
    ]);

    const response1 = createResponse("Command executed");

    cache.set(request1, response1);

    // Different schema should NOT hit the same cache entry
    expect(cache.get(request2)).toBeNull();
  });

  it("should produce consistent keys for identical requests", () => {
    const request = createRequest(
      [{ role: "user", content: "Consistent query" }],
      [{ name: "tool1", inputSchema: { x: 1 } }],
      { systemPrompt: "Be helpful", temperature: 0.7 }
    );

    const response = createResponse("Consistent answer");

    cache.set(request, response);

    // Same request again should hit cache
    const cached = cache.get(request);
    expect(cached).toEqual(response);
  });

  it("should differentiate by system prompt", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "Same content" }];

    const request1 = createRequest(messages, [], { systemPrompt: "Prompt A" });
    const request2 = createRequest(messages, [], { systemPrompt: "Prompt B" });

    const response1 = createResponse("A");

    cache.set(request1, response1);

    expect(cache.get(request2)).toBeNull();
  });

  it("should differentiate by temperature", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "Same content" }];

    const request1 = createRequest(messages, [], { temperature: 0.5 });
    const request2 = createRequest(messages, [], { temperature: 0.9 });

    const response1 = createResponse("Low temp");

    cache.set(request1, response1);

    expect(cache.get(request2)).toBeNull();
  });
});

// ============================================================================
// LRU Eviction Tests
// ============================================================================

describe("RequestCache LRU Eviction", () => {
  it("should evict least recently used entries when at capacity", async () => {
    const cache = createRequestCache({ maxSize: 3 });

    const requests = [1, 2, 3, 4].map((i) =>
      createRequest([{ role: "user", content: `Query ${i}` }])
    );
    const responses = [1, 2, 3, 4].map((i) => createResponse(`Response ${i}`));

    // Fill cache with delays to ensure distinct timestamps
    cache.set(requests[0], responses[0]);
    await new Promise((r) => setTimeout(r, 5));
    cache.set(requests[1], responses[1]);
    await new Promise((r) => setTimeout(r, 5));
    cache.set(requests[2], responses[2]);

    // Access request 1 to make it recently used
    await new Promise((r) => setTimeout(r, 5));
    cache.get(requests[1]);

    // Add request 3, should evict request 0 (LRU - oldest lastAccessed)
    await new Promise((r) => setTimeout(r, 5));
    cache.set(requests[3], responses[3]);

    expect(cache.get(requests[0])).toBeNull(); // Evicted (oldest)
    expect(cache.get(requests[1])).toEqual(responses[1]); // Still there (accessed recently)
    expect(cache.get(requests[2])).toEqual(responses[2]); // Still there
    expect(cache.get(requests[3])).toEqual(responses[3]); // Newly added
  });
});
