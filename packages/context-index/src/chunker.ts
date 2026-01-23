import { tokenize } from "@ku0/token";
import { getNativeTokenizer, type NativeTokenizer } from "@ku0/tokenizer-rs";

export interface TextChunk {
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  maxTokens: number;
  overlapTokens: number;
  tokenModel?: string;
}

const DEFAULT_MODEL = "cl100k_base";
let cachedNative: NativeTokenizer | null | undefined;

function resolveNativeTokenizer(): NativeTokenizer | null {
  if (cachedNative === undefined) {
    cachedNative = getNativeTokenizer();
  }
  return cachedNative;
}

export function countTokens(text: string, model: string = DEFAULT_MODEL): number {
  if (!text) {
    return 0;
  }

  const native = resolveNativeTokenizer();
  if (native) {
    try {
      return native.countTokens(text, model);
    } catch {
      // Fall back to whitespace tokenization if native binding fails.
    }
  }

  return tokenize(text).length;
}

export function chunkText(content: string, options: ChunkOptions): TextChunk[] {
  const lines = content.split("\n");
  const chunks: TextChunk[] = [];
  const model = options.tokenModel ?? DEFAULT_MODEL;

  let currentLines: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line, model);

    if (currentLines.length > 0 && currentTokens + lineTokens > options.maxTokens) {
      chunks.push({ content: currentLines.join("\n"), tokenCount: currentTokens });
      const overlap = extractOverlap(currentLines, options.overlapTokens, model);
      currentLines = overlap.lines;
      currentTokens = overlap.tokenCount;
    }

    currentLines.push(line);
    currentTokens += lineTokens;
  }

  if (currentLines.length > 0) {
    chunks.push({ content: currentLines.join("\n"), tokenCount: currentTokens });
  }

  return chunks.filter((chunk) => chunk.content.trim().length > 0);
}

function extractOverlap(
  lines: string[],
  overlapTokens: number,
  model: string
): {
  lines: string[];
  tokenCount: number;
} {
  if (overlapTokens <= 0) {
    return { lines: [], tokenCount: 0 };
  }

  const overlapLines: string[] = [];
  let overlapCount = 0;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const lineTokens = countTokens(line, model);
    if (overlapCount + lineTokens > overlapTokens) {
      break;
    }
    overlapLines.unshift(line);
    overlapCount += lineTokens;
  }

  return { lines: overlapLines, tokenCount: overlapCount };
}
