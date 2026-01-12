/**
 * TTS Provider Interface
 *
 * Contract for TTS backend implementations.
 * Providers are responsible for voice listing and audio synthesis.
 */

import type { TTSProviderId, TTSSynthesizeOptions, TTSSynthesizeResult, TTSVoice } from "../types";

/**
 * TTS Provider Interface
 *
 * Each provider encapsulates a specific TTS backend (Edge, Browser, OpenAI, etc.)
 */
export interface ITTSProvider {
  /** Unique provider identifier */
  readonly id: TTSProviderId;

  /** Human-readable provider name */
  readonly name: string;

  /**
   * Check if this provider is available in the current environment
   */
  isAvailable(): boolean;

  /**
   * Get list of available voices from this provider
   */
  getVoices(): Promise<TTSVoice[]>;

  /**
   * Synthesize text to audio
   *
   * @param text - Text to synthesize
   * @param options - Synthesis options (voice, speed, etc.)
   * @returns Synthesis result with audio data
   */
  synthesize(text: string, options?: TTSSynthesizeOptions): Promise<TTSSynthesizeResult>;
}

/**
 * Base options for configuring a provider
 */
export interface TTSProviderOptions {
  /** API endpoint URL (for remote providers) */
  apiUrl?: string;
  /** Default voice ID */
  defaultVoiceId?: string;
  /** Default speech rate */
  defaultSpeed?: number;
}
