import { describe, expect, it, vi } from "vitest";
import { RSSFetcher } from "../fetcher";
import type { FeedSource } from "../types";

describe("RSSFetcher", () => {
  it("uses custom user agent when provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<rss></rss>",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const source: FeedSource = { url: "https://example.com/feed" };
      await RSSFetcher.fetch(source, { userAgent: "CustomUA/1.0" });

      const [, init] = fetchSpy.mock.calls[0];
      expect(init?.headers).toMatchObject({ "User-Agent": "CustomUA/1.0" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("passes conditional headers through proxy and handles 304", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 304,
      statusText: "Not Modified",
      headers: new Headers({ ETag: "etag-1", "Last-Modified": "Tue, 01 Jan 2024 00:00:00 GMT" }),
      json: async () => ({}),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const source: FeedSource = { url: "https://example.com/feed" };
      const result = await RSSFetcher.fetchWithConditional(source, {
        proxyUrl: "https://localhost/api/proxy",
        etag: "etag-1",
        lastModified: "Tue, 01 Jan 2024 00:00:00 GMT",
      });

      const [, init] = fetchSpy.mock.calls[0];
      expect(init?.headers).toMatchObject({
        "If-None-Match": "etag-1",
        "If-Modified-Since": "Tue, 01 Jan 2024 00:00:00 GMT",
      });
      expect(result.modified).toBe(false);
      expect(result.etag).toBe("etag-1");
      expect(result.lastModified).toBe("Tue, 01 Jan 2024 00:00:00 GMT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries on proxy 429 and succeeds", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "Retry-After": "1" }),
        json: async () => ({ error: "rate limited" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: async () => ({ content: "<rss></rss>" }),
      });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const source: FeedSource = { url: "https://example.com/feed" };
      const promise = RSSFetcher.fetchWithConditional(source, {
        proxyUrl: "https://localhost/api/proxy",
        retry: { maxRetries: 1, initialDelay: 10, maxDelay: 10, backoffFactor: 1 },
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.modified).toBe(true);
      expect(result.content).toContain("<rss>");
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });
});
