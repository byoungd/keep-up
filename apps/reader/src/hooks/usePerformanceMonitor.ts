import { useEffect, useRef } from "react";

/**
 * PERF-007: Enhanced Performance Monitor
 *
 * Provides comprehensive performance tracking including:
 * - Render counting and timing
 * - FPS monitoring
 * - Long task detection
 * - Memory usage tracking (when available)
 * - Critical path timing with User Timing API
 */

export interface PerformanceMetrics {
  renderCount: number;
  avgRenderTime: number;
  fps: number;
  longTasks: number;
  memoryUsage?: number;
}

// Global performance state (shared across instances)
const globalMetrics = {
  longTaskCount: 0,
  frameCount: 0,
  lastFpsTime: 0,
  currentFps: 60,
  observerInitialized: false,
};

// Initialize Long Task observer (once globally)
function initLongTaskObserver(): void {
  if (globalMetrics.observerInitialized || typeof PerformanceObserver === "undefined") {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          globalMetrics.longTaskCount++;
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[Perf] Long task detected: ${entry.duration.toFixed(1)}ms`,
              entry.name || "unknown"
            );
          }
        }
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
    globalMetrics.observerInitialized = true;
  } catch {
    // Long task observer not supported
  }
}

// FPS tracking
function updateFps(): void {
  const now = performance.now();
  globalMetrics.frameCount++;

  if (now - globalMetrics.lastFpsTime >= 1000) {
    globalMetrics.currentFps = globalMetrics.frameCount;
    globalMetrics.frameCount = 0;
    globalMetrics.lastFpsTime = now;
  }
}

export function usePerformanceMonitor(componentName: string, enabled = false) {
  const renderCount = useRef(0);
  const lastRender = useRef(performance.now());
  const renderTimes = useRef<number[]>([]);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initialize observers on first use
    initLongTaskObserver();

    // Start FPS tracking
    const trackFps = () => {
      updateFps();
      rafId.current = requestAnimationFrame(trackFps);
    };
    rafId.current = requestAnimationFrame(trackFps);

    return () => {
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    renderCount.current++;
    const now = performance.now();
    const timeSinceLast = now - lastRender.current;
    lastRender.current = now;

    // Track render times (keep last 100)
    renderTimes.current.push(timeSinceLast);
    if (renderTimes.current.length > 100) {
      renderTimes.current.shift();
    }

    // Report every 50 renders
    if (renderCount.current % 50 === 0) {
      const avgTime = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;

      console.info(
        `[Perf:${componentName}] Render #${renderCount.current} | ` +
          `Avg: ${avgTime.toFixed(1)}ms | ` +
          `FPS: ${globalMetrics.currentFps} | ` +
          `Long tasks: ${globalMetrics.longTaskCount}`
      );
    }
  });

  return {
    /**
     * Measure an interaction with timing.
     */
    measureInteraction: (label: string, fn: () => void) => {
      if (!enabled) {
        return fn();
      }

      const markStart = `${componentName}:${label}:start`;
      const markEnd = `${componentName}:${label}:end`;

      performance.mark(markStart);
      fn();
      performance.mark(markEnd);

      try {
        const measure = performance.measure(label, markStart, markEnd);
        if (measure.duration > 16) {
          console.warn(
            `[Perf:${componentName}] Slow interaction '${label}': ${measure.duration.toFixed(1)}ms`
          );
        }
        // Cleanup
        performance.clearMarks(markStart);
        performance.clearMarks(markEnd);
        performance.clearMeasures(label);
      } catch {
        // Fallback for browsers without full User Timing support
      }
    },

    /**
     * Get current metrics snapshot.
     */
    getMetrics: (): PerformanceMetrics => {
      const avgTime =
        renderTimes.current.length > 0
          ? renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length
          : 0;

      // Get memory if available
      let memoryUsage: number | undefined;
      if (typeof performance !== "undefined" && "memory" in performance) {
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        if (mem) {
          memoryUsage = mem.usedJSHeapSize / 1024 / 1024; // MB
        }
      }

      return {
        renderCount: renderCount.current,
        avgRenderTime: avgTime,
        fps: globalMetrics.currentFps,
        longTasks: globalMetrics.longTaskCount,
        memoryUsage,
      };
    },

    /**
     * Create a timing scope for async operations.
     */
    startTiming: (label: string) => {
      if (!enabled) {
        return {
          end: () => {
            /* noop when disabled */
          },
        };
      }

      const start = performance.now();
      const markName = `${componentName}:${label}`;
      performance.mark(markName);

      return {
        end: () => {
          const duration = performance.now() - start;
          if (duration > 16 && process.env.NODE_ENV !== "production") {
            console.warn(
              `[Perf:${componentName}] Slow operation '${label}': ${duration.toFixed(1)}ms`
            );
          }
          performance.clearMarks(markName);
        },
      };
    },
  };
}

/**
 * Get global performance stats.
 */
export function getGlobalPerformanceStats() {
  return {
    fps: globalMetrics.currentFps,
    longTasks: globalMetrics.longTaskCount,
  };
}

/**
 * Reset global counters (for testing).
 */
export function resetGlobalPerformanceStats(): void {
  globalMetrics.longTaskCount = 0;
  globalMetrics.frameCount = 0;
}
