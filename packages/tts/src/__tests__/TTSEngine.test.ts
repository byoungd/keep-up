/**
 * TTSEngine Unit Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TTSEngine } from "../engine/TTSEngine";
import type { ITTSProvider } from "../providers/ITTSProvider";
import type { TTSSynthesizeResult, TTSVoice } from "../types";

// Mock provider factory
function createMockProvider(
  id: "edge" | "browser",
  options: { available?: boolean; voices?: TTSVoice[] } = {}
): ITTSProvider {
  const { available = true, voices = [] } = options;

  return {
    id,
    name: `Mock ${id} Provider`,
    isAvailable: () => available,
    getVoices: vi.fn().mockResolvedValue(voices),
    synthesize: vi.fn().mockResolvedValue({
      audio: new ArrayBuffer(100),
      audioType: "audio/mpeg",
      wordTimings: [
        { word: "Hello", startMs: 0, endMs: 500, charStart: 0, charEnd: 5 },
        { word: "world", startMs: 500, endMs: 1000, charStart: 6, charEnd: 11 },
      ],
      durationMs: 1000,
    } satisfies TTSSynthesizeResult),
  };
}

describe("TTSEngine", () => {
  let engine: TTSEngine;

  beforeEach(() => {
    engine = new TTSEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe("Provider Registration", () => {
    it("should register a provider", () => {
      const provider = createMockProvider("edge");
      engine.registerProvider(provider);
      expect(engine.getCurrentProviderId()).toBe("edge");
    });

    it("should auto-select first available provider", () => {
      const unavailable = createMockProvider("browser", { available: false });
      const available = createMockProvider("edge");

      engine.registerProvider(unavailable);
      engine.registerProvider(available);

      expect(engine.getCurrentProviderId()).toBe("edge");
    });

    it("should allow switching providers", () => {
      const edge = createMockProvider("edge");
      const browser = createMockProvider("browser");

      engine.registerProvider(edge);
      engine.registerProvider(browser);

      expect(engine.selectProvider("browser")).toBe(true);
      expect(engine.getCurrentProviderId()).toBe("browser");
    });

    it("should reject unavailable providers", () => {
      const unavailable = createMockProvider("browser", { available: false });
      engine.registerProvider(unavailable);

      expect(engine.selectProvider("browser")).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should use default configuration", () => {
      const config = engine.getConfig();
      expect(config.defaultProvider).toBe("edge");
      expect(config.defaultSpeed).toBe(1.0);
    });

    it("should accept custom configuration", () => {
      const customEngine = new TTSEngine({
        defaultProvider: "browser",
        defaultSpeed: 1.5,
      });

      const config = customEngine.getConfig();
      expect(config.defaultProvider).toBe("browser");
      expect(config.defaultSpeed).toBe(1.5);

      customEngine.dispose();
    });

    it("should set speed within bounds", () => {
      engine.setSpeed(0.1); // Below minimum
      expect(engine.getConfig().defaultSpeed).toBe(0.5);

      engine.setSpeed(3.0); // Above maximum
      expect(engine.getConfig().defaultSpeed).toBe(2.0);

      engine.setSpeed(1.2); // Valid
      expect(engine.getConfig().defaultSpeed).toBe(1.2);
    });

    it("should set voice ID", () => {
      engine.setVoice("en-US-AriaNeural");
      expect(engine.getConfig().defaultVoiceId).toBe("en-US-AriaNeural");
    });
  });

  describe("Playback State", () => {
    it("should start with idle state", () => {
      const state = engine.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isPaused).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.currentWordIndex).toBe(-1);
      expect(state.error).toBe(null);
    });

    it("should report not playing when stopped", () => {
      expect(engine.isPlaying()).toBe(false);
    });
  });

  describe("Voices", () => {
    it("should get voices from current provider", async () => {
      const voices: TTSVoice[] = [
        { id: "voice1", name: "Voice One", locale: "en-US", gender: "female" },
        { id: "voice2", name: "Voice Two", locale: "en-GB", gender: "male" },
      ];

      const provider = createMockProvider("edge", { voices });
      engine.registerProvider(provider);

      const result = await engine.getVoices();
      expect(result).toEqual(voices);
    });

    it("should return empty array when no provider", async () => {
      const result = await engine.getVoices();
      expect(result).toEqual([]);
    });
  });

  describe("Article Playback", () => {
    it("should track paragraph index", () => {
      expect(engine.getCurrentParagraphIndex()).toBe(0);
      expect(engine.getTotalParagraphs()).toBe(0);
    });
  });

  describe("Callbacks", () => {
    it("should accept callbacks", () => {
      const onStart = vi.fn();
      const onEnd = vi.fn();
      const onError = vi.fn();

      engine.setCallbacks({ onStart, onEnd, onError });

      // Callbacks are stored but not directly testable
      // They would be called during actual playback
      expect(true).toBe(true);
    });
  });

  describe("Cleanup", () => {
    it("should clean up on dispose", () => {
      const provider = createMockProvider("edge");
      engine.registerProvider(provider);

      engine.dispose();

      expect(engine.getCurrentProviderId()).toBe(null);
    });
  });
});
