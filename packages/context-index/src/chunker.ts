import { tokenize } from "@ku0/token";

export interface TextChunk {
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  maxTokens: number;
  overlapTokens: number;
}

export function countTokens(text: string): number {
  return tokenize(text).length;
}

export function chunkText(content: string, options: ChunkOptions): TextChunk[] {
  const lines = content.split("\n");
  const chunks: TextChunk[] = [];

  let currentLines: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line);

    if (currentLines.length > 0 && currentTokens + lineTokens > options.maxTokens) {
      chunks.push({ content: currentLines.join("\n"), tokenCount: currentTokens });
      const overlap = extractOverlap(currentLines, options.overlapTokens);
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
  overlapTokens: number
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
    const lineTokens = countTokens(line);
    if (overlapCount + lineTokens > overlapTokens) {
      break;
    }
    overlapLines.unshift(line);
    overlapCount += lineTokens;
  }

  return { lines: overlapLines, tokenCount: overlapCount };
}
