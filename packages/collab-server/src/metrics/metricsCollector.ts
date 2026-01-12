/** Collected metrics snapshot */
export type CollabMetrics = {
  /** Active connections per document */
  activeConnectionsByDoc: Record<string, number>;
  /** Total JOIN events */
  joinCount: number;
  /** Total LEAVE events */
  leaveCount: number;
  /** Update count per document */
  updateCountByDoc: Record<string, number>;
  /** Reconnect count per client */
  reconnectCountByClient: Record<string, number>;
  /** Total permission denied errors */
  permissionDeniedCount: number;
  /** Error count by type */
  errorCountByType: Record<string, number>;
};

/**
 * Metrics collector for collaboration sessions.
 *
 * Tracks:
 * - Active connections per document
 * - JOIN/LEAVE counts
 * - Update message rate per document
 * - Reconnect count per client
 * - Permission denied count
 * - Error rate by type
 */
export class MetricsCollector {
  /** Active connections per document */
  private activeConnections = new Map<string, number>();
  /** Total JOIN events */
  private joinCount = 0;
  /** Total LEAVE events */
  private leaveCount = 0;
  /** Update count per document */
  private updateCount = new Map<string, number>();
  /** Reconnect count per client */
  private reconnectCount = new Map<string, number>();
  /** Total permission denied errors */
  private permissionDeniedCount = 0;
  /** Error count by type */
  private errorCounts = new Map<string, number>();

  /**
   * Record a JOIN event.
   */
  recordJoin(docId: string): void {
    this.joinCount++;
    const current = this.activeConnections.get(docId) ?? 0;
    this.activeConnections.set(docId, current + 1);
  }

  /**
   * Record a LEAVE event.
   */
  recordLeave(docId: string): void {
    this.leaveCount++;
    const current = this.activeConnections.get(docId) ?? 0;
    this.activeConnections.set(docId, Math.max(0, current - 1));

    // Clean up if no connections
    if (this.activeConnections.get(docId) === 0) {
      this.activeConnections.delete(docId);
    }
  }

  /**
   * Record an UPDATE event.
   */
  recordUpdate(docId: string): void {
    const current = this.updateCount.get(docId) ?? 0;
    this.updateCount.set(docId, current + 1);
  }

  /**
   * Record a reconnect event.
   */
  recordReconnect(clientId: string): void {
    const current = this.reconnectCount.get(clientId) ?? 0;
    this.reconnectCount.set(clientId, current + 1);
  }

  /**
   * Record a permission denied error.
   */
  recordPermissionDenied(): void {
    this.permissionDeniedCount++;
    this.recordError("PERMISSION_DENIED");
  }

  /**
   * Record an error by type.
   */
  recordError(errorType: string): void {
    const current = this.errorCounts.get(errorType) ?? 0;
    this.errorCounts.set(errorType, current + 1);
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): CollabMetrics {
    return {
      activeConnectionsByDoc: Object.fromEntries(this.activeConnections),
      joinCount: this.joinCount,
      leaveCount: this.leaveCount,
      updateCountByDoc: Object.fromEntries(this.updateCount),
      reconnectCountByClient: Object.fromEntries(this.reconnectCount),
      permissionDeniedCount: this.permissionDeniedCount,
      errorCountByType: Object.fromEntries(this.errorCounts),
    };
  }

  /**
   * Get active connection count for a document.
   */
  getActiveConnections(docId: string): number {
    return this.activeConnections.get(docId) ?? 0;
  }

  /**
   * Get total active connections across all documents.
   */
  getTotalActiveConnections(): number {
    let total = 0;
    for (const count of this.activeConnections.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Get update count for a document.
   */
  getUpdateCount(docId: string): number {
    return this.updateCount.get(docId) ?? 0;
  }

  /**
   * Get reconnect count for a client.
   */
  getReconnectCount(clientId: string): number {
    return this.reconnectCount.get(clientId) ?? 0;
  }

  /**
   * Get error count by type.
   */
  getErrorCount(errorType: string): number {
    return this.errorCounts.get(errorType) ?? 0;
  }

  /**
   * Export metrics in Prometheus format.
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Active connections gauge
    lines.push("# HELP collab_active_connections Active WebSocket connections per document");
    lines.push("# TYPE collab_active_connections gauge");
    for (const [docId, count] of this.activeConnections) {
      lines.push(`collab_active_connections{doc_id="${escapeLabel(docId)}"} ${count}`);
    }

    // Total active connections
    lines.push("# HELP collab_active_connections_total Total active WebSocket connections");
    lines.push("# TYPE collab_active_connections_total gauge");
    lines.push(`collab_active_connections_total ${this.getTotalActiveConnections()}`);

    // JOIN counter
    lines.push("# HELP collab_joins_total Total JOIN events");
    lines.push("# TYPE collab_joins_total counter");
    lines.push(`collab_joins_total ${this.joinCount}`);

    // LEAVE counter
    lines.push("# HELP collab_leaves_total Total LEAVE events");
    lines.push("# TYPE collab_leaves_total counter");
    lines.push(`collab_leaves_total ${this.leaveCount}`);

    // Update counter per doc
    lines.push("# HELP collab_updates_total Total UPDATE events per document");
    lines.push("# TYPE collab_updates_total counter");
    for (const [docId, count] of this.updateCount) {
      lines.push(`collab_updates_total{doc_id="${escapeLabel(docId)}"} ${count}`);
    }

    // Reconnect counter per client
    lines.push("# HELP collab_reconnects_total Total reconnect events per client");
    lines.push("# TYPE collab_reconnects_total counter");
    for (const [clientId, count] of this.reconnectCount) {
      lines.push(`collab_reconnects_total{client_id="${escapeLabel(clientId)}"} ${count}`);
    }

    // Permission denied counter
    lines.push("# HELP collab_permission_denied_total Permission denied errors");
    lines.push("# TYPE collab_permission_denied_total counter");
    lines.push(`collab_permission_denied_total ${this.permissionDeniedCount}`);

    // Error counter by type
    lines.push("# HELP collab_errors_total Errors by type");
    lines.push("# TYPE collab_errors_total counter");
    for (const [errorType, count] of this.errorCounts) {
      lines.push(`collab_errors_total{error_type="${escapeLabel(errorType)}"} ${count}`);
    }

    return lines.join("\n");
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.activeConnections.clear();
    this.joinCount = 0;
    this.leaveCount = 0;
    this.updateCount.clear();
    this.reconnectCount.clear();
    this.permissionDeniedCount = 0;
    this.errorCounts.clear();
  }
}

/**
 * Escape a label value for Prometheus format.
 */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
