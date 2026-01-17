/**
 * RAG Query Pipeline
 *
 * Retrieval-Augmented Generation pipeline for knowledge-grounded responses.
 * Combines vector search with LLM generation for accurate, cited answers.
 */

import type { Message } from "@ku0/ai-core";
import { estimateTokens, truncateToTokens } from "@ku0/ai-core";
import { applyDataAccessPolicyToChunks, type DataAccessPolicy } from "@ku0/core";
import type { DocumentChunk } from "../extraction";
import { EmbeddingService } from "../extraction";
import type { AIGateway } from "../gateway";
import type {
  Citation,
  IndexedDocument,
  RAGConfig,
  RAGQueryOptions,
  RAGQueryResult,
  SearchResult,
  VectorStore,
} from "./types";

/** Default RAG configuration */
const DEFAULT_CONFIG: Required<RAGConfig> = {
  defaultTopK: 5,
  defaultMinSimilarity: 0.7,
  maxContextTokens: 4000,
  systemPrompt: `You are a helpful research assistant. Answer questions based on the provided context.
Always cite your sources using [1], [2], etc. If the context doesn't contain enough information to answer, say so.
Be concise but thorough. Focus on accuracy over speculation.`,
  includeCitations: true,
  temperature: 0.3,
};

/**
 * RAG Query Pipeline
 *
 * Orchestrates retrieval and generation for knowledge-grounded responses.
 */
export class RAGPipeline {
  private readonly gateway: AIGateway;
  private readonly vectorStore: VectorStore;
  private readonly embeddingService: EmbeddingService;
  private readonly config: Required<RAGConfig>;
  private readonly chunkStore: Map<string, DocumentChunk> = new Map();
  private readonly docMetadata: Map<string, IndexedDocument> = new Map();

  constructor(gateway: AIGateway, vectorStore: VectorStore, config: RAGConfig = {}) {
    this.gateway = gateway;
    this.vectorStore = vectorStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingService = new EmbeddingService(gateway);
  }

  /**
   * Index document chunks for retrieval.
   */
  async indexDocument(
    chunks: DocumentChunk[],
    metadata: { title?: string; sourceUrl?: string },
    userId: string
  ): Promise<IndexedDocument> {
    if (chunks.length === 0) {
      throw new Error("No chunks to index");
    }

    const docId = chunks[0].docId;

    // Store chunks locally
    for (const chunk of chunks) {
      this.chunkStore.set(chunk.id, chunk);
    }

    // Generate embeddings
    const embeddings = await this.embeddingService.embedChunks(chunks, userId);

    // Store in vector store
    await this.vectorStore.add(embeddings);

    // Update metadata
    const indexedDoc: IndexedDocument = {
      docId,
      title: metadata.title,
      chunkCount: chunks.length,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
      indexedAt: Date.now(),
      sourceUrl: metadata.sourceUrl,
    };
    this.docMetadata.set(docId, indexedDoc);

    return indexedDoc;
  }

  /**
   * Remove document from index.
   */
  async removeDocument(docId: string): Promise<void> {
    // Remove from vector store
    await this.vectorStore.deleteByDocId(docId);

    // Remove chunks
    const toDelete: string[] = [];
    for (const [id, chunk] of this.chunkStore) {
      if (chunk.docId === docId) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this.chunkStore.delete(id);
    }

    // Remove metadata
    this.docMetadata.delete(docId);
  }

  /**
   * Query the knowledge base.
   */
  async query(
    queryText: string,
    userId: string,
    options: RAGQueryOptions = {}
  ): Promise<RAGQueryResult> {
    const startTime = performance.now();
    const topK = options.topK ?? this.config.defaultTopK;
    const minSimilarity = options.minSimilarity ?? this.config.defaultMinSimilarity;

    // 1. Embed the query
    const queryEmbedding = await this.embeddingService.embedText(queryText, userId);

    // 2. Search for similar chunks
    const searchResults = await this.vectorStore.search(queryEmbedding, {
      topK: topK * 2, // Retrieve more for filtering
      filter: options.docIds ? { docIds: options.docIds } : undefined,
    });

    // 3. Filter by similarity threshold and get chunks
    const results: SearchResult[] = [];
    let rank = 1;

    for (const result of searchResults) {
      if (result.similarity < minSimilarity) {
        continue;
      }
      if (results.length >= topK) {
        break;
      }

      const chunk = this.chunkStore.get(result.id);
      if (!chunk) {
        continue;
      }

      results.push({
        chunk,
        similarity: result.similarity,
        rank: rank++,
      });
    }

    // 4. Apply data access policy if provided
    const filteredResults = this.applyDataAccessPolicy(results, options.dataAccessPolicy);

    // 5. Build context from results
    const { context, citations } = this.buildContext(filteredResults, options.maxContextTokens);

    // 6. Generate answer
    const answer = await this.generateAnswer(queryText, context, citations, userId);

    const processingTimeMs = performance.now() - startTime;

    return {
      query: queryText,
      results: filteredResults,
      totalSearched: await this.vectorStore.count(),
      answer,
      citations,
      usage: {
        retrievalTokens: estimateTokens(context),
        generationTokens: estimateTokens(answer),
      },
      processingTimeMs,
    };
  }

