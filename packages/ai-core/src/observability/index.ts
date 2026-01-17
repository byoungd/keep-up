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
  createObservability,
  getObservability,
  // Metrics
  InMemoryMetrics,
  type LogEntry,
  type Logger,
  type LogLevel,
  type MetricEntry,
  type MetricsCollector,
  type MetricType,
  // Context
  ObservabilityContext,
  // Tracer
  SimpleTracer,
  type Span,
  setObservability,
  type Tracer,
} from "../resilience/observability";
export {
  createAlwaysSampler,
  createConsoleTraceExporter,
  createNeverSampler,
  createOpenTelemetryTracer,
  createProbabilitySampler,
  createRateLimitingSampler,
  type ExportResult,
  type OpenTelemetryConfig,
  OpenTelemetryTracer,
  type OTelSpan,
  type Sampler,
  type SamplingResult,
  type SpanContext,
  type SpanKind,
  type SpanLink,
  type SpanStatus,
  type TraceExporter,
} from "./openTelemetryTracer";
export {
  createPerformanceProfiler,
  type FunctionStats,
  type HotPath,
  type MemorySnapshot,
  type MemoryStats,
  PerformanceProfiler,
  type ProfileEntry,
  type ProfileReport,
  type ProfilerConfig,
  type ProfilerMetrics,
  type ProfileSummary,
} from "./performanceProfiler";
// Export new enhanced components
export {
  createTelemetryContext,
  type LogExportEntry,
  type MetricExportEntry,
  type ResourceAttributes,
  type ScopedContext,
  type SpanExportEntry,
  TelemetryContext,
  type TelemetryContextConfig,
  type TelemetryExporter,
} from "./telemetryContext";
