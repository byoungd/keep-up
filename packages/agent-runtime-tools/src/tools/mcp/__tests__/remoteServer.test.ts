import { createEventBus } from "@ku0/agent-runtime-control";
import type { AuditEntry, AuditFilter, AuditLogger } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createMcpRemoteToolServer, type McpStatusEventPayload } from "../remoteServer";

class MockAuditLogger implements AuditLogger {
  logs: AuditEntry[] = [];

  log(entry: AuditEntry): void {
    this.logs.push(entry);
  }

  getEntries(_filter?: AuditFilter): AuditEntry[] {
    return [...this.logs];
  }
}

describe("McpRemoteToolServer status events", () => {
  it("emits status updates to event bus and audit log", () => {
    const auditLogger = new MockAuditLogger();
    const eventBus = createEventBus();
    const events: McpStatusEventPayload[] = [];

    eventBus.subscribe("mcp:status", (event) => {
      events.push(event.payload as McpStatusEventPayload);
    });

    const server = createMcpRemoteToolServer({
      name: "test",
      description: "Test MCP server",
      transport: {
        type: "stdio",
        command: "node",
      },
      eventBus,
      auditLogger,
    });

    const transport = (server as unknown as { transport: { onerror?: (error: Error) => void } })
      .transport;
    transport.onerror?.(new Error("boom"));

    expect(events).toHaveLength(1);
    expect(events[0].server).toBe("test");
    expect(events[0].status.state).toBe("error");
    expect(events[0].status.lastError).toBe("boom");

    expect(auditLogger.logs).toHaveLength(1);
    expect(auditLogger.logs[0].toolName).toBe("mcp:test");
    expect(auditLogger.logs[0].action).toBe("error");
  });
});
