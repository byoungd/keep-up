/**
 * Semantic Chunker
 *
 * Splits documents into semantically meaningful chunks for embedding.
 * Supports multiple chunking strategies optimized for RAG.
 */

import { estimateTokens } from "@ku0/ai-core";
import type { ChunkingOptions, DocumentChunk } from "./types";

/** Default chunking options */
const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  strategy: "semantic",
  targetSize: 512,
  maxSize: 1024,
  minSize: 100,
  overlap: 50,
  preserveSentences: true,
};

/** Sentence boundary patterns */
const SENTENCE_END = /[.!?]\s+/g;
const PARAGRAPH_END = /\n\n+/g;
const _SECTION_PATTERNS = [
  /^#{1,6}\s+.+$/gm, // Markdown headings
  /^[A-Z][^.!?]*:$/gm, // Title case with colon
  /^\d+\.\s+[A-Z]/gm, // Numbered sections
];

/**
 * Semantic Chunker
 *
 * Splits documents into chunks optimized for embedding and retrieval.
 */
export class SemanticChunker {
  private readonly options: Required<ChunkingOptions>;

  constructor(options: ChunkingOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Chunk a document into semantic segments.
   */
  chunk(content: string, docId: string): DocumentChunk[] {
    const { strategy } = this.options;

    switch (strategy) {
      case "fixed":
        return this.chunkFixed(content, docId);
      case "sentence":
        return this.chunkBySentence(content, docId);
      case "sliding":
        return this.chunkSliding(content, docId);
      default:
        return this.chunkSemantic(content, docId);
    }
  }

  /**
   * Semantic chunking - respects document structure.
   */
  private chunkSemantic(content: string, docId: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sections = this.splitIntoSections(content);

    let chunkIndex = 0;
    let globalOffset = 0;

    for (const section of sections) {
      const sectionChunks = this.chunkSection(
        section.content,
        docId,
        chunkIndex,
        globalOffset,
        section.title
      );

      for (const chunk of sectionChunks) {
        chunks.push(chunk);
        chunkIndex++;
      }

      globalOffset += section.content.length;
    }

    return chunks;
  }

  /**
   * Split content into sections based on headings.
   */
  private splitIntoSections(content: string): Array<{ title?: string; content: string }> {
    const sections: Array<{ title?: string; content: string }> = [];

    // Find all heading positions
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings: Array<{ level: number; title: string; start: number; end: number }> = [];

    for (const match of content.matchAll(headingPattern)) {
      headings.push({
        level: match[1].length,
        title: match[2],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    if (headings.length === 0) {
      // No headings, treat as single section
      return [{ content }];
    }

    // Split content by headings
    const _lastEnd = 0;

    // Content before first heading
    if (headings[0].start > 0) {
      const preContent = content.slice(0, headings[0].start).trim();
      if (preContent) {
        sections.push({ content: preContent });
      }
    }

    // Each heading section
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const nextStart = i < headings.length - 1 ? headings[i + 1].start : content.length;
      const sectionContent = content.slice(heading.end, nextStart).trim();

      if (sectionContent) {
        sections.push({
          title: heading.title,
          content: sectionContent,
        });
      }
    }

    return sections;
  }

  /**
   * Chunk a section into smaller pieces.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: chunking handles splitting, token budgets, and paragraph tracking
  private chunkSection(
    content: string,
    docId: string,
    startIndex: number,
    startOffset: number,
    sectionTitle?: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const paragraphs = content.split(PARAGRAPH_END).filter(Boolean);

    let currentChunk = "";
    let currentTokens = 0;
    let chunkStartOffset = startOffset;
    let paragraphIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = estimateTokens(paragraph);

      // If paragraph alone exceeds max, split it
      if (paragraphTokens > this.options.maxSize) {
        // Flush current chunk
        if (currentChunk) {
          chunks.push(
            this.createChunk(docId, startIndex + chunks.length, currentChunk, chunkStartOffset, {
              sectionTitle,
              paragraphIndex,
            })
          );
          currentChunk = "";
          currentTokens = 0;
        }

        // Split large paragraph by sentences
        const sentenceChunks = this.splitBySentences(
          paragraph,
          docId,
          startIndex + chunks.length,
          chunkStartOffset,
          sectionTitle
        );
        for (const chunk of sentenceChunks) {
          chunks.push(chunk);
        }
        chunkStartOffset += paragraph.length + 2; // +2 for paragraph separator
        continue;
      }

      // Check if adding paragraph exceeds target
      if (currentTokens + paragraphTokens > this.options.targetSize && currentChunk) {
        // Flush current chunk
        chunks.push(
          this.createChunk(docId, startIndex + chunks.length, currentChunk, chunkStartOffset, {
            sectionTitle,
            paragraphIndex,
          })
        );

        // Start new chunk with overlap
        if (this.options.overlap > 0) {
          const overlapText = this.getOverlap(currentChunk);
          currentChunk = `${overlapText}\n\n${paragraph}`;
          currentTokens = estimateTokens(currentChunk);
        } else {
          currentChunk = paragraph;
          currentTokens = paragraphTokens;
        }
        chunkStartOffset += currentChunk.length - paragraph.length;
      } else {
        // Add to current chunk
        currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
        currentTokens += paragraphTokens;
      }

      paragraphIndex++;
    }

    // Flush remaining chunk
    if (currentChunk && estimateTokens(currentChunk) >= this.options.minSize) {
      chunks.push(
        this.createChunk(docId, startIndex + chunks.length, currentChunk, chunkStartOffset, {
          sectionTitle,
          paragraphIndex,
        })
      );
    } else if (currentChunk && chunks.length > 0) {
      // Append to last chunk if too small
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.content += `\n\n${currentChunk}`;
      lastChunk.tokenCount = estimateTokens(lastChunk.content);
      lastChunk.charCount = lastChunk.content.length;
      lastChunk.endOffset += currentChunk.length + 2;
    } else if (currentChunk) {
      // Create chunk even if small (only chunk in section)
      chunks.push(
        this.createChunk(docId, startIndex + chunks.length, currentChunk, chunkStartOffset, {
          sectionTitle,
          paragraphIndex,
        })
      );
    }

    return chunks;
  }

  /**
   * Split text by sentences for large paragraphs.
   */
  private splitBySentences(
    text: string,
    docId: string,
    startIndex: number,
    startOffset: number,
    sectionTitle?: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sentences = text.split(SENTENCE_END).filter(Boolean);

    let currentChunk = "";
    let currentTokens = 0;
    let chunkStartOffset = startOffset;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const sentenceTokens = estimateTokens(sentence);

      if (currentTokens + sentenceTokens > this.options.targetSize && currentChunk) {
        chunks.push(
          this.createChunk(docId, startIndex + chunkIndex, currentChunk, chunkStartOffset, {
            sectionTitle,
          })
        );
        chunkIndex++;
        chunkStartOffset += currentChunk.length;
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
        currentTokens += sentenceTokens;
      }
    }

    if (currentChunk) {
      chunks.push(
        this.createChunk(docId, startIndex + chunkIndex, currentChunk, chunkStartOffset, {
          sectionTitle,
        })
      );
    }

    return chunks;
  }

  /**
   * Fixed-size chunking.
   */
  private chunkFixed(content: string, docId: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const targetChars = this.options.targetSize * 4; // Rough char estimate

    for (let i = 0; i < content.length; i += targetChars) {
      const chunkContent = content.slice(i, i + targetChars);
      chunks.push(this.createChunk(docId, chunks.length, chunkContent, i, {}));
    }

    return chunks;
  }

  /**
   * Sentence-level chunking.
   */
  private chunkBySentence(content: string, docId: string): DocumentChunk[] {
    return this.splitBySentences(content, docId, 0, 0);
  }

  /**
   * Sliding window chunking with overlap.
   */
  private chunkSliding(content: string, docId: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const targetChars = this.options.targetSize * 4;
    const overlapChars = this.options.overlap * 4;
    const step = targetChars - overlapChars;

    for (let i = 0; i < content.length; i += step) {
      const chunkContent = content.slice(i, i + targetChars);
      if (estimateTokens(chunkContent) >= this.options.minSize) {
        chunks.push(this.createChunk(docId, chunks.length, chunkContent, i, {}));
      }
    }

    return chunks;
  }

  /**
   * Get overlap text from end of chunk.
   */
  private getOverlap(text: string): string {
    const targetChars = this.options.overlap * 4;
    if (text.length <= targetChars) {
      return text;
    }

    // Try to break at sentence boundary
    const candidate = text.slice(-targetChars);
    const sentenceMatch = candidate.match(/[.!?]\s+/);
    if (sentenceMatch && sentenceMatch.index !== undefined) {
      return candidate.slice(sentenceMatch.index + sentenceMatch[0].length);
    }

    return candidate;
  }

  /**
   * Create a chunk object.
   */
  private createChunk(
    docId: string,
    index: number,
    content: string,
    startOffset: number,
    metadata: Partial<DocumentChunk["metadata"]>
  ): DocumentChunk {
    return {
      id: `${docId}_chunk_${index}`,
      docId,
      index,
      content,
      tokenCount: estimateTokens(content),
      charCount: content.length,
      startOffset,
      endOffset: startOffset + content.length,
      metadata: {
        sectionTitle: metadata.sectionTitle,
        paragraphIndex: metadata.paragraphIndex,
      },
    };
  }
}

/**
 * Create a semantic chunker with defaults.
 */
export function createChunker(options: ChunkingOptions = {}): SemanticChunker {
  return new SemanticChunker(options);
}
