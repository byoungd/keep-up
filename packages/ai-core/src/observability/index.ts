/**
 * Observability Module
 *
 * Comprehensive observability infrastructure for AI operations.
 * Provides unified logging, metrics, tracing, and profiling.
 *
 * Features:
 * - Unified telemetry context
 * - OpenTelemetry-compatible tracing
 * - Performance profiling
 * - Structured logging with correlation
 * - Metrics aggregation and export
 */

// Re-export core observability from resilience module
export {
  // Logger
  ConsoleLogger,
  type Logger,
  type LogLevel,
  type LogEntry,
  // Metrics
  InMemoryMetrics,
  type MetricsCollector,
  type MetricType,
  type MetricEntry,
  // Tracer
  SimpleTracer,
  type Tracer,
  type Span,
  // Context
  ObservabilityContext,
  createObservability,
  getObservability,
  setObservability,
} from "../resilience/observability";

// Export new enhanced components
export {
  TelemetryContext,
  createTelemetryContext,
  type TelemetryContextConfig,
  type TelemetryExporter,
  type LogExportEntry,
  type MetricExportEntry,
  type SpanExportEntry,
  type ResourceAttributes,
  type ScopedContext,
} from "./telemetryContext";

export {
  OpenTelemetryTracer,
  createOpenTelemetryTracer,
  createConsoleTraceExporter,
  createAlwaysSampler,
  createNeverSampler,
  createProbabilitySampler,
  createRateLimitingSampler,
  type OpenTelemetryConfig,
  type SpanContext,
  type TraceExporter,
  type ExportResult,
  type Sampler,
  type SamplingResult,
  type SpanKind,
  type SpanStatus,
  type SpanLink,
  type OTelSpan,
} from "./openTelemetryTracer";

export {
  PerformanceProfiler,
  createPerformanceProfiler,
  type ProfilerConfig,
  type ProfileEntry,
  type ProfileReport,
  type ProfilerMetrics,
  type FunctionStats,
  type HotPath,
  type MemoryStats,
  type MemorySnapshot,
  type ProfileSummary,
} from "./performanceProfiler";
