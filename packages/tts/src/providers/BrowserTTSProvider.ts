/**
 * Browser TTS Provider
 *
 * Uses the Web Speech API (SpeechSynthesis) for text-to-speech.
 * Features:
 * - Zero latency, no network required
 * - Native browser voices
 * - Good fallback when external APIs unavailable
 *
 * Limitations:
 * - No word-level timing data
 * - Voice quality varies by browser/OS
 */

import type { TTSSynthesizeOptions, TTSSynthesizeResult, TTSVoice } from "../types";
import type { ITTSProvider, TTSProviderOptions } from "./ITTSProvider";

type VoiceAccent = "en-US" | "en-GB" | "en-AU";

/** Preferred voice patterns for each accent */
const VOICE_PATTERNS: Record<VoiceAccent, string[]> = {
  "en-US": ["Google US English", "Microsoft David", "Samantha", "Alex", "en-US"],
  "en-GB": ["Google UK English", "Microsoft George", "Daniel", "en-GB"],
  "en-AU": ["Google Australian", "Karen", "en-AU"],
};

export class BrowserTTSProvider implements ITTSProvider {
  readonly id = "browser" as const;
  readonly name = "Browser (Web Speech API)";

  private synthesis: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private defaultSpeed: number;
  private preferredAccent: VoiceAccent;
  private resolveInit: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: TTSProviderOptions = {}) {
    this.defaultSpeed = options.defaultSpeed ?? 1.0;
    this.preferredAccent = "en-US";
    this.initializeVoices();
  }

  /**
   * Initialize and load voices (may load asynchronously in some browsers)
   */
  private initializeVoices(): void {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    this.synthesis = window.speechSynthesis;

    // Create a promise that resolves when voices are loaded
    this.initPromise = new Promise<void>((resolve) => {
      this.resolveInit = resolve;

      const loadVoices = () => {
        this.voices = this.synthesis?.getVoices() ?? [];
        if (this.voices.length > 0) {
          this.resolveInit?.();
          this.resolveInit = null;
        }
      };

      // Try loading immediately
      loadVoices();

      // Chrome loads voices asynchronously
      if (this.synthesis?.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = loadVoices;
      }

      // Fallback timeout
      setTimeout(() => {
        loadVoices();
        this.resolveInit?.();
        this.resolveInit = null;
      }, 1000);
    });
  }

  /**
   * Check if Web Speech API is available
   */
  isAvailable(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /**
   * Get available browser voices (English only)
   */
  async getVoices(): Promise<TTSVoice[]> {
    // Wait for voices to load
    await this.initPromise;

    return this.voices
      .filter((v) => v.lang.startsWith("en"))
      .map((v) => ({
        id: v.name,
        name: `[Local] ${v.name}`,
        locale: v.lang,
        gender: "unknown" as const,
      }));
  }

  /**
   * Synthesize text using Web Speech API
   *
   * Note: Browser TTS doesn't return audio data directly.
   * This implementation returns an empty audio buffer and plays directly.
   */
  async synthesize(text: string, options: TTSSynthesizeOptions = {}): Promise<TTSSynthesizeResult> {
    await this.initPromise;

    if (!this.synthesis) {
      throw new Error("Web Speech API not available");
    }

    // Cancel any ongoing speech
    this.synthesis.cancel();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // Set voice if specified
      const voiceId = options.voiceId;
      if (voiceId) {
        const voice = this.voices.find((v) => v.name === voiceId);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
      } else {
        // Use preferred accent
        const voice = this.findVoiceForAccent(this.preferredAccent);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = this.preferredAccent;
        }
      }

      // Set speed
      utterance.rate = Math.max(0.1, Math.min(10, options.speed ?? this.defaultSpeed));

      utterance.onend = () => {
        // Browser TTS plays directly, so we return a minimal result
        resolve({
          audio: new ArrayBuffer(0),
          audioType: "audio/wav",
          durationMs: 0,
        });
      };

      utterance.onerror = (event) => {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      this.synthesis?.speak(utterance);
    });
  }

  /**
   * Stop current speech
   */
  stop(): void {
    this.synthesis?.cancel();
  }

  /**
   * Pause current speech
   */
  pause(): void {
    this.synthesis?.pause();
  }

  /**
   * Resume paused speech
   */
  resume(): void {
    this.synthesis?.resume();
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.synthesis?.speaking ?? false;
  }

  /**
   * Set preferred accent
   */
  setPreferredAccent(accent: VoiceAccent): void {
    this.preferredAccent = accent;
  }

  /**
   * Find the best voice for a given accent
   */
  private findVoiceForAccent(accent: VoiceAccent): SpeechSynthesisVoice | null {
    const patterns = VOICE_PATTERNS[accent] ?? VOICE_PATTERNS["en-US"];

    for (const pattern of patterns) {
      const voice = this.voices.find((v) => v.name.includes(pattern) || v.lang.startsWith(pattern));
      if (voice) {
        return voice;
      }
    }

    // Fallback to any English voice
    return this.voices.find((v) => v.lang.startsWith("en")) ?? null;
  }
}
