/**
 * Metrics API Routes
 *
 * Provides HTTP endpoints for exposing server metrics.
 * Supports Prometheus format output.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { MetricsCollector } from "../metrics/metricsCollector";

/**
 * Metrics routes handler.
 */
export class MetricsRoutes {
  constructor(private metricsCollector: MetricsCollector) {}

  /**
   * Handle GET /metrics request.
   * Returns metrics in Prometheus text format.
   */
  handleMetrics(
    _req: IncomingMessage,
    res: ServerResponse,
    setCorsHeaders: (res: ServerResponse) => void
  ): void {
    setCorsHeaders(res);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(this.metricsCollector.toPrometheus());
  }

  /**
   * Handle GET /metrics/json request.
   * Returns metrics in JSON format.
   */
  handleMetricsJson(
    _req: IncomingMessage,
    res: ServerResponse,
    sendJson: (res: ServerResponse, status: number, payload: unknown) => void
  ): void {
    const metrics = this.metricsCollector.getMetrics();
    sendJson(res, 200, {
      ok: true,
      metrics: {
        joinCount: metrics.joinCount,
        leaveCount: metrics.leaveCount,
        permissionDeniedCount: metrics.permissionDeniedCount,
        activeConnectionsByDoc: metrics.activeConnectionsByDoc,
        updateCountByDoc: metrics.updateCountByDoc,
        reconnectCountByClient: metrics.reconnectCountByClient,
        errorCountByType: metrics.errorCountByType,
      },
    });
  }
}
