/**
 * TTS Engine
 *
 * Core engine that orchestrates TTS providers, manages audio playback,
 * and provides word-level timing synchronization.
 *
 * Features:
 * - Multi-provider support with automatic fallback
 * - Audio playback management (play, pause, stop, seek)
 * - Word-level timing for synchronized highlighting
 * - Article/paragraph-level reading
 */

import type { ITTSProvider } from "../providers/ITTSProvider";
import type {
  TTSCallbacks,
  TTSEngineConfig,
  TTSPlaybackState,
  TTSProviderId,
  TTSSynthesizeOptions,
  TTSVoice,
  WordTimingData,
} from "../types";

const DEFAULT_CONFIG: TTSEngineConfig = {
  defaultProvider: "edge",
  defaultSpeed: 1.0,
};

/**
 * TTS Engine - Orchestrates providers and manages playback
 */
export class TTSEngine {
  private config: TTSEngineConfig;
  private providers: Map<TTSProviderId, ITTSProvider> = new Map();
  private currentProvider: ITTSProvider | null = null;

  private audioElement: HTMLAudioElement | null = null;
  private callbacks: TTSCallbacks = {};

  // Playback state
  private state: TTSPlaybackState = {
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    currentWordIndex: -1,
    currentWordData: null,
    error: null,
  };

  // Word timing tracking
  private currentWordTimings: WordTimingData[] = [];
  private currentWordIndex = -1;
  private wordTrackingInterval: ReturnType<typeof setInterval> | null = null;

  // Article playback
  private paragraphs: string[] = [];
  private currentParagraphIndex = 0;

