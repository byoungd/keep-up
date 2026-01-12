/**
 * Edge TTS Provider
 *
 * Uses Microsoft Edge TTS service via API endpoint.
 * Features:
 * - 322+ voices, including high-quality neural voices
 * - Word-level timing data for synchronized highlighting
 * - Free unlimited usage
 */

import type { TTSSynthesizeOptions, TTSSynthesizeResult, TTSVoice, WordTimingData } from "../types";
import type { ITTSProvider, TTSProviderOptions } from "./ITTSProvider";

const DEFAULT_API_URL = "/api/reader/tts/edge";
const DEFAULT_VOICE = "en-US-AriaNeural";
const DEFAULT_SPEED = 1.0;

/**
 * Response from Edge TTS voices API
 */
interface EdgeVoicesResponse {
  voices: Array<{
    id: string;
    name: string;
    locale: string;
    gender: string;
  }>;
  default: string;
}

/**
 * Response from Edge TTS synthesis API (with metadata)
 */
interface EdgeSynthesisResponse {
  audio: string; // Base64 encoded
  audioType: string;
  wordTimings?: WordTimingData[];
  duration?: number;
}

export class EdgeTTSProvider implements ITTSProvider {
  readonly id = "edge" as const;
  readonly name = "Microsoft Edge TTS";

  private apiUrl: string;
  private defaultVoiceId: string;
  private defaultSpeed: number;
  private cachedVoices: TTSVoice[] | null = null;

  constructor(options: TTSProviderOptions = {}) {
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
    this.defaultVoiceId = options.defaultVoiceId ?? DEFAULT_VOICE;
    this.defaultSpeed = options.defaultSpeed ?? DEFAULT_SPEED;
  }

  /**
   * Edge TTS is available if we're in a browser environment
   * (requires fetch API)
   */
  isAvailable(): boolean {
    return typeof fetch !== "undefined";
  }

  /**
   * Fetch available voices from Edge TTS API
   */
  async getVoices(): Promise<TTSVoice[]> {
    if (this.cachedVoices) {
      return this.cachedVoices;
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data: EdgeVoicesResponse = await response.json();

      this.cachedVoices = data.voices.map((v) => ({
        id: v.id,
        name: v.name,
        locale: v.locale,
        gender: this.normalizeGender(v.gender),
      }));

      return this.cachedVoices;
    } catch (error) {
      console.warn("[EdgeTTSProvider] Failed to fetch voices:", error);
      return [];
    }
  }

  /**
   * Synthesize text to audio with word timing data
   */
  async synthesize(text: string, options: TTSSynthesizeOptions = {}): Promise<TTSSynthesizeResult> {
    const voiceId = options.voiceId ?? this.defaultVoiceId;
    const speed = options.speed ?? this.defaultSpeed;
    const withWordTimings = options.withWordTimings ?? true;

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice: voiceId,
        speed,
        withMetadata: withWordTimings,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error ?? `Edge TTS synthesis failed: ${response.status}`
      );
    }

    // Check if response is JSON (with metadata) or raw audio
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const data: EdgeSynthesisResponse = await response.json();

      // Decode base64 audio
      const audioData = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));

      return {
        audio: audioData.buffer,
        audioType: data.audioType || "audio/mpeg",
        wordTimings: data.wordTimings,
        durationMs: data.duration,
      };
    }

    // Raw audio response (backward compatibility)
    const audioBuffer = await response.arrayBuffer();
    return {
      audio: audioBuffer,
      audioType: contentType || "audio/mpeg",
    };
  }

  /**
   * Update API URL
   */
  setApiUrl(url: string): void {
    this.apiUrl = url;
    this.cachedVoices = null; // Clear cache when URL changes
  }

  /**
   * Normalize gender string to typed value
   */
  private normalizeGender(gender: string): "male" | "female" | "neutral" | "unknown" {
    const lower = gender.toLowerCase();
    if (lower === "male") {
      return "male";
    }
    if (lower === "female") {
      return "female";
    }
    if (lower === "neutral") {
      return "neutral";
    }
    return "unknown";
  }
}