  /**
   * Search without generation (retrieval only).
   */
  async search(
    queryText: string,
    userId: string,
    options: RAGQueryOptions = {}
  ): Promise<SearchResult[]> {
    const topK = options.topK ?? this.config.defaultTopK;
    const minSimilarity = options.minSimilarity ?? this.config.defaultMinSimilarity;

    // Embed the query
    const queryEmbedding = await this.embeddingService.embedText(queryText, userId);

    // Search
    const searchResults = await this.vectorStore.search(queryEmbedding, {
      topK,
      filter: options.docIds ? { docIds: options.docIds } : undefined,
    });

    // Filter and hydrate
    const results: SearchResult[] = [];
    let rank = 1;

    for (const result of searchResults) {
      if (result.similarity < minSimilarity) {
        continue;
      }

      const chunk = this.chunkStore.get(result.id);
      if (!chunk) {
        continue;
      }

      results.push({
        chunk,
        similarity: result.similarity,
        rank: rank++,
      });
    }

    return this.applyDataAccessPolicy(results, options.dataAccessPolicy);
  }

  /**
   * Build context string from search results.
   */
  private buildContext(
    results: SearchResult[],
    maxTokens?: number
  ): { context: string; citations: Citation[] } {
    const maxContextTokens = maxTokens ?? this.config.maxContextTokens;
    const citations: Citation[] = [];
    const contextParts: string[] = [];
    let totalTokens = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const docMeta = this.docMetadata.get(result.chunk.docId);

      // Build citation
      const citation: Citation = {
        index: i + 1,
        docId: result.chunk.docId,
        title: docMeta?.title,
        excerpt: result.chunk.content.slice(0, 200),
        location: {
          section: result.chunk.metadata.sectionTitle,
          offset: {
            start: result.chunk.startOffset,
            end: result.chunk.endOffset,
          },
        },
        confidence: result.similarity,
      };
      citations.push(citation);

      // Build context part
      const header = docMeta?.title
        ? `[${i + 1}] From "${docMeta.title}"${result.chunk.metadata.sectionTitle ? ` - ${result.chunk.metadata.sectionTitle}` : ""}:`
        : `[${i + 1}] Source:`;

      let content = result.chunk.content;
      const partTokens = estimateTokens(header) + estimateTokens(content) + 10;

      // Check if adding this would exceed budget
      if (totalTokens + partTokens > maxContextTokens) {
        // Truncate content to fit
        const remainingTokens = maxContextTokens - totalTokens - estimateTokens(header) - 10;
        if (remainingTokens > 50) {
          content = truncateToTokens(content, remainingTokens, { from: "end" });
          contextParts.push(`${header}\n${content}`);
        }
        break;
      }

      contextParts.push(`${header}\n${content}`);
      totalTokens += partTokens;
    }

    return {
      context: contextParts.join("\n\n---\n\n"),
      citations,
    };
  }

  /**
   * Apply data access policy redaction/limits to search results.
   */
  private applyDataAccessPolicy(
    results: SearchResult[],
    policy?: DataAccessPolicy
  ): SearchResult[] {
    if (!policy) {
      return results;
    }
    const chunks = results.map((result) => ({
      block_id: result.chunk.id,
      content: result.chunk.content,
      relevance: result.similarity,
    }));
    const filtered = applyDataAccessPolicyToChunks(chunks, policy);
    const allowedIds = new Set(filtered.map((chunk) => chunk.block_id));
    if (allowedIds.size !== chunks.length) {
      const omitted = chunks
        .filter((chunk) => !allowedIds.has(chunk.block_id))
        .map((c) => c.block_id);
      if (omitted.length > 0) {
        console.info("[RAG][data-access] Omitted chunks from context", {
          omitted,
          total: chunks.length,
          kept: allowedIds.size,
        });
      }
    }
    return results
      .filter((result) => allowedIds.has(result.chunk.id))
      .map((result) => {
        const filteredChunk = filtered.find((chunk) => chunk.block_id === result.chunk.id);
        return filteredChunk
          ? {
              ...result,
              chunk: { ...result.chunk, content: filteredChunk.content },
            }
          : result;
      });
  }

  /**
   * Generate answer using LLM.
   */
  private async generateAnswer(
    query: string,
    context: string,
    _citations: Citation[],
    userId: string
  ): Promise<string> {
    const messages: Message[] = [
      {
        role: "system",
        content: this.config.systemPrompt,
      },
      {
        role: "user",
        content: `Context:\n${context}\n\n---\n\nQuestion: ${query}`,
      },
    ];

    const response = await this.gateway.complete(messages, {
      userId,
      temperature: this.config.temperature,
      maxTokens: 1000,
    });

    return response.content;
  }

  /**
   * Get indexed documents.
   */
  getIndexedDocuments(): IndexedDocument[] {
    return Array.from(this.docMetadata.values());
  }

  /**
   * Get document by ID.
   */
  getDocument(docId: string): IndexedDocument | undefined {
    return this.docMetadata.get(docId);
  }

  /**
   * Get stats.
   */
  async getStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    vectorStoreSize: number;
  }> {
    return {
      totalDocuments: this.docMetadata.size,
      totalChunks: this.chunkStore.size,
      vectorStoreSize: await this.vectorStore.count(),
    };
  }
}

/**
 * Create a RAG pipeline.
 */
export function createRAGPipeline(
  gateway: AIGateway,
  vectorStore: VectorStore,
  config: RAGConfig = {}
): RAGPipeline {
  return new RAGPipeline(gateway, vectorStore, config);
}