  constructor(config: Partial<TTSEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the engine (call after registering providers)
   */
  init(): void {
    if (typeof window === "undefined") {
      return;
    }

    // Create audio element
    this.audioElement = new Audio();
    this.audioElement.addEventListener("ended", this.handleAudioEnded);
    this.audioElement.addEventListener("error", this.handleAudioError);
    this.audioElement.addEventListener("timeupdate", this.handleTimeUpdate);
    this.audioElement.addEventListener("loadstart", () => {
      this.updateState({ isLoading: true });
    });
    this.audioElement.addEventListener("canplay", () => {
      this.updateState({ isLoading: false });
    });

    // Set initial provider
    this.selectProvider(this.config.defaultProvider);
  }

  /**
   * Register a TTS provider
   */
  registerProvider(provider: ITTSProvider): void {
    this.providers.set(provider.id, provider);

    // If this is the first provider, select it
    if (!this.currentProvider && provider.isAvailable()) {
      this.currentProvider = provider;
    }
  }

  /**
   * Select active provider by ID
   */
  selectProvider(providerId: TTSProviderId): boolean {
    const provider = this.providers.get(providerId);
    if (provider?.isAvailable()) {
      this.currentProvider = provider;
      this.config.defaultProvider = providerId;
      return true;
    }
    return false;
  }

  /**
   * Get current provider ID
   */
  getCurrentProviderId(): TTSProviderId | null {
    return this.currentProvider?.id ?? null;
  }

  /**
   * Get available voices from current provider
   */
  async getVoices(): Promise<TTSVoice[]> {
    if (!this.currentProvider) {
      return [];
    }
    return this.currentProvider.getVoices();
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: TTSCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get current playback state
   */
  getState(): TTSPlaybackState {
    return { ...this.state };
  }

  /**
   * Get current configuration
   */
  getConfig(): TTSEngineConfig {
    return { ...this.config };
  }

  /**
   * Set speech speed
   */
  setSpeed(speed: number): void {
    this.config.defaultSpeed = Math.max(0.5, Math.min(2.0, speed));
    if (this.audioElement) {
      this.audioElement.playbackRate = this.config.defaultSpeed;
    }
  }

  /**
   * Set voice ID
   */
  setVoice(voiceId: string): void {
    this.config.defaultVoiceId = voiceId;
  }

  // ============================================================
  // PLAYBACK CONTROL
  // ============================================================

  /**
   * Speak a single text string
   */
  async speak(text: string, options?: TTSSynthesizeOptions): Promise<void> {
    if (!this.currentProvider) {
      this.handleError("No TTS provider available");
      return;
    }

    this.updateState({
      isPlaying: true,
      isPaused: false,
      isLoading: true,
      error: null,
    });
    this.callbacks.onStart?.();

    try {
      await this.synthesizeAndPlay(text, options);
    } catch (error) {
      await this.handleSynthesisError(error, text, options);
    }
  }

  private async synthesizeAndPlay(text: string, options?: TTSSynthesizeOptions): Promise<void> {
    if (!this.currentProvider) {
      throw new Error("No provider");
    }

    const result = await this.currentProvider.synthesize(text, {
      voiceId: options?.voiceId ?? this.config.defaultVoiceId,
      speed: options?.speed ?? this.config.defaultSpeed,
      withWordTimings: options?.withWordTimings ?? true,
    });

    // Store word timings for highlighting
    this.currentWordTimings = result.wordTimings ?? [];
    this.currentWordIndex = -1;

    // Play audio
    await this.playAudioResult(result);
  }

  private async playAudioResult(
    result: Awaited<ReturnType<ITTSProvider["synthesize"]>>
  ): Promise<void> {
    if (result.audio.byteLength > 0 && this.audioElement) {
      const blob = new Blob([result.audio], { type: result.audioType });
      const url = URL.createObjectURL(blob);

      this.audioElement.src = url;
      this.audioElement.playbackRate = this.config.defaultSpeed;

      // Start word tracking
      this.startWordTracking();

      await this.audioElement.play();
      this.updateState({ isLoading: false });
    } else {
      // Browser TTS plays directly (no audio element needed)
      this.updateState({ isLoading: false });
    }
  }

  private async handleSynthesisError(
    error: unknown,
    text: string,
    options?: TTSSynthesizeOptions
  ): Promise<void> {
    const message = error instanceof Error ? error.message : "TTS failed";
    this.handleError(message);

    // Try fallback to browser TTS
    if (this.currentProvider?.id !== "browser") {
      const browserProvider = this.providers.get("browser");
      if (browserProvider?.isAvailable()) {
        console.warn("[TTSEngine] Falling back to browser TTS");
        this.currentProvider = browserProvider;
        this.currentWordTimings = []; // Browser TTS has no word timing
        // Recursive call to speak with fallback provider
        await this.speak(text, options);
      }
    }
  }

  /**
   * Play an article (array of paragraphs)
   */
  async playArticle(paragraphs: string[], startIndex = 0): Promise<void> {
    this.paragraphs = paragraphs;
    this.currentParagraphIndex = startIndex;

    if (paragraphs.length === 0) {
      return;
    }

    await this.playCurrentParagraph();
  }

  /**
   * Play current paragraph
   */
  private async playCurrentParagraph(): Promise<void> {
    const text = this.paragraphs[this.currentParagraphIndex];
    if (!text) {
      this.updateState({
        isPlaying: false,
        isPaused: false,
      });
      this.callbacks.onEnd?.();
      return;
    }

    await this.speak(text);
  }

  /**
   * Go to specific paragraph
   */
  async goToParagraph(index: number): Promise<void> {
    if (index < 0 || index >= this.paragraphs.length) {
      return;
    }

    this.stop();
    this.currentParagraphIndex = index;
    await this.playCurrentParagraph();
  }

  /**
   * Go to next paragraph
   */
  async nextParagraph(): Promise<void> {
    await this.goToParagraph(this.currentParagraphIndex + 1);
  }

  /**
   * Go to previous paragraph
   */
  async prevParagraph(): Promise<void> {
    await this.goToParagraph(this.currentParagraphIndex - 1);
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }

    // Also pause browser TTS if active
    const browserProvider = this.providers.get("browser");
    if (browserProvider && "pause" in browserProvider) {
      (browserProvider as { pause: () => void }).pause();
    }

    this.stopWordTracking();
    this.updateState({ isPaused: true });
    this.callbacks.onPause?.();
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.audioElement?.paused && this.audioElement.src) {
      this.audioElement.play();
    }

    // Also resume browser TTS if active
    const browserProvider = this.providers.get("browser");
    if (browserProvider && "resume" in browserProvider) {
      (browserProvider as { resume: () => void }).resume();
    }

    this.startWordTracking();
    this.updateState({ isPaused: false });
    this.callbacks.onResume?.();
  }

