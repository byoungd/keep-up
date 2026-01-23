/**
 * @ku0/translator - Enhanced Translation Service
 *
 * Multi-provider translation with intelligent fallback, based on legacy apps/web implementation.
 *
 * Features:
 * - Multi-provider support: Google (free), Microsoft, DeepL, Qwen, DeepSeek
 * - Smart fallback chain: configurable priority
 * - In-memory cache: reduce duplicate requests
 * - Rate limiting: prevent API overuse
 * - Auto-retry: exponential backoff for transient failures
 *
 * @example
 * ```typescript
 * import { translationService } from '@ku0/translator';
 * const result = await translationService.translate('Hello world', 'zh');
 * console.log(result.text); // 你好世界
 * ```
 */

/** Google Free API response sentence object */
interface GoogleSentence {
  trans?: string;
  orig?: string;
}

export type TranslationProvider =
  | "microsoft_edge" // Free Edge translation API (preferred)
  | "google"
  | "google_api"
  | "microsoft"
  | "deepl"
  | "qwen"
  | "deepseek"
  | "none";

export type ContentLanguage = "zh" | "en" | "mixed" | "ja" | "ko" | "fr" | "de" | "es";
export type TranslationStatus = "pending" | "processing" | "completed" | "failed";

export interface TranslationResult {
  text: string;
  provider: TranslationProvider;
  success: boolean;
  error?: string;
  cached?: boolean;
  latency?: number;
  transliteration?: string;
  alternatives?: string[];
  detectedLanguage?: string;
  confidence?: number;
}

export interface ProviderConfig {
  name: TranslationProvider;
  enabled: boolean;
  priority: number;
  url?: string;
  key?: string;
  model?: string;
  rateLimit?: {
    requests: number;
    window: number; // ms
  };
  timeout?: number;
  /** Maximum retry attempts (default 2) */
  maxRetries?: number;
}

interface CacheEntry {
  text: string;
  provider: TranslationProvider;
  timestamp: number;
}

interface RateLimitState {
  count: number;
  resetTime: number;
}

/** Helper function to get environment variables (supports lazy evaluation) */
const getEnv = (key: string): string | undefined => process.env[key];

function writeWarn(message: string): void {
  if (typeof process === "undefined" || !process.stderr) {
    return;
  }
  process.stderr.write(`${message}\n`);
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    name: "microsoft_edge",
    enabled: true,
    priority: 0,
    rateLimit: { requests: 100, window: 60000 },
    timeout: 5000,
    maxRetries: 2,
  },
  {
    name: "google",
    enabled: true,
    priority: 1,
    rateLimit: { requests: 100, window: 60000 },
    timeout: 5000,
    maxRetries: 2,
  },
  {
    name: "qwen",
    enabled: !!getEnv("QWEN_API_KEY"),
    priority: 2,
    url:
      getEnv("QWEN_API_ENDPOINT") ||
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    key: getEnv("QWEN_API_KEY"),
    model: getEnv("QWEN_MODEL") || "qwen-turbo",
    rateLimit: { requests: 60, window: 60000 },
    timeout: 10000,
    maxRetries: 1,
  },
  {
    name: "deepseek",
    enabled: !!getEnv("DEEPSEEK_API_KEY"),
    priority: 3,
    url: "https://api.deepseek.com/chat/completions",
    key: getEnv("DEEPSEEK_API_KEY"),
    model: "deepseek-chat",
    rateLimit: { requests: 60, window: 60000 },
    timeout: 10000,
    maxRetries: 1,
  },
  {
    name: "google_api",
    enabled: !!getEnv("GOOGLE_TRANSLATE_API_KEY"),
    priority: 4,
    key: getEnv("GOOGLE_TRANSLATE_API_KEY"),
    rateLimit: { requests: 1000, window: 60000 },
    timeout: 5000,
    maxRetries: 2,
  },
  {
    name: "microsoft",
    enabled: !!getEnv("MICROSOFT_TRANSLATOR_KEY"),
    priority: 5,
    key: getEnv("MICROSOFT_TRANSLATOR_KEY"),
    rateLimit: { requests: 1000, window: 60000 },
    timeout: 5000,
    maxRetries: 2,
  },
  {
    name: "deepl",
    enabled: !!getEnv("DEEPL_API_KEY"),
    priority: 6,
    key: getEnv("DEEPL_API_KEY"),
    rateLimit: { requests: 500, window: 60000 },
    timeout: 8000,
    maxRetries: 2,
  },
];

