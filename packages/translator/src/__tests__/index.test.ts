import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationService } from "../index";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("TranslationService", () => {
  let service: TranslationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TranslationService();
  });

  describe("Basic Translation", () => {
    it("should translate text using Microsoft Edge (default provider)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ translations: [{ text: "你好" }] }],
      });

      const result = await service.translate("Hello", "zh");

      expect(result.success).toBe(true);
      expect(result.text).toBe("你好");
      expect(result.provider).toBe("microsoft_edge");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("edge.microsoft.com"),
        expect.any(Object)
      );
    });

    it("should return original text if target language matches source", async () => {
      const result = await service.translate("Hello", "en", { sourceLang: "en" });
      expect(result.text).toBe("Hello");
      expect(result.provider).toBe("none");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle empty or whitespace text", async () => {
      const result = await service.translate("  ", "zh");
      expect(result.text).toBe("");
      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Language Detection", () => {
    it("should detect English", () => {
      expect(service.detectLanguage("Hello world")).toBe("en");
    });

    it("should detect Chinese", () => {
      expect(service.detectLanguage("你好世界")).toBe("zh");
    });

    it("should detect Japanese", () => {
      expect(service.detectLanguage("こんにちは")).toBe("ja");
    });

    it("should detect Korean", () => {
      expect(service.detectLanguage("안녕하세요")).toBe("ko");
    });

    it("should default to English for unknown scripts", () => {
      expect(service.detectLanguage("Bonjour le monde")).toBe("en");
    });
  });

  describe("Fallback Mechanism", () => {
    it("should fall back to Google if Edge fails", async () => {
      // Edge fails 3 times (initial + 2 retries), then Google succeeds
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 }); // Edge attempt 1
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 }); // Edge retry 1
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 }); // Edge retry 2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sentences: [{ trans: "你好" }] }),
      }); // Google succeeds

      const result = await service.translate("Hello", "zh");

      expect(result.success).toBe(true);
      expect(result.text).toBe("你好");
      expect(result.provider).toBe("google");
    });

    it("should return failure if all providers fail", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await service.translate("Hello", "zh");

      expect(result.success).toBe(false);
      expect(result.provider).toBe("none");
    });
  });

  describe("Caching", () => {
    it("should return cached result for identical requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ translations: [{ text: "你好" }] }],
      });

      // First request (hits network)
      const _res1 = await service.translate("Hello", "zh");
      // Second request (hits cache)
      const res2 = await service.translate("Hello", "zh");

      expect(res2.cached).toBe(true);
      expect(res2.text).toBe("你好");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should skip cache if options.skipCache is true", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ translations: [{ text: "你好" }] }],
      });

      await service.translate("Hello", "zh");
      await service.translate("Hello", "zh", { skipCache: true });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Batch Translation (Edge)", () => {
    it("should translate multiple texts in one request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { translations: [{ text: "你好" }] },
          { translations: [{ text: "世界" }] },
        ],
      });

      const results = await service.translateBatchEdge(["Hello", "World"], "zh");

      expect(results).toHaveLength(2);
      expect(results[0].text).toBe("你好");
      expect(results[1].text).toBe("世界");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody).toEqual(["Hello", "World"]);
    });

    it("should maintain original indices with empty strings", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ translations: [{ text: "你好" }] }],
      });

      const results = await service.translateBatchEdge(["Hello", "", " "], "zh");

      expect(results).toHaveLength(3);
      expect(results[0].text).toBe("你好");
      expect(results[1].text).toBe("");
      expect(results[2].text).toBe("");
    });
  });

  describe("Rate Limiting", () => {
    it("should respect rate limits", async () => {
      // Mock a provider with extreme rate limit
      const limitedService = new TranslationService([
        {
          name: "microsoft_edge",
          enabled: true,
          priority: 0,
          rateLimit: { requests: 1, window: 1000 },
        },
      ]);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ translations: [{ text: "OK" }] }],
      });

      await limitedService.translate("Text 1", "zh"); // Success

      // Edge should now be hit on rate limit, falls back to Google (if available)
      // Google is enabled by default in TranslationService
      const res2 = await limitedService.translate("Text 2", "zh");

      expect(res2.provider).not.toBe("microsoft_edge");
    });
  });
});
