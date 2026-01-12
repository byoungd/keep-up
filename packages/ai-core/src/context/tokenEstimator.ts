/**
 * Token Estimator
 *
 * Fast, accurate token estimation for context window management.
 * Uses heuristics for speed with optional tiktoken for precision.
 */

/**
 * Character to token ratio by language/content type.
 * These are empirically derived averages.
 */
const CHAR_TOKEN_RATIOS = {
  english: 4.0, // ~4 chars per token
  chinese: 1.5, // Chinese uses more tokens per char
  code: 3.5, // Code is slightly denser
  mixed: 3.0, // Mixed content
  default: 3.5,
} as const;

/**
 * Regex patterns for content type detection
 */
const PATTERNS = {
  chinese: /[\u4e00-\u9fff]/g,
  code: /[{}[\]();=<>]/g,
  whitespace: /\s+/g,
} as const;

/**
 * Token estimation options
 */
export interface TokenEstimateOptions {
  /** Content type hint */
  contentType?: "english" | "chinese" | "code" | "mixed";
  /** Whether to use precise counting (slower) */
  precise?: boolean;
}

/**
 * Estimate token count for text.
 *
 * Uses fast heuristics by default. For precise counting,
 * use the tiktoken library (not included to avoid WASM dependency).
 *
 * @param text - Text to estimate
 * @param options - Estimation options
 * @returns Estimated token count
 */
export function estimateTokens(text: string, options: TokenEstimateOptions = {}): number {
  if (!text) {
    return 0;
  }

  // Detect content type if not specified
  const contentType = options.contentType ?? detectContentType(text);
  const ratio = CHAR_TOKEN_RATIOS[contentType] ?? CHAR_TOKEN_RATIOS.default;

  // Base estimation: chars / ratio
  let estimate = text.length / ratio;

  // Adjust for special cases
  estimate = applyAdjustments(text, estimate);

  // Round up to be conservative
  return Math.ceil(estimate);
}

/**
 * Detect content type from text sample.
 */
function detectContentType(text: string): keyof typeof CHAR_TOKEN_RATIOS {
  const sample = text.slice(0, 1000); // Sample first 1000 chars

  // Check for significant Chinese content
  const chineseMatches = sample.match(PATTERNS.chinese);
  if (chineseMatches && chineseMatches.length > sample.length * 0.3) {
    return "chinese";
  }

  // Check for code patterns
  const codeMatches = sample.match(PATTERNS.code);
  if (codeMatches && codeMatches.length > sample.length * 0.05) {
    return "code";
  }

  // Check for mixed content (Chinese + English)
  if (chineseMatches && chineseMatches.length > sample.length * 0.1) {
    return "mixed";
  }

  return "english";
}

/**
 * Apply adjustments for special token patterns.
 */
function applyAdjustments(text: string, baseEstimate: number): number {
  let estimate = baseEstimate;

  // Count words (rough proxy for token boundaries)
  const wordCount = text.split(PATTERNS.whitespace).filter(Boolean).length;

  // Tokens are often close to word count for English
  // Use weighted average if word count differs significantly
  if (wordCount > 0) {
    const wordBasedEstimate = wordCount * 1.3; // ~1.3 tokens per word
    estimate = (estimate + wordBasedEstimate) / 2;
  }

  // Add overhead for special characters and formatting
  const specialChars = (text.match(/[^\w\s]/g) || []).length;
  estimate += specialChars * 0.1;

  return estimate;
}

/**
 * Estimate tokens for an array of messages.
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;

  for (const msg of messages) {
    // Each message has overhead (~4 tokens for role, formatting)
    total += 4;
    total += estimateTokens(msg.content);
  }

  // Add final overhead for message boundary
  total += 3;

  return total;
}

/**
 * Truncate text to fit within token limit.
 *
 * @param text - Text to truncate
 * @param maxTokens - Maximum tokens
 * @param options - Where to truncate from
 * @returns Truncated text
 */
export function truncateToTokens(
  text: string,
  maxTokens: number,
  options: {
    from?: "start" | "end" | "middle";
    ellipsis?: string;
  } = {}
): string {
  const { from = "end", ellipsis = "..." } = options;
  const currentTokens = estimateTokens(text);

  if (currentTokens <= maxTokens) {
    return text;
  }

  // Calculate target character count
  const ratio = text.length / currentTokens;
  const ellipsisTokens = estimateTokens(ellipsis);
  const targetTokens = maxTokens - ellipsisTokens;
  const targetChars = Math.floor(targetTokens * ratio);

  if (targetChars <= 0) {
    return ellipsis;
  }

  switch (from) {
    case "start":
      return ellipsis + text.slice(-targetChars);

    case "middle": {
      const halfChars = Math.floor(targetChars / 2);
      return text.slice(0, halfChars) + ellipsis + text.slice(-halfChars);
    }

    default:
      return text.slice(0, targetChars) + ellipsis;
  }
}

/**
 * Split text into chunks that fit within token limit.
 *
 * @param text - Text to split
 * @param maxTokensPerChunk - Maximum tokens per chunk
 * @param options - Split options
 * @returns Array of text chunks
 */
export function splitIntoChunks(
  text: string,
  maxTokensPerChunk: number,
  options: {
    overlap?: number; // Token overlap between chunks
    splitOn?: RegExp; // Preferred split points
  } = {}
): string[] {
  const { overlap = 0, splitOn = /\n\n|\n|\.(?=\s)/ } = options;

  const totalTokens = estimateTokens(text);
  if (totalTokens <= maxTokensPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  const segments = text.split(splitOn);
  let currentChunk = "";
  let currentTokens = 0;

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment);

    if (currentTokens + segmentTokens > maxTokensPerChunk && currentChunk) {
      // Save current chunk
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap
      if (overlap > 0) {
        const overlapText = truncateToTokens(currentChunk, overlap, { from: "start" });
        currentChunk = `${overlapText} ${segment}`;
        currentTokens = estimateTokens(currentChunk);
      } else {
        currentChunk = segment;
        currentTokens = segmentTokens;
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + segment;
      currentTokens += segmentTokens;
    }
  }

  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