const LANG_CODES: Record<string, Partial<Record<ContentLanguage, string>>> = {
  microsoft_edge: { zh: "zh-Hans", en: "en", ja: "ja", ko: "ko", fr: "fr", de: "de", es: "es" },
  google: {
    zh: "zh-CN",
    en: "en",
    mixed: "auto",
    ja: "ja",
    ko: "ko",
    fr: "fr",
    de: "de",
    es: "es",
  },
  microsoft: {
    zh: "zh-Hans",
    en: "en",
    mixed: "auto-detect",
    ja: "ja",
    ko: "ko",
    fr: "fr",
    de: "de",
    es: "es",
  },
  deepl: { zh: "ZH", en: "EN", ja: "JA", ko: "KO", fr: "FR", de: "DE", es: "ES" },
};

/**
 * Translation Service Class
 *
 * Supports multi-provider smart fallback, caching, and rate limiting.
 */
export class TranslationService {
  private providers: ProviderConfig[];
  private cache: Map<string, CacheEntry> = new Map();
  private rateLimits: Map<TranslationProvider, RateLimitState> = new Map();
  private cacheMaxSize = 1000;
  private cacheTTL = 30 * 60 * 1000;

  constructor(customProviders?: Partial<ProviderConfig>[]) {
    this.providers = DEFAULT_PROVIDERS.map((defaultProvider) => {
      const custom = customProviders?.find((p) => p.name === defaultProvider.name);
      return custom ? { ...defaultProvider, ...custom } : defaultProvider;
    })
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Translate text with smart provider selection.
   *
   * @param text - Text to translate
   * @param targetLang - Target language
   * @param options.preferredProvider - Preferred translation provider
   * @param options.skipCache - Skip cache lookup
   * @param options.sourceLang - Source language (optional, auto-detected by default)
   * @returns Translation result
   */
  async translate(
    text: string,
    targetLang: ContentLanguage,
    options: {
      preferredProvider?: TranslationProvider;
      skipCache?: boolean;
      sourceLang?: ContentLanguage;
    } = {}
  ): Promise<TranslationResult> {
    const startTime = Date.now();
    const { preferredProvider, skipCache = false, sourceLang } = options;

    if (!text.trim()) {
      return { text: "", provider: "none", success: true, latency: 0 };
    }

    const detectedLang = sourceLang || this.detectLanguage(text);
    if (detectedLang === targetLang) {
      return { text, provider: "none", success: true, latency: 0 };
    }

    const cacheKey = this.getCacheKey(text, targetLang);
    if (!skipCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          text: cached.text,
          provider: cached.provider,
          success: true,
          cached: true,
          latency: Date.now() - startTime,
        };
      }
    }

    let availableProviders = this.providers.filter((p) => this.isProviderAvailable(p.name));

    if (preferredProvider) {
      const preferred = availableProviders.find((p) => p.name === preferredProvider);
      if (preferred) {
        availableProviders = [
          preferred,
          ...availableProviders.filter((p) => p.name !== preferredProvider),
        ];
      }
    }

    for (const provider of availableProviders) {
      try {
        const result = await this.callProviderWithRetry(provider, text, detectedLang, targetLang);
        const latency = Date.now() - startTime;
        this.setCache(cacheKey, result, provider.name);
        return { text: result, provider: provider.name, success: true, latency };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        writeWarn(`[Translation] ${provider.name} failed: ${detail}`);
      }
    }

