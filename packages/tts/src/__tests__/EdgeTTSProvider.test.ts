/**
 * EdgeTTSProvider Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeTTSProvider } from "../providers/EdgeTTSProvider";

describe("EdgeTTSProvider", () => {
  let provider: EdgeTTSProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    // Save original fetch and replace with mock
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();

    // Use full URL for tests to avoid Node.js URL parsing issues
    provider = new EdgeTTSProvider({ apiUrl: "https://localhost/api/reader/tts/edge" });
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const mockFetch = () => globalThis.fetch as ReturnType<typeof vi.fn>;

  describe("Provider Identity", () => {
    it("should have correct id and name", () => {
      expect(provider.id).toBe("edge");
      expect(provider.name).toBe("Microsoft Edge TTS");
    });
  });

  describe("Availability", () => {
    it("should be available when fetch exists", () => {
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe("getVoices", () => {
    it("should fetch and return voices", async () => {
      mockFetch().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            voices: [
              { id: "en-US-AriaNeural", name: "Aria", locale: "en-US", gender: "Female" },
              { id: "en-US-GuyNeural", name: "Guy", locale: "en-US", gender: "Male" },
            ],
            default: "en-US-AriaNeural",
          }),
      });

      const voices = await provider.getVoices();

      expect(voices).toHaveLength(2);
      expect(voices[0]).toEqual({
        id: "en-US-AriaNeural",
        name: "Aria",
        locale: "en-US",
        gender: "female",
      });
    });

    it("should cache voices after first fetch", async () => {
      mockFetch().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            voices: [{ id: "voice1", name: "Voice", locale: "en-US", gender: "Female" }],
            default: "voice1",
          }),
      });

      await provider.getVoices();
      await provider.getVoices(); // Second call

      expect(mockFetch()).toHaveBeenCalledTimes(1);
    });

    it("should return empty array on fetch error", async () => {
      mockFetch().mockRejectedValueOnce(new Error("Network error"));

      const voices = await provider.getVoices();

      expect(voices).toEqual([]);
    });
  });

  describe("synthesize", () => {
    it("should call API with correct parameters", async () => {
      const mockAudio = btoa("fake audio data");
      mockFetch().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({
            audio: mockAudio,
            audioType: "audio/mpeg",
            wordTimings: [{ word: "Hello", startMs: 0, endMs: 500, charStart: 0, charEnd: 5 }],
            duration: 500,
          }),
      });

      const result = await provider.synthesize("Hello", {
        voiceId: "en-US-AriaNeural",
        speed: 1.2,
        withWordTimings: true,
      });

      expect(mockFetch()).toHaveBeenCalledWith(
        "https://localhost/api/reader/tts/edge",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            text: "Hello",
            voice: "en-US-AriaNeural",
            speed: 1.2,
            withMetadata: true,
          }),
        })
      );

      expect(result.audioType).toBe("audio/mpeg");
      expect(result.wordTimings).toHaveLength(1);
    });

    it("should use default values when options not provided", async () => {
      const mockAudio = btoa("audio");
      mockFetch().mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({
            audio: mockAudio,
            audioType: "audio/mpeg",
          }),
      });

      await provider.synthesize("Test");

      expect(mockFetch()).toHaveBeenCalledWith(
        "https://localhost/api/reader/tts/edge",
        expect.objectContaining({
          body: JSON.stringify({
            text: "Test",
            voice: "en-US-AriaNeural",
            speed: 1.0,
            withMetadata: true,
          }),
        })
      );
    });

    it("should throw on API error", async () => {
      mockFetch().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      });

      await expect(provider.synthesize("Error")).rejects.toThrow("Server error");
    });
  });

  describe("Configuration", () => {
    it("should accept custom API URL", async () => {
      const customProvider = new EdgeTTSProvider({
        apiUrl: "https://custom.api/tts",
      });

      mockFetch().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ voices: [], default: "" }),
      });

      await customProvider.getVoices();

      expect(mockFetch()).toHaveBeenCalledWith("https://custom.api/tts", expect.anything());
    });
  });
});