  /**
   * Stop playback completely
   */
  stop(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.src = "";
    }

    // Also stop browser TTS if active
    const browserProvider = this.providers.get("browser");
    if (browserProvider && "stop" in browserProvider) {
      (browserProvider as { stop: () => void }).stop();
    }

    this.stopWordTracking();
    this.currentWordTimings = [];
    this.currentWordIndex = -1;

    this.updateState({
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      duration: 0,
      currentWordIndex: -1,
      currentWordData: null,
    });
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.state.isPlaying && !this.state.isPaused;
  }

  /**
   * Get current paragraph index
   */
  getCurrentParagraphIndex(): number {
    return this.currentParagraphIndex;
  }

  /**
   * Get total paragraph count
   */
  getTotalParagraphs(): number {
    return this.paragraphs.length;
  }

  /**
   * Dispose engine and clean up resources
   */
  dispose(): void {
    this.stop();

    if (this.audioElement) {
      this.audioElement.removeEventListener("ended", this.handleAudioEnded);
      this.audioElement.removeEventListener("error", this.handleAudioError);
      this.audioElement.removeEventListener("timeupdate", this.handleTimeUpdate);
      this.audioElement = null;
    }

    this.providers.clear();
    this.currentProvider = null;
  }

  // ============================================================
  // WORD TIMING
  // ============================================================

  /**
   * Start word tracking interval
   */
  private startWordTracking(): void {
    this.stopWordTracking();

    if (this.currentWordTimings.length === 0) {
      return;
    }

    this.wordTrackingInterval = setInterval(() => {
      this.updateCurrentWord();
    }, 50); // Check every 50ms
  }

  /**
   * Stop word tracking interval
   */
  private stopWordTracking(): void {
    if (this.wordTrackingInterval) {
      clearInterval(this.wordTrackingInterval);
      this.wordTrackingInterval = null;
    }
  }

  /**
   * Update current word based on playback time
   */
  private updateCurrentWord(): void {
    if (!this.audioElement || this.currentWordTimings.length === 0) {
      return;
    }

    const currentTimeMs = this.audioElement.currentTime * 1000;

    // Find the word at current time
    let newWordIndex = -1;
    for (let i = 0; i < this.currentWordTimings.length; i++) {
      const timing = this.currentWordTimings[i];
      if (currentTimeMs >= timing.startMs && currentTimeMs < timing.endMs) {
        newWordIndex = i;
        break;
      }
    }

    // Notify if word changed
    if (newWordIndex !== this.currentWordIndex) {
      this.currentWordIndex = newWordIndex;
      const wordData = newWordIndex >= 0 ? this.currentWordTimings[newWordIndex] : null;

      this.updateState({
        currentWordIndex: newWordIndex,
        currentWordData: wordData,
      });
      this.callbacks.onWordChange?.(newWordIndex, wordData);
    }
  }

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  private handleAudioEnded = (): void => {
    this.stopWordTracking();

    // Check if there are more paragraphs
    if (this.currentParagraphIndex < this.paragraphs.length - 1) {
      this.currentParagraphIndex++;
      this.playCurrentParagraph();
    } else {
      // Article finished
      this.updateState({
        isPlaying: false,
        isPaused: false,
        currentWordIndex: -1,
        currentWordData: null,
      });
      this.callbacks.onEnd?.();
    }
  };

  private handleAudioError = (e: Event): void => {
    const error = (e.target as HTMLAudioElement | null)?.error?.message ?? "Audio playback error";
    this.handleError(error);
  };

  private handleTimeUpdate = (): void => {
    if (!this.audioElement) {
      return;
    }

    const currentTime = this.audioElement.currentTime;
    const duration = this.audioElement.duration || 0;

    this.updateState({
      currentTime,
      duration,
    });
    this.callbacks.onProgress?.(currentTime, duration);
  };

  private handleError(message: string): void {
    this.updateState({
      isPlaying: false,
      isLoading: false,
      error: message,
    });
    this.callbacks.onError?.(message);
  }

  private updateState(partial: Partial<TTSPlaybackState>): void {
    this.state = { ...this.state, ...partial };
    this.callbacks.onStateChange?.({ ...this.state });
  }
}
