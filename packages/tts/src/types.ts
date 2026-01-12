/**
 * TTS Package - Core Type Definitions
 *
 * Platform-agnostic types for text-to-speech functionality.
 */

/**
 * Supported TTS provider identifiers
 */
export type TTSProviderId = "edge" | "browser" | "openai" | "colab";

/**
 * Voice descriptor returned by providers
 */
export interface TTSVoice {
  /** Unique voice identifier (provider-specific) */
  id: string;
  /** Human-readable voice name */
  name: string;
  /** Locale code (e.g., "en-US", "zh-CN") */
  locale: string;
  /** Voice gender */
  gender: "male" | "female" | "neutral" | "unknown";
}

/**
 * Word-level timing data for synchronized highlighting
 */
export interface WordTimingData {
  /** The word text */
  word: string;
  /** Start time in milliseconds from audio beginning */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Character start position in original text */
  charStart: number;
  /** Character end position in original text */
  charEnd: number;
}

/**
 * TTS synthesis options
 */
export interface TTSSynthesizeOptions {
  /** Voice ID to use */
  voiceId?: string;
  /** Speech rate (0.5-2.0, default 1.0) */
  speed?: number;
  /** Request word timing metadata */
  withWordTimings?: boolean;
}

/**
 * Result of TTS synthesis
 */
export interface TTSSynthesizeResult {
  /** Audio data as ArrayBuffer */
  audio: ArrayBuffer;
  /** Audio MIME type (e.g., "audio/mpeg") */
  audioType: string;
  /** Word timing data (if requested and supported) */
  wordTimings?: WordTimingData[];
  /** Total audio duration in milliseconds */
  durationMs?: number;
}

/**
 * TTS engine configuration
 */
export interface TTSEngineConfig {
  /** Default provider to use */
  defaultProvider: TTSProviderId;
  /** Default voice ID */
  defaultVoiceId?: string;
  /** Default speech rate */
  defaultSpeed: number;
  /** API URL for external providers (Edge, OpenAI, Colab) */
  apiUrl?: string;
}

/**
 * Playback state for tracking TTS audio playback
 */
export interface TTSPlaybackState {
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Whether audio is paused */
  isPaused: boolean;
  /** Whether audio is loading */
  isLoading: boolean;
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Current word index being spoken (-1 if none) */
  currentWordIndex: number;
  /** Current word timing data */
  currentWordData: WordTimingData | null;
  /** Last error message */
  error: string | null;
}

/**
 * Event callbacks for TTS engine
 */
export interface TTSCallbacks {
  /** Called when playback starts */
  onStart?: () => void;
  /** Called when playback ends naturally */
  onEnd?: () => void;
  /** Called when playback is paused */
  onPause?: () => void;
  /** Called when playback resumes */
  onResume?: () => void;
  /** Called on playback error */
  onError?: (error: string) => void;
  /** Called periodically with playback progress */
  onProgress?: (currentTime: number, duration: number) => void;
  /** Called when the highlighted word changes */
  onWordChange?: (wordIndex: number, wordData: WordTimingData | null) => void;
  /** Called when state changes */
  onStateChange?: (state: TTSPlaybackState) => void;
}
