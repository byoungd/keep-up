/**
 * Middleware Chain
 *
 * Manages the execution of response middlewares in priority order.
 * Processes LLM responses through a chain of transformations.
 *
 * Track B: Intelligence & Grounding
 */

import type { CompletionResponse } from "../providers/types";
import type {
  GroundingSummary,
  MiddlewareChainConfig,
  MiddlewareContext,
  MiddlewareLogger,
  MiddlewareResponse,
  ProcessedResponse,
  ResponseMiddleware,
} from "./types";

// ============================================================================
// Middleware Chain Implementation
// ============================================================================

/**
 * Middleware Chain - Processes LLM responses through registered middlewares.
 *
 * Middlewares are executed in priority order (lower priority = earlier execution).
 * Each middleware can modify the response, add citations, or flag issues.
 */
export class MiddlewareChain {
  private middlewares: ResponseMiddleware[] = [];
  private readonly config: Required<MiddlewareChainConfig>;
  private readonly logger: MiddlewareLogger;

  constructor(config: MiddlewareChainConfig = {}) {
    this.config = {
      middlewares: config.middlewares ?? [],
      failOnError: config.failOnError ?? false,
      defaultConfidence: config.defaultConfidence ?? 0.5,
      minGroundingRatio: config.minGroundingRatio ?? 0,
      logger: config.logger ?? createNoopLogger(),
    };
    this.logger = this.config.logger;

    // Register initial middlewares
    for (const middleware of this.config.middlewares) {
      this.register(middleware);
    }
  }

  /**
   * Register a middleware.
   * Middlewares are automatically sorted by priority.
   */
  register(middleware: ResponseMiddleware): void {
    this.middlewares.push(middleware);
    this.middlewares.sort((a, b) => a.priority - b.priority);
    this.logger.debug("Middleware registered", {
      name: middleware.name,
      priority: middleware.priority,
      totalMiddlewares: this.middlewares.length,
    });
  }

  /**
   * Unregister a middleware by name.
   */
  unregister(name: string): boolean {
    const index = this.middlewares.findIndex((m) => m.name === name);
    if (index >= 0) {
      this.middlewares.splice(index, 1);
      this.logger.debug("Middleware unregistered", { name });
      return true;
    }
    return false;
  }

  /**
   * Get all registered middlewares.
   */
  getMiddlewares(): ResponseMiddleware[] {
    return [...this.middlewares];
  }

  /**
   * Process a completion response through the middleware chain.
   */
  async process(
    response: CompletionResponse,
    context: MiddlewareContext
  ): Promise<ProcessedResponse> {
    // Convert to middleware response format
    let middlewareResponse = this.toMiddlewareResponse(response);

    this.logger.debug("Starting middleware chain", {
      middlewareCount: this.middlewares.length,
      contentLength: middlewareResponse.content.length,
    });

    // Execute each middleware in priority order
    for (const middleware of this.middlewares) {
      // Skip disabled middlewares
      if (middleware.enabled === false) {
        continue;
      }

      try {
        const startTime = Date.now();
        middlewareResponse = await middleware.process(middlewareResponse, context);
        const duration = Date.now() - startTime;

        this.logger.debug("Middleware executed", {
          name: middleware.name,
          durationMs: duration,
          citationCount: middlewareResponse.citations.length,
          flagCount: middlewareResponse.flags.length,
        });
      } catch (error) {
        this.logger.error("Middleware error", {
          name: middleware.name,
          error: error instanceof Error ? error.message : String(error),
        });

        if (this.config.failOnError) {
          throw error;
        }
        // Continue with next middleware on error
      }
    }

    // Build final processed response
    return this.toProcessedResponse(middlewareResponse);
  }

  /**
   * Convert provider response to middleware format.
   */
  private toMiddlewareResponse(response: CompletionResponse): MiddlewareResponse {
    return {
      content: response.content,
      citations: [],
      confidence: this.config.defaultConfidence,
      flags: [],
      metadata: {
        model: response.model,
        provider: "unknown", // Will be set by caller if needed
        usage: response.usage,
        latencyMs: response.latencyMs ?? 0,
        finishReason: response.finishReason ?? "stop",
      },
    };
  }

  /**
   * Convert middleware response to final processed format.
   */
  private toProcessedResponse(response: MiddlewareResponse): ProcessedResponse {
    const grounding = this.calculateGrounding(response);

    return {
      content: response.content,
      citations: response.citations,
      confidence: response.confidence,
      flags: response.flags,
      grounding,
      metadata: response.metadata,
    };
  }

  /**
   * Calculate grounding summary from response.
   */
  private calculateGrounding(response: MiddlewareResponse): GroundingSummary {
    const sentences = this.splitIntoSentences(response.content);
    const totalSentences = sentences.length;

    // Count sentences that have citations
    const citedSentences = this.countCitedSentences(response.content, response.citations);
    const validatedCount = response.citations.filter((c) => c.validated).length;

    const groundingRatio = totalSentences > 0 ? citedSentences / totalSentences : 0;
    const meetsRequirements = groundingRatio >= this.config.minGroundingRatio;

    // Collect issues
    const issues: string[] = [];
    const errorFlags = response.flags.filter((f) => f.severity === "error");
    const warningFlags = response.flags.filter((f) => f.severity === "warning");

    if (errorFlags.length > 0) {
      issues.push(`${errorFlags.length} critical issue(s) found`);
    }
    if (warningFlags.length > 0) {
      issues.push(`${warningFlags.length} warning(s) found`);
    }
    if (!meetsRequirements) {
      issues.push(
        `Grounding ratio ${(groundingRatio * 100).toFixed(1)}% below minimum ${(this.config.minGroundingRatio * 100).toFixed(1)}%`
      );
    }

    return {
      citationCount: response.citations.length,
      validatedCount,
      citedSentences,
      totalSentences,
      groundingRatio,
      meetsRequirements,
      issues,
    };
  }

  /**
   * Split content into sentences.
   */
  private splitIntoSentences(content: string): string[] {
    // Simple sentence splitting - handles common cases
    return content
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Count sentences that contain citations.
   */
  private countCitedSentences(content: string, citations: Array<{ sourceId: string }>): number {
    if (citations.length === 0) {
      return 0;
    }

    const sentences = this.splitIntoSentences(content);
    let citedCount = 0;

    // Create a set of citation patterns to look for
    const citationPatterns = new Set(citations.map((c) => `[${c.sourceId}]`));

    for (const sentence of sentences) {
      // Check if sentence contains any citation
      for (const pattern of citationPatterns) {
        if (sentence.includes(pattern)) {
          citedCount++;
          break;
        }
      }
    }

    return citedCount;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a no-op logger.
 */
function createNoopLogger(): MiddlewareLogger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

/**
 * Create a middleware chain with default configuration.
 */
export function createMiddlewareChain(config?: MiddlewareChainConfig): MiddlewareChain {
  return new MiddlewareChain(config);
}

/**
 * Create a middleware from a simple transform function.
 */
export function createSimpleMiddleware(
  name: string,
  priority: number,
  transform: (
    response: MiddlewareResponse,
    context: MiddlewareContext
  ) => MiddlewareResponse | Promise<MiddlewareResponse>
): ResponseMiddleware {
  return {
    name,
    priority,
    process: async (response, context) => transform(response, context),
  };
}
