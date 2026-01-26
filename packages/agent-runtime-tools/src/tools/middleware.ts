/**
 * Tool Middleware System
 *
 * Composable middleware for tool execution pipeline.
 * Enables logging, caching, rate limiting, metrics, and custom transformations.
 */

import type { MCPToolCall, MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { createSubsystemLogger } from "@ku0/agent-runtime-telemetry/logging";

// ============================================================================
// Types
// ============================================================================

/**
 * Middleware context passed through the chain.
 */
export interface MiddlewareContext extends ToolContext {
  /** Tool call being processed */
  call: MCPToolCall;
  /** Timing information */
  timing: {
    startTime: number;
    endTime?: number;
  };
  /** Metadata storage for middleware communication */
  metadata: Map<string, unknown>;
  /** Whether to skip remaining middleware */
  skip?: boolean;
  /** Override result (bypasses actual execution) */
  overrideResult?: MCPToolResult;
}

/**
 * Next function to call the next middleware.
 */
export type MiddlewareNext = (ctx: MiddlewareContext) => Promise<MCPToolResult>;

/**
 * Middleware function signature.
 */
export type ToolMiddleware = (
  ctx: MiddlewareContext,
  next: MiddlewareNext
) => Promise<MCPToolResult>;

/**
 * Middleware configuration.
 */
export interface MiddlewareConfig {
  /** Name for debugging */
  name: string;
  /** Priority (lower = earlier, default 100) */
  priority?: number;
  /** Whether this middleware is enabled */
  enabled?: boolean;
}

// ============================================================================
// Built-in Middleware
// ============================================================================

/**
 * Logging middleware - logs tool calls and results.
 */
export function loggingMiddleware(
  options: {
    logInput?: boolean;
    logOutput?: boolean;
    logger?: (message: string, data?: unknown) => void;
  } = {}
): ToolMiddleware {
  const structuredLogger = createSubsystemLogger("agent", "tools:middleware");
  const log = options.logger ?? ((msg: string, data?: unknown) => structuredLogger.info(msg, data));
  const logInput = options.logInput ?? true;
  const logOutput = options.logOutput ?? true;

  return async (ctx, next) => {
    const { call } = ctx;

    if (logInput) {
      log(`[Tool] ${call.name} called`, { toolName: call.name, arguments: call.arguments });
    }

    const result = await next(ctx);

    if (logOutput) {
      log(`[Tool] ${call.name} completed`, {
        toolName: call.name,
        success: result.success,
        duration: ctx.timing.endTime ? ctx.timing.endTime - ctx.timing.startTime : undefined,
      });
    }

    return result;
  };
}

/**
 * Timing middleware - adds duration tracking.
 */
export function timingMiddleware(): ToolMiddleware {
  return async (ctx, next) => {
    ctx.timing.startTime = performance.now();
    const result = await next(ctx);
    ctx.timing.endTime = performance.now();
    return result;
  };
}

/**
 * Caching middleware - caches results based on call signature.
 */
export function cachingMiddleware(options: {
  cache: Map<string, { result: MCPToolResult; expiry: number }>;
  ttlMs?: number;
  keyFn?: (call: MCPToolCall) => string;
}): ToolMiddleware {
  const ttl = options.ttlMs ?? 300000; // 5 minutes default
  const keyFn = options.keyFn ?? ((call) => `${call.name}:${JSON.stringify(call.arguments)}`);

  return async (ctx, next) => {
    const key = keyFn(ctx.call);
    const cached = options.cache.get(key);

    if (cached && cached.expiry > Date.now()) {
      ctx.metadata.set("cache", "hit");
      return cached.result;
    }

    ctx.metadata.set("cache", "miss");
    const result = await next(ctx);

    if (result.success) {
      options.cache.set(key, { result, expiry: Date.now() + ttl });
    }

    return result;
  };
}

/**
 * Retry middleware - retries failed calls.
 */
export function retryMiddleware(options: {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: "linear" | "exponential";
  shouldRetry?: (error: unknown) => boolean;
}): ToolMiddleware {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelay = options.delayMs ?? 1000;
  const backoff = options.backoff ?? "exponential";
  const shouldRetry = options.shouldRetry ?? (() => true);

  const calculateDelay = (attempt: number): number =>
    backoff === "exponential" ? baseDelay * 2 ** (attempt - 1) : baseDelay * attempt;

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  return async (ctx, next) => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await next(ctx).catch((error: unknown) => {
        if (!shouldRetry(error) || attempt === maxAttempts) {
          throw error;
        }
        lastError = error;
        return null;
      });

      if (result?.success) {
        return result;
      }

      if (result) {
        lastError = result.error;
      }

      if (attempt < maxAttempts) {
        await sleep(calculateDelay(attempt));
      }
    }

    return {
      success: false,
      content: [],
      error: {
        code: "EXECUTION_FAILED" as const,
        message: `Failed after ${maxAttempts} attempts: ${lastError}`,
      },
    };
  };
}

/**
 * Timeout middleware - aborts if execution takes too long.
 */
export function timeoutMiddleware(timeoutMs: number): ToolMiddleware {
  return async (ctx, next) => {
    const timeoutPromise = new Promise<MCPToolResult>((_, reject) => {
      setTimeout(() => reject(new Error("Tool execution timeout")), timeoutMs);
    });

    return Promise.race([next(ctx), timeoutPromise]);
  };
}