    return {
      text,
      provider: "none",
      success: false,
      error: "All translation providers unavailable",
      latency: Date.now() - startTime,
    };
  }

  /**
   * Batch translate using Microsoft Edge API single request.
   *
   * @param texts - Array of texts to translate
   * @param targetLang - Target language
   * @param options.sourceLang - Source language (optional)
   * @returns Array of translation results, order matches input
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: batch logic is complex
  async translateBatchEdge(
    texts: string[],
    targetLang: ContentLanguage,
    options: { sourceLang?: ContentLanguage } = {}
  ): Promise<TranslationResult[]> {
    const startTime = Date.now();
    const { sourceLang = "mixed" } = options;

    if (texts.length === 0) {
      return [];
    }

    const nonEmptyTexts: { text: string; originalIndex: number }[] = [];
    for (let i = 0; i < texts.length; i++) {
      const trimmed = texts[i].trim();
      if (trimmed) {
        nonEmptyTexts.push({ text: trimmed, originalIndex: i });
      }
    }

    if (nonEmptyTexts.length === 0) {
      return texts.map(() => ({ text: "", provider: "none", success: true, latency: 0 }));
    }

    try {
      const params = new URLSearchParams();
      if (sourceLang !== "mixed") {
        const fromLang = LANG_CODES.microsoft_edge[sourceLang] || sourceLang;
        if (fromLang) {
          params.set("from", fromLang);
        }
      }

      const toLang = LANG_CODES.microsoft_edge[targetLang] || targetLang;
      params.set("to", toLang);
      params.set("isEnterpriseClient", "false");

      const url = `https://edge.microsoft.com/translate/translatetext?${params}`;
      const payload = nonEmptyTexts.map((item) => item.text);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Edge batch failed: ${response.status}`);
        }
        const data = await response.json();

        if (!Array.isArray(data) || data.length !== nonEmptyTexts.length) {
          throw new Error("Invalid Edge batch response");
        }

        const latency = Date.now() - startTime;
        const results: TranslationResult[] = texts.map(() => ({
          text: "",
          provider: "microsoft_edge",
          success: true,
          latency,
        }));

        for (let i = 0; i < data.length; i++) {
          const translation = data[i]?.translations?.[0]?.text;
          const originalIndex = nonEmptyTexts[i].originalIndex;
          if (translation) {
            results[originalIndex] = {
              text: translation,
              provider: "microsoft_edge",
              success: true,
              latency,
              detectedLanguage: data[i]?.detectedLanguage?.language,
            };
          } else {
            results[originalIndex] = {
              text: texts[originalIndex],
              provider: "microsoft_edge",
              success: false,
              error: "Empty result",
              latency,
            };
          }
        }
        return results;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return texts.map((text) => ({
        text,
        provider: "microsoft_edge",
        success: false,
        error: error instanceof Error ? error.message : "Batch failed",
        latency,
      }));
    }
  }

  /**
   * Call provider with exponential backoff retry
   */
  private async callProviderWithRetry(
    provider: ProviderConfig,
    text: string,
    sourceLang: ContentLanguage,
    targetLang: ContentLanguage
  ): Promise<string> {
    const maxRetries = provider.maxRetries ?? 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.callProvider(provider, text, sourceLang, targetLang);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms...
          const delay = 100 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  private async callProvider(
    provider: ProviderConfig,
    text: string,
    sourceLang: ContentLanguage,
    targetLang: ContentLanguage
  ): Promise<string> {
    this.checkRateLimit(provider);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeout || 10000);

    try {
      let result: string;
      switch (provider.name) {
        case "microsoft_edge":
          result = await this.callMicrosoftEdge(text, sourceLang, targetLang, controller.signal);
          break;
        case "google":
          result = await this.callGoogleFree(text, sourceLang, targetLang, controller.signal);
          break;
        case "google_api":
          result = await this.callGoogleAPI(
            text,
            sourceLang,
            targetLang,
            provider,
            controller.signal
          );
          break;
        case "microsoft":
          result = await this.callMicrosoft(
            text,
            sourceLang,
            targetLang,
            provider,
            controller.signal
          );
          break;
        case "deepl":
          result = await this.callDeepL(text, sourceLang, targetLang, provider, controller.signal);
          break;
        case "qwen":
        case "deepseek":
          result = await this.callLLM(text, targetLang, provider, controller.signal);
          break;
        default:
          throw new Error(`Unknown provider: ${provider.name}`);
      }
      this.incrementRateLimit(provider.name);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callMicrosoftEdge(
    text: string,
    sourceLang: ContentLanguage,
    targetLang: ContentLanguage,
    signal: AbortSignal
  ): Promise<string> {
    const params = new URLSearchParams();
    if (sourceLang !== "mixed") {
      const fromLang = LANG_CODES.microsoft_edge[sourceLang] || sourceLang;
      if (fromLang) {
        params.set("from", fromLang);
      }
    }
    const toLang = LANG_CODES.microsoft_edge[targetLang] || targetLang;
    params.set("to", toLang);
    params.set("isEnterpriseClient", "false");

    const url = `https://edge.microsoft.com/translate/translatetext?${params}`;
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([text]),
    });

    if (!response.ok) {
      throw new Error(`Edge failed: ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data) || !data[0]?.translations?.[0]?.text) {
      throw new Error("Invalid Edge response");
    }
    return data[0].translations[0].text;
  }

  private async callGoogleFree(
    text: string,
    sourceLang: ContentLanguage,
    targetLang: ContentLanguage,
    signal: AbortSignal
  ): Promise<string> {
    const sl = sourceLang === "mixed" ? "auto" : LANG_CODES.google[sourceLang] || sourceLang;
    const tl = LANG_CODES.google[targetLang] || targetLang;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dj=1&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Google failed: ${response.status}`);
    }
    const data = (await response.json()) as { sentences?: GoogleSentence[] };
    if (!data?.sentences || !Array.isArray(data.sentences)) {
      throw new Error("Invalid Google response");
    }
    return data.sentences
      .filter((s: GoogleSentence) => s?.trans)
      .map((s: GoogleSentence) => s.trans)
      .join("");
  }

  private async callGoogleAPI(
    text: string,
    _sourceLang: ContentLanguage,
    targetLang: ContentLanguage,
    provider: ProviderConfig,
    signal: AbortSignal
  ): Promise<string> {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${provider.key}`;
    const tl = LANG_CODES.google[targetLang] || targetLang;
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, target: tl, format: "text" }),
    });
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }
    const data = (await response.json()) as {
      data: { translations: Array<{ translatedText: string }> };
    };
    return data.data.translations[0].translatedText;
  }

  private async callMicrosoft(
    text: string,
    _sourceLang: ContentLanguage,
    targetLang: ContentLanguage,
    provider: ProviderConfig,
    signal: AbortSignal
  ): Promise<string> {
    if (!provider.key) {
      throw new Error("Microsoft key missing");
    }
    const tl = LANG_CODES.microsoft[targetLang] || targetLang;
    const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${tl}`;
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Ocp-Apim-Subscription-Key": provider.key || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ text }]),
    });
    if (!response.ok) {
      throw new Error(`Microsoft error: ${response.status}`);
    }
    const data = (await response.json()) as Array<{
      translations: Array<{ text: string }>;
    }>;
    return data[0].translations[0].text;
  }

  private async callDeepL(
    text: string,
    _sourceLang: ContentLanguage,
    targetLang: ContentLanguage,
    provider: ProviderConfig,
    signal: AbortSignal
  ): Promise<string> {
    const tl = LANG_CODES.deepl[targetLang] || targetLang.toUpperCase();
    const isFree = provider.key?.endsWith(":fx");
    const baseUrl = isFree
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";
    const response = await fetch(baseUrl, {
      method: "POST",
      signal,
      headers: {
        Authorization: `DeepL-Auth-Key ${provider.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [text], target_lang: tl }),
    });
    if (!response.ok) {
      throw new Error(`DeepL error: ${response.status}`);
    }
    const data = (await response.json()) as { translations: Array<{ text: string }> };
    return data.translations[0].text;
  }

  private async callLLM(
    text: string,
    targetLang: ContentLanguage,
    provider: ProviderConfig,
    signal: AbortSignal
  ): Promise<string> {
    if (!provider.key) {
      throw new Error(`${provider.name} key missing`);
    }

    // Enhanced translation prompts
    const prompt =
      targetLang === "en"
        ? "You are a professional translator. Translate the following text to English. Preserve the original meaning, tone, and formatting. Return ONLY the translated text without any explanation or notes."
        : targetLang === "zh"
          ? "You are a professional translator. Translate the following text to Chinese. Preserve the original meaning, tone, and formatting. Return ONLY the translated text without any explanation or notes."
          : `You are a professional translator. Translate the following text to ${targetLang}. Return ONLY the translated text.`;

    const response = await fetch(provider.url || "", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${provider.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: Math.max(text.length * 3, 500),
      }),
    });
    if (!response.ok) {
      throw new Error(`${provider.name} LLM error: ${response.status}`);
    }
    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content.trim();
  }

  /**
   * Detect text language
   */
  detectLanguage(text: string): ContentLanguage {
    if (!text.trim()) {
      return "en";
    }
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const japaneseChars = (text.match(/[\u3040-\u30ff]/g) || []).length;
    const koreanChars = (text.match(/[\uac00-\ud7af]/g) || []).length;
    const totalChars = text.replace(/\s/g, "").length || 1;
    if (japaneseChars / totalChars > 0.3) {
      return "ja";
    }
    if (koreanChars / totalChars > 0.3) {
      return "ko";
    }
    if (chineseChars / totalChars > 0.5) {
      return "zh";
    }
    return "en";
  }

  private getCacheKey(text: string, targetLang: ContentLanguage): string {
    // Use simple hash to avoid overly long keys
    const hash = text.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    return `${targetLang}:${hash}:${text.slice(0, 100)}`;
  }

  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  private setCache(key: string, text: string, provider: TranslationProvider): void {
    if (this.cache.size >= this.cacheMaxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { text, provider, timestamp: Date.now() });
  }

  private isProviderAvailable(name: TranslationProvider): boolean {
    const provider = this.providers.find((p) => p.name === name);
    if (!provider?.enabled) {
      return false;
    }
    const state = this.rateLimits.get(name);
    if (
      state &&
      Date.now() < state.resetTime &&
      state.count >= (provider.rateLimit?.requests || Number.POSITIVE_INFINITY)
    ) {
      return false;
    }
    return true;
  }

  private checkRateLimit(provider: ProviderConfig): void {
    if (!provider.rateLimit) {
      return;
    }
    const state = this.rateLimits.get(provider.name);
    const now = Date.now();
    if (!state || now >= state.resetTime) {
      this.rateLimits.set(provider.name, { count: 0, resetTime: now + provider.rateLimit.window });
    } else if (state.count >= provider.rateLimit.requests) {
      throw new Error(`Rate limit exceeded for ${provider.name}`);
    }
  }

  private incrementRateLimit(name: TranslationProvider): void {
    const state = this.rateLimits.get(name);
    if (state) {
      state.count++;
    }
  }
}

/** Default singleton instance */
export const translationService = new TranslationService();

/** Get translation service instance */
export function getTranslationService() {
  return translationService;
}
