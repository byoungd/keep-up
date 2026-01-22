/**
 * Parallel Execution Utilities
 *
 * Provides utilities for parallel tool execution with concurrency control.
 */

import type { IToolRegistry } from "@ku0/agent-runtime-tools";
import type { MCPToolCall, MCPToolResult, ToolContext } from "../types";

// ============================================================================
// Parallel Execution Types
// ============================================================================

export interface ParallelExecutionOptions {
  /** Maximum concurrent executions */
  maxConcurrency?: number;

  /** Whether to fail fast on first error */
  failFast?: boolean;

  /** Timeout per tool call in milliseconds */
  timeoutMs?: number;

  /** Callback for progress updates */
  onProgress?: (completed: number, total: number) => void;

  /**
   * Abort signal for cancellation.
   * When aborted, pending operations will be skipped.
   */
  signal?: AbortSignal;
}

export interface ParallelExecutionResult {
  /** All results in order */
  results: MCPToolResult[];

  /** Number of successful calls */
  successCount: number;

  /** Number of failed calls */
  failureCount: number;

  /** Total execution time in milliseconds */
  totalTimeMs: number;

  /** Whether all calls succeeded */
  allSucceeded: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function createAbortedResult(message: string): MCPToolResult {
  return {
    success: false,
    content: [{ type: "text", text: message }],
    error: { code: "EXECUTION_FAILED", message },
  };
}

function createAllAbortedResults(calls: MCPToolCall[]): ParallelExecutionResult {
  return {
    results: calls.map(() => createAbortedResult("Aborted before execution")),
    successCount: 0,
    failureCount: calls.length,
    totalTimeMs: 0,
    allSucceeded: false,
  };
}

// ============================================================================
// Parallel Executor
// ============================================================================

/**
 * Execute multiple tool calls in parallel with concurrency control.
 *
 * @example
 * ```typescript
 * const results = await executeParallel(
 *   registry,
 *   context,
 *   [
 *     { name: 'file:read', arguments: { path: '/a.ts' } },
 *     { name: 'file:read', arguments: { path: '/b.ts' } },
 *     { name: 'file:read', arguments: { path: '/c.ts' } },
 *   ],
 *   { maxConcurrency: 3 }
 * );
 * ```
 */
export async function executeParallel(
  registry: IToolRegistry,
  context: ToolContext,
  calls: MCPToolCall[],
  options: ParallelExecutionOptions = {}
): Promise<ParallelExecutionResult> {
  const { maxConcurrency = 5, failFast = false, timeoutMs, onProgress, signal } = options;

  const startTime = Date.now();
  const results: MCPToolResult[] = new Array(calls.length);
  let completedCount = 0;
  let failedDueToFailFast = false;

  // Check if already aborted
  if (signal?.aborted) {
    return createAllAbortedResults(calls);
  }

  // Create a semaphore for concurrency control
  const semaphore = createSemaphore(maxConcurrency);

  // Execute all calls
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates concurrency limits and error handling
  const promises = calls.map(async (call, index) => {
    // Wait for semaphore slot
    await semaphore.acquire();

    // Check if aborted or should skip due to fail-fast
    if (signal?.aborted || failedDueToFailFast) {
      const reason = signal?.aborted ? "Aborted" : "Skipped due to previous failure";
      results[index] = createAbortedResult(reason);
      semaphore.release();
      return;
    }

    try {
      // Execute with optional timeout
      const result = timeoutMs
        ? await withTimeout(registry.callTool(call, context), timeoutMs)
        : await registry.callTool(call, context);

      results[index] = result;

      // Check for fail-fast
      if (failFast && !result.success) {
        failedDueToFailFast = true;
      }
    } catch (error) {
      results[index] = {
        success: false,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        error: {
          code: "EXECUTION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };

      if (failFast) {
        failedDueToFailFast = true;
      }
    } finally {
      completedCount++;
      onProgress?.(completedCount, calls.length);
      semaphore.release();
    }
  });

  await Promise.all(promises);

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return {
    results,
    successCount,
    failureCount,
    totalTimeMs: Date.now() - startTime,
    allSucceeded: failureCount === 0,
  };
}

// ============================================================================
// Dependency-Aware Parallel Execution
// ============================================================================

export interface ToolCallWithDeps extends MCPToolCall {
  /** IDs of calls this one depends on */
  dependsOn?: string[];
  /** Unique ID for this call */
  id: string;
}

/**
 * Execute tool calls respecting dependencies.
 * Independent calls run in parallel; dependent calls wait for their dependencies.
 */
export async function executeWithDependencies(
  registry: IToolRegistry,
  context: ToolContext,
  calls: ToolCallWithDeps[],
  options: ParallelExecutionOptions = {}
): Promise<Map<string, MCPToolResult>> {
  const { maxConcurrency = 5, timeoutMs } = options;

  const results = new Map<string, MCPToolResult>();
  const pending = new Map<string, ToolCallWithDeps>();
  const semaphore = createSemaphore(maxConcurrency);

  // Initialize pending set
  for (const call of calls) {
    pending.set(call.id, call);
  }

  // Process until all done
  while (pending.size > 0) {
    // Find calls with no pending dependencies
    const ready: ToolCallWithDeps[] = [];
    for (const [_id, call] of pending) {
      const deps = call.dependsOn ?? [];
      const allDepsResolved = deps.every((depId) => results.has(depId));
      if (allDepsResolved) {
        ready.push(call);
      }
    }

    if (ready.length === 0 && pending.size > 0) {
      // Circular dependency or missing dependency
      throw new Error("Circular or unresolvable dependencies detected");
    }

    // Execute ready calls in parallel
    const promises = ready.map(async (call) => {
      await semaphore.acquire();
      pending.delete(call.id);

      try {
        const result = timeoutMs
          ? await withTimeout(registry.callTool(call, context), timeoutMs)
          : await registry.callTool(call, context);

        results.set(call.id, result);
      } catch (error) {
        results.set(call.id, {
          success: false,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          error: {
            code: "EXECUTION_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);
  }

  return results;
}

// ============================================================================
// Batch Execution
// ============================================================================

/**
 * Execute tool calls in batches.
 */
export async function executeBatch(
  registry: IToolRegistry,
  context: ToolContext,
  calls: MCPToolCall[],
  batchSize: number
): Promise<MCPToolResult[]> {
  const results: MCPToolResult[] = [];

  for (let i = 0; i < calls.length; i += batchSize) {
    const batch = calls.slice(i, i + batchSize);
    const batchResults = await executeParallel(registry, context, batch, {
      maxConcurrency: batchSize,
    });
    results.push(...batchResults.results);
  }

  return results;
}

// ============================================================================
// Helpers
// ============================================================================

interface Semaphore {
  acquire(): Promise<void>;
  release(): void;
}

function createSemaphore(maxConcurrency: number): Semaphore {
  let current = 0;
  const queue: Array<() => void> = [];

  return {
    acquire: () => {
      return new Promise<void>((resolve) => {
        if (current < maxConcurrency) {
          current++;
          resolve();
        } else {
          queue.push(resolve);
        }
      });
    },
    release: () => {
      current--;
      const next = queue.shift();
      if (next) {
        current++;
        next();
      }
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export { createSemaphore, withTimeout };
