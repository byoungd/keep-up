import { createEventBus } from "@ku0/agent-runtime-control";
import { createTelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import { describe, expect, it } from "vitest";
import { createAuditLogger } from "../security";
import type { AuditEntry } from "../types";

describe("audit telemetry bridge", () => {
  it("emits audit entries to telemetry and event bus", () => {
    const telemetry = createTelemetryContext();
    const eventBus = createEventBus();
    const entries: AuditEntry[] = [];

    eventBus.subscribe("audit:entry", (event) => {
      entries.push(event.payload);
    });

    const logger = createAuditLogger({
      telemetry,
      eventBus,
      source: "audit:test",
    });

    logger.log({
      timestamp: Date.now(),
      toolName: "file:read",
      action: "call",
      sandboxed: true,
    });

    logger.log({
      timestamp: Date.now(),
      toolName: "file:read",
      action: "policy",
      policyDecision: "deny",
      sandboxed: true,
    });

    const metricNames = telemetry.metrics.getMetrics().map((metric) => metric.name);

    expect(metricNames).toContain('agent_audit_entries_total{action="call",tool_name="file:read"}');
    expect(metricNames).toContain(
      'agent_audit_entries_total{action="policy",tool_name="file:read"}'
    );
    expect(metricNames).toContain(
      'agent_audit_policy_decisions_total{decision="deny",tool_name="file:read"}'
    );
    expect(entries).toHaveLength(2);
  });
});