/**
 * Metrics middleware - records execution metrics.
 */
export function metricsMiddleware(options: {
  onCall?: (name: string, args: Record<string, unknown>) => void;
  onResult?: (name: string, success: boolean, durationMs: number) => void;
  onError?: (name: string, error: unknown) => void;
}): ToolMiddleware {
  return async (ctx, next) => {
    const start = performance.now();
    options.onCall?.(ctx.call.name, ctx.call.arguments);

    try {
      const result = await next(ctx);
      const duration = performance.now() - start;
      options.onResult?.(ctx.call.name, result.success, duration);
      return result;
    } catch (error) {
      options.onError?.(ctx.call.name, error);
      throw error;
    }
  };
}

/**
 * Validation middleware - validates tool arguments.
 */
export function validationMiddleware(options: {
  validators: Map<string, (args: Record<string, unknown>) => string | null>;
}): ToolMiddleware {
  return async (ctx, next) => {
    const validator = options.validators.get(ctx.call.name);
    if (validator) {
      const error = validator(ctx.call.arguments);
      if (error) {
        return {
          success: false,
          content: [],
          error: { code: "INVALID_ARGUMENTS", message: error },
        };
      }
    }
    return next(ctx);
  };
}

// ============================================================================
// Middleware Chain
// ============================================================================

/**
 * Chain middleware functions together.
 */
export class MiddlewareChain {
  private middlewares: Array<{
    middleware: ToolMiddleware;
    config: MiddlewareConfig;
  }> = [];

  /**
   * Add middleware to the chain.
   */
  use(middleware: ToolMiddleware, config?: Partial<MiddlewareConfig>): this {
    this.middlewares.push({
      middleware,
      config: {
        name: config?.name ?? `middleware_${this.middlewares.length}`,
        priority: config?.priority ?? 100,
        enabled: config?.enabled ?? true,
      },
    });
    return this;
  }

  /**
   * Execute the middleware chain.
   */
  async execute(
    call: MCPToolCall,
    context: ToolContext,
    handler: (call: MCPToolCall, ctx: ToolContext) => Promise<MCPToolResult>
  ): Promise<MCPToolResult> {
    // Filter and sort middleware
    const active = this.middlewares
      .filter((m) => m.config.enabled)
      .sort((a, b) => (a.config.priority ?? 100) - (b.config.priority ?? 100));

    // Build context
    const ctx: MiddlewareContext = {
      ...context,
      call,
      timing: { startTime: Date.now() },
      metadata: new Map(),
    };

    // Build chain
    let index = 0;
    const executeNext: MiddlewareNext = async (middlewareCtx) => {
      // Check for override
      if (middlewareCtx.overrideResult) {
        return middlewareCtx.overrideResult;
      }

      // Check for skip
      if (middlewareCtx.skip) {
        return handler(middlewareCtx.call, middlewareCtx);
      }

      // Execute next middleware or handler
      if (index < active.length) {
        const current = active[index++];
        return current.middleware(middlewareCtx, executeNext);
      }

      // Final handler
      return handler(middlewareCtx.call, middlewareCtx);
    };

    return executeNext(ctx);
  }

  /**
   * Get middleware names in execution order.
   */
  getOrder(): string[] {
    return this.middlewares
      .filter((m) => m.config.enabled)
      .sort((a, b) => (a.config.priority ?? 100) - (b.config.priority ?? 100))
      .map((m) => m.config.name);
  }

  /**
   * Clear all middleware.
   */
  clear(): void {
    this.middlewares = [];
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a middleware chain.
 */
export function createMiddlewareChain(): MiddlewareChain {
  return new MiddlewareChain();
}

/**
 * Create a context for middleware execution.
 */
export function createMiddlewareContext(
  call: MCPToolCall,
  context: ToolContext
): MiddlewareContext {
  return {
    ...context,
    call,
    timing: { startTime: Date.now() },
    metadata: new Map(),
  };
}

/**
 * Create a standard middleware stack with common middleware.
 */
export function createStandardMiddleware(options: {
  enableLogging?: boolean;
  enableTiming?: boolean;
  enableCache?: boolean;
  enableRetry?: boolean;
  timeoutMs?: number;
  cacheOptions?: { ttlMs: number };
  retryOptions?: { maxAttempts: number };
}): MiddlewareChain {
  const chain = createMiddlewareChain();

  if (options.enableTiming !== false) {
    chain.use(timingMiddleware(), { name: "timing", priority: 10 });
  }

  if (options.enableLogging) {
    chain.use(loggingMiddleware(), { name: "logging", priority: 20 });
  }

  if (options.timeoutMs) {
    chain.use(timeoutMiddleware(options.timeoutMs), {
      name: "timeout",
      priority: 30,
    });
  }

  if (options.enableRetry) {
    chain.use(
      retryMiddleware({
        maxAttempts: options.retryOptions?.maxAttempts ?? 3,
      }),
      { name: "retry", priority: 40 }
    );
  }

  if (options.enableCache) {
    chain.use(
      cachingMiddleware({
        cache: new Map(),
        ttlMs: options.cacheOptions?.ttlMs ?? 300000,
      }),
      { name: "cache", priority: 50 }
    );
  }

  return chain;
}
