/**
 * @ku0/tts - Text-to-Speech Package
 *
 * Plugin-based TTS solution with multi-provider support.
 *
 * @example
 * ```typescript
 * import {
 *   TTSEngine,
 *   EdgeTTSProvider,
 *   BrowserTTSProvider
 * } from "@ku0/tts";
 *
 * const engine = new TTSEngine();
 * engine.registerProvider(new EdgeTTSProvider());
 * engine.registerProvider(new BrowserTTSProvider());
 * engine.init();
 *
 * engine.setCallbacks({
 *   onWordChange: (index, data) => {
 *     if (data) highlightWord(data.charStart, data.charEnd);
 *   },
 *   onEnd: () => console.log("Finished"),
 * });
 *
 * await engine.speak("Hello, world!");
 * ```
 */

// Types
export type {
  TTSProviderId,
  TTSVoice,
  WordTimingData,
  TTSSynthesizeOptions,
  TTSSynthesizeResult,
  TTSEngineConfig,
  TTSPlaybackState,
  TTSCallbacks,
} from "./types";

// Provider Interface and Implementations
export type { ITTSProvider, TTSProviderOptions } from "./providers";
export { EdgeTTSProvider, BrowserTTSProvider } from "./providers";

// Engine
export { TTSEngine } from "./engine";

// Factory function for convenience
import { TTSEngine } from "./engine";
import { BrowserTTSProvider, EdgeTTSProvider } from "./providers";
import type { TTSEngineConfig } from "./types";

/**
 * Create a pre-configured TTS engine with default providers
 *
 * Registers both Edge TTS and Browser TTS providers,
 * with Edge as the default and Browser as fallback.
 */
export function createTTSEngine(config?: Partial<TTSEngineConfig>): TTSEngine {
  const engine = new TTSEngine(config);

  // Register default providers
  engine.registerProvider(new EdgeTTSProvider());
  engine.registerProvider(new BrowserTTSProvider());

  return engine;
}
