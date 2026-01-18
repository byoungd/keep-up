/**
 * Tool Execution Pipeline Tests
 *
 * Comprehensive tests for the ToolExecutionPipeline including:
 * - Policy enforcement (permission checks)
 * - Rate limiting
 * - Caching (hits, misses, writes)
 * - Tool resolution
 * - Retry behavior
 * - Audit logging
 * - Telemetry metrics
 * - Error handling
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type CachePredicate,
  createToolExecutor,
  ToolExecutionPipeline,
  type ToolExecutorConfig,
} from "../executor";
import type { ExecutionSandboxAdapter, ToolExecutionTelemetry } from "../sandbox";
import {
  createToolGovernancePolicyEngine,
  createToolPolicyEngine,
  type IPermissionChecker,
} from "../security";
import type { IMetricsRecorder, TelemetryContext } from "../telemetry";
import type { IToolRegistry } from "../tools/mcp/registry";
import type {
  AuditLogEntry,
  AuditLogger,
  ExecutionDecision,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  PermissionEscalation,
  ToolContext,
  ToolExecutionContext,
  ToolExecutionRecord,
} from "../types";
import type { ToolResultCache } from "../utils/cache";
import type { RateLimitResult, ToolRateLimiter } from "../utils/rateLimit";

// ============================================================================
// Mock Implementations
// ============================================================================

class MockToolRegistry implements IToolRegistry {
  private tools: MCPTool[] = [];
  public lastCall?: MCPToolCall;
  public lastContext?: ToolContext;
  public callResult: MCPToolResult = {
    success: true,
    content: [{ type: "text", text: "Mock result" }],
  };
  public shouldThrow = false;
  public throwError = new Error("Mock execution error");

  setTools(tools: MCPTool[]): void {
    this.tools = tools;
  }

  setResult(result: MCPToolResult): void {
    this.callResult = result;
  }

  listTools(): MCPTool[] {
    return this.tools;
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    this.lastCall = call;
    this.lastContext = context;

    if (this.shouldThrow) {
      throw this.throwError;
    }

    return this.callResult;
  }
}

class MockPermissionChecker implements IPermissionChecker {
  public allowAll = true;
  public denyReason = "Permission denied by policy";
  public escalation?: PermissionEscalation;
  public checkedOperations: Array<{ tool: string; operation: string; resource?: string }> = [];

  check(operation: { tool: string; operation: string; resource?: string }): {
    allowed: boolean;
    reason?: string;
    escalation?: PermissionEscalation;
  } {
    this.checkedOperations.push(operation);

    if (this.allowAll) {
      return { allowed: true };
    }
    return { allowed: false, reason: this.denyReason, escalation: this.escalation };
  }
}

class MockRateLimiter implements ToolRateLimiter {
  public allowAll = true;
  public resetInMs = 5000;
  public remaining = 10;
  public limit = 100;
  public consumedCalls: Array<{ toolName: string; userId?: string }> = [];

  checkAndConsume(toolName: string, userId?: string): RateLimitResult {
    this.consumedCalls.push({ toolName, userId });

    if (this.allowAll) {
      return {
        allowed: true,
        remaining: this.remaining,
        resetInMs: this.resetInMs,
        limit: this.limit,
      };
    }
    return {
      allowed: false,
      remaining: 0,
      resetInMs: this.resetInMs,
      limit: this.limit,
    };
  }
}

class MockToolResultCache implements ToolResultCache {
  private cache = new Map<string, MCPToolResult>();
  public getCalls: Array<{ toolName: string; args: unknown }> = [];
  public setCalls: Array<{ toolName: string; args: unknown; result: MCPToolResult }> = [];

  private makeKey(toolName: string, args: unknown): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }

  get(toolName: string, args: unknown): MCPToolResult | undefined {
    this.getCalls.push({ toolName, args });
    return this.cache.get(this.makeKey(toolName, args));
  }

  set(toolName: string, args: unknown, result: MCPToolResult): void {
    this.setCalls.push({ toolName, args, result });
    this.cache.set(this.makeKey(toolName, args), result);
  }

  delete(toolName: string, args: unknown): boolean {
    return this.cache.delete(this.makeKey(toolName, args));
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  preload(toolName: string, args: unknown, result: MCPToolResult): void {
    this.cache.set(this.makeKey(toolName, args), result);
  }
}

class MockAuditLogger implements AuditLogger {
  public logs: AuditLogEntry[] = [];

  log(entry: AuditLogEntry): void {
    this.logs.push(entry);
  }

  getCallLogs(): AuditLogEntry[] {
    return this.logs.filter((l) => l.action === "call");
  }

  getResultLogs(): AuditLogEntry[] {
    return this.logs.filter((l) => l.action === "result" || l.action === "error");
  }
}

class MockMetricsRecorder implements IMetricsRecorder {
  public increments: Array<{ name: string; labels?: Record<string, string> }> = [];
  public observations: Array<{ name: string; value: number; labels?: Record<string, string> }> = [];

  increment(name: string, labels?: Record<string, string>): void {
    this.increments.push({ name, labels });
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    this.observations.push({ name, value, labels });
  }

  gauge(_name: string, _value: number, _labels?: Record<string, string>): void {
    // Not used in executor
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    security: {
      policy: {
        name: "test",
        permissions: {
          bash: { enabled: true },
          file: { enabled: true, read: true, write: true },
          network: { enabled: false },
          code: { enabled: true },
        },
        resourceLimits: {
          maxExecutionTime: 30000,
          maxMemory: 256 * 1024 * 1024,
          maxOutputSize: 1024 * 1024,
          maxConcurrentTools: 5,
        },
        sandbox: {
          enabled: false,
          workingDirectory: "/test/project",
        },
        confirmation: {
          requireForDestructive: false,
          requireForNetwork: false,
          requireForSensitive: false,
        },
      },
      sandbox: {
        enabled: false,
        type: "none",
        workingDirectory: "/test/project",
      },
    },
    permissions: {},
    traceId: "test-trace-id",
    agentId: "test-agent",
    userId: "test-user",
    ...overrides,
  };
}

function createMockTool(name: string, options?: { readOnly?: boolean }): MCPTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      readOnly: options?.readOnly ?? false,
    },
  };
}

function createMockCall(name: string, args?: Record<string, unknown>, id?: string): MCPToolCall {
  return {
    id,
    name,
    arguments: args ?? {},
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("ToolExecutionPipeline", () => {
  let registry: MockToolRegistry;
  let policy: MockPermissionChecker;
  let pipeline: ToolExecutionPipeline;
  let context: ToolContext;

  beforeEach(() => {
    registry = new MockToolRegistry();
    policy = new MockPermissionChecker();
    registry.setTools([createMockTool("test_tool")]);

    pipeline = new ToolExecutionPipeline({
      registry,
      policy,
    });

    context = createMockContext();
  });

  describe("basic execution", () => {
    it("should execute a tool successfully", async () => {
      const call = createMockCall("test_tool", { input: "hello" });

      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toBe("Mock result");
      expect(registry.lastCall).toEqual(call);
      expect(registry.lastContext).toEqual(context);
    });

    it("should pass arguments to the tool", async () => {
      const call = createMockCall("test_tool", { path: "/foo/bar", value: 42 });

      await pipeline.execute(call, context);

      expect(registry.lastCall?.arguments).toEqual({ path: "/foo/bar", value: 42 });
    });

    it("should handle tool returning error result", async () => {
      registry.setResult({
        success: false,
        content: [{ type: "text", text: "Tool error" }],
        error: { code: "EXECUTION_FAILED", message: "Something went wrong" },
      });

      const call = createMockCall("test_tool");
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_FAILED");
    });

    it("should handle tool throwing exception", async () => {
      registry.shouldThrow = true;
      registry.throwError = new Error("Unexpected crash");

      const call = createMockCall("test_tool");
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_FAILED");
      expect(result.error?.message).toBe("Unexpected crash");
    });
  });

  describe("policy enforcement", () => {
    it("should allow execution when policy permits", async () => {
      policy.allowAll = true;
      const call = createMockCall("test_tool");

      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(true);
      expect(policy.checkedOperations).toHaveLength(1);
    });

    it("should deny execution when policy rejects", async () => {
      policy.allowAll = false;
      policy.denyReason = "Forbidden by security policy";

      const call = createMockCall("test_tool");
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
      expect(result.error?.message).toBe("Forbidden by security policy");
    });

    it("should surface escalation metadata when policy suggests escalation", async () => {
      policy.allowAll = false;
      policy.denyReason = "File access is disabled";
      policy.escalation = {
        permission: "file",
        level: "read",
        resource: "/tmp/test.txt",
      };

      const call = createMockCall("file:read", { path: "/tmp/test.txt" });
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_ESCALATION_REQUIRED");
      expect(result.error?.details).toEqual({ escalation: policy.escalation });
    });

    it("should parse qualified tool names for policy check", async () => {
      const call = createMockCall("server:operation");

      await pipeline.execute(call, context);

      expect(policy.checkedOperations[0]).toEqual({
        tool: "server",
        operation: "operation",
        resource: undefined,
      });
    });

    it("should parse simple tool names for policy check", async () => {
      const call = createMockCall("simple_tool");

      await pipeline.execute(call, context);

      expect(policy.checkedOperations[0]).toEqual({
        tool: "simple_tool",
        operation: "simple_tool",
        resource: undefined,
      });
    });

    it("should extract path resource from arguments", async () => {
      const call = createMockCall("file:read", { path: "/etc/passwd" });

      await pipeline.execute(call, context);

      expect(policy.checkedOperations[0].resource).toBe("/etc/passwd");
    });

    it("should extract docId resource from arguments", async () => {
      const call = createMockCall("doc:update", { docId: "doc-123" });

      await pipeline.execute(call, context);

      expect(policy.checkedOperations[0].resource).toBe("doc-123");
    });

    it("should not execute tool when permission denied", async () => {
      policy.allowAll = false;

      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      expect(registry.lastCall).toBeUndefined();
    });
  });

  describe("tool governance policy", () => {
    it("denies tools not in allowlist", async () => {
      registry.setTools([createMockTool("allowed:tool"), createMockTool("blocked:tool")]);
      const toolExecutionContext: ToolExecutionContext = {
        policy: "interactive",
        allowedTools: ["allowed:*"],
        requiresApproval: [],
        maxParallel: 1,
      };
      const policyEngine = createToolGovernancePolicyEngine(
        createToolPolicyEngine(policy),
        toolExecutionContext
      );
      pipeline = new ToolExecutionPipeline({ registry, policy, policyEngine });

      const result = await pipeline.execute(createMockCall("blocked:tool"), context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
      expect(result.error?.message).toBe('Tool "blocked:tool" not allowed by execution policy');
    });

    it("marks tools as requiring confirmation when policy requires approval", async () => {
      registry.setTools([createMockTool("sensitive:tool")]);
      const toolExecutionContext: ToolExecutionContext = {
        policy: "interactive",
        allowedTools: ["*"],
        requiresApproval: ["sensitive:tool"],
        maxParallel: 1,
      };
      const policyEngine = createToolGovernancePolicyEngine(
        createToolPolicyEngine(policy),
        toolExecutionContext
      );
      pipeline = new ToolExecutionPipeline({ registry, policy, policyEngine });

      const requiresConfirmation = pipeline.requiresConfirmation(
        createMockCall("sensitive:tool"),
        context
      );

      expect(requiresConfirmation).toBe(true);
    });
  });

  describe("schema validation", () => {
    it("blocks invalid arguments before execution", async () => {
      registry.setTools([
        {
          name: "test:tool",
          description: "test tool",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      ]);

      const result = await pipeline.execute(createMockCall("test:tool", {}), context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
      expect(registry.lastCall).toBeUndefined();
    });
  });

  describe("rate limiting", () => {
    let rateLimiter: MockRateLimiter;

    beforeEach(() => {
      rateLimiter = new MockRateLimiter();
      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        rateLimiter,
      });
    });

    it("should allow execution when under rate limit", async () => {
      rateLimiter.allowAll = true;
      const call = createMockCall("test_tool");

      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(true);
      expect(rateLimiter.consumedCalls).toHaveLength(1);
    });

    it("should deny execution when rate limited", async () => {
      rateLimiter.allowAll = false;
      rateLimiter.resetInMs = 10000;

      const call = createMockCall("test_tool");
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("RATE_LIMITED");
      expect(result.error?.message).toContain("10000ms");
    });

    it("should pass userId to rate limiter", async () => {
      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      expect(rateLimiter.consumedCalls[0].userId).toBe("test-user");
    });

    it("should not execute tool when rate limited", async () => {
      rateLimiter.allowAll = false;

      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      expect(registry.lastCall).toBeUndefined();
    });
  });

  describe("caching", () => {
    let cache: MockToolResultCache;

    beforeEach(() => {
      cache = new MockToolResultCache();
      registry.setTools([createMockTool("read_tool", { readOnly: true })]);
      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        cache,
      });
    });

    it("should check cache for read-only tools", async () => {
      const call = createMockCall("read_tool", { id: "123" });

      await pipeline.execute(call, context);

      expect(cache.getCalls).toHaveLength(1);
      expect(cache.getCalls[0].toolName).toBe("read_tool");
    });

    it("should return cached result on cache hit", async () => {
      const cachedResult: MCPToolResult = {
        success: true,
        content: [{ type: "text", text: "Cached response" }],
      };
      cache.preload("read_tool", { id: "123" }, cachedResult);

      const call = createMockCall("read_tool", { id: "123" });
      const result = await pipeline.execute(call, context);

      expect(result.content[0].text).toBe("Cached response");
      expect(registry.lastCall).toBeUndefined(); // Tool not actually called
    });

    it("should cache successful results for read-only tools", async () => {
      const call = createMockCall("read_tool", { id: "456" });

      await pipeline.execute(call, context);

      expect(cache.setCalls).toHaveLength(1);
      expect(cache.setCalls[0].toolName).toBe("read_tool");
      expect(cache.setCalls[0].result.success).toBe(true);
    });

    it("should not cache failed results", async () => {
      registry.setResult({
        success: false,
        content: [{ type: "text", text: "Error" }],
        error: { code: "EXECUTION_FAILED", message: "Error" },
      });

      const call = createMockCall("read_tool", { id: "789" });
      await pipeline.execute(call, context);

      expect(cache.setCalls).toHaveLength(0);
    });

    it("should not cache non-read-only tools by default", async () => {
      registry.setTools([createMockTool("write_tool", { readOnly: false })]);

      const call = createMockCall("write_tool", { data: "test" });
      await pipeline.execute(call, context);

      expect(cache.getCalls).toHaveLength(0);
      expect(cache.setCalls).toHaveLength(0);
    });

    it("should use custom cache predicate", async () => {
      const customPredicate: CachePredicate = (_tool, call) => {
        return call.name.startsWith("cached_");
      };

      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        cache,
        cachePredicate: customPredicate,
      });

      registry.setTools([createMockTool("cached_operation")]);
      const call = createMockCall("cached_operation");

      await pipeline.execute(call, context);

      expect(cache.getCalls).toHaveLength(1);
      expect(cache.setCalls).toHaveLength(1);
    });
  });

  describe("tool resolution", () => {
    it("should resolve simple tool names", async () => {
      registry.setTools([createMockTool("my_tool")]);

      const call = createMockCall("my_tool");
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(true);
    });

    it("should resolve qualified tool names (server:tool)", async () => {
      registry.setTools([createMockTool("operation")]);

      const call = createMockCall("server:operation");
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(true);
    });

    it("should cache resolved tools for performance", async () => {
      registry.setTools([createMockTool("cached_tool")]);

      const call = createMockCall("cached_tool");
      await pipeline.execute(call, context);
      await pipeline.execute(call, context);

      // Tool is found and cached, listTools is called during resolution
      expect(registry.lastCall?.name).toBe("cached_tool");
    });
  });

  describe("audit logging", () => {
    let audit: MockAuditLogger;

    beforeEach(() => {
      audit = new MockAuditLogger();
      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        audit,
      });
    });

    it("should log tool call before execution", async () => {
      const call = createMockCall("test_tool", { input: "data" });

      await pipeline.execute(call, context);

      const callLogs = audit.getCallLogs();
      expect(callLogs).toHaveLength(1);
      expect(callLogs[0].toolName).toBe("test_tool");
      expect(callLogs[0].action).toBe("call");
      expect(callLogs[0].input).toEqual({ input: "data" });
    });

    it("should log successful result after execution", async () => {
      const call = createMockCall("test_tool");

      await pipeline.execute(call, context);

      const resultLogs = audit.getResultLogs();
      expect(resultLogs).toHaveLength(1);
      expect(resultLogs[0].action).toBe("result");
    });

    it("should log error result for failed tools", async () => {
      registry.setResult({
        success: false,
        content: [{ type: "text", text: "Error" }],
        error: { code: "EXECUTION_FAILED", message: "Failed" },
      });

      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      const resultLogs = audit.getResultLogs();
      expect(resultLogs).toHaveLength(1);
      expect(resultLogs[0].action).toBe("error");
    });

    it("should include userId in audit logs", async () => {
      const call = createMockCall("test_tool");

      await pipeline.execute(call, context);

      expect(audit.logs[0].userId).toBe("test-user");
    });

    it("should include sandbox status in audit logs", async () => {
      const sandboxedContext = createMockContext({
        security: {
          ...context.security,
          sandbox: {
            enabled: true,
            type: "container",
            workingDirectory: "/sandbox",
          },
        },
      });

      const call = createMockCall("test_tool");
      await pipeline.execute(call, sandboxedContext);

      expect(audit.logs[0].sandboxed).toBe(true);
    });

    it("should log permission denied without calling tool", async () => {
      policy.allowAll = false;

      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      // Only result log (error), no call log
      expect(audit.logs.filter((l) => l.action === "call")).toHaveLength(0);
      expect(audit.logs.filter((l) => l.action === "error")).toHaveLength(1);
    });
  });

  describe("telemetry", () => {
    let metrics: MockMetricsRecorder;

    beforeEach(() => {
      metrics = new MockMetricsRecorder();
      const telemetry: TelemetryContext = {
        traceId: "test-trace",
        spanId: "test-span",
        metrics,
      };

      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        telemetry,
      });
    });

    it("should record started metric", async () => {
      const call = createMockCall("test_tool");

      await pipeline.execute(call, context);

      const startedMetrics = metrics.increments.filter((m) => m.labels?.status === "started");
      expect(startedMetrics).toHaveLength(1);
      expect(startedMetrics[0].labels?.tool_name).toBe("test_tool");
    });

    it("should record success metric for successful execution", async () => {
      const call = createMockCall("test_tool");

      await pipeline.execute(call, context);

      const successMetrics = metrics.increments.filter((m) => m.labels?.status === "success");
      expect(successMetrics).toHaveLength(1);
    });

    it("should record error metric for failed execution", async () => {
      registry.setResult({
        success: false,
        content: [{ type: "text", text: "Error" }],
        error: { code: "EXECUTION_FAILED", message: "Failed" },
      });

      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      const errorMetrics = metrics.increments.filter((m) => m.labels?.status === "error");
      expect(errorMetrics).toHaveLength(1);
    });

    it("should record exception metric for thrown errors", async () => {
      registry.shouldThrow = true;

      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      const exceptionMetrics = metrics.increments.filter((m) => m.labels?.status === "exception");
      expect(exceptionMetrics).toHaveLength(1);
    });

    it("should record duration for all executions", async () => {
      const call = createMockCall("test_tool");

      await pipeline.execute(call, context);

      expect(metrics.observations).toHaveLength(1);
      expect(metrics.observations[0].value).toBeGreaterThanOrEqual(0);
    });

    it("should record permission denied metric", async () => {
      policy.allowAll = false;

      const call = createMockCall("test_tool");
      await pipeline.execute(call, context);

      const deniedMetrics = metrics.increments.filter((m) => m.labels?.permission === "policy");
      expect(deniedMetrics).toHaveLength(1);
    });
  });

  describe("execution observer", () => {
    it("should emit decisions and records for successful execution", async () => {
      const decisions: ExecutionDecision[] = [];
      const records: ToolExecutionRecord[] = [];

      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        executionObserver: {
          onDecision: (decision) => decisions.push(decision),
          onRecord: (record) => records.push(record),
        },
      });

      const call = createMockCall("test_tool", { input: "ok" }, "call-1");
      await pipeline.execute(call, context);

      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual(
        expect.objectContaining({
          toolName: "test_tool",
          toolCallId: "call-1",
          allowed: true,
        })
      );

      expect(records.map((record) => record.status)).toEqual(["started", "completed"]);
      expect(records[1]?.policyDecisionId).toBe(decisions[0]?.decisionId);
    });

    it("should emit failed record when policy denies", async () => {
      policy.allowAll = false;
      policy.denyReason = "Denied by policy";

      const decisions: ExecutionDecision[] = [];
      const records: ToolExecutionRecord[] = [];

      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        executionObserver: {
          onDecision: (decision) => decisions.push(decision),
          onRecord: (record) => records.push(record),
        },
      });

      const call = createMockCall("test_tool", undefined, "call-2");
      await pipeline.execute(call, context);

      expect(decisions).toHaveLength(1);
      expect(decisions[0]?.allowed).toBe(false);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(
        expect.objectContaining({
          status: "failed",
          error: "Denied by policy",
        })
      );
    });
  });

  describe("retry behavior", () => {
    it("should execute without retry when no retry options", async () => {
      const call = createMockCall("test_tool");

      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(true);
    });

    it("should pass context signal to retry", async () => {
      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        retryOptions: { maxAttempts: 3, delayMs: 10 },
      });

      const controller = new AbortController();
      const contextWithSignal = createMockContext({ signal: controller.signal });

      const call = createMockCall("test_tool");
      const result = await pipeline.execute(call, contextWithSignal);

      expect(result.success).toBe(true);
    });

    it("should block execution when sandbox adapter denies", async () => {
      registry.setTools([createMockTool("test_tool")]);

      const sandboxAdapter: ExecutionSandboxAdapter = {
        preflight: () => ({
          allowed: false,
          sandboxed: true,
          reason: "sandbox denied",
        }),
        postflight: (call, context, _result, durationMs) => ({
          toolName: call.name,
          durationMs,
          sandboxed: context.security.sandbox.type !== "none",
        }),
      };

      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        sandboxAdapter,
      });

      const result = await pipeline.execute(createMockCall("test_tool"), createMockContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SANDBOX_VIOLATION");
    });

    it("should emit sandbox telemetry when configured", async () => {
      registry.setTools([createMockTool("test_tool")]);

      const events: ToolExecutionTelemetry[] = [];
      const sandboxAdapter: ExecutionSandboxAdapter = {
        preflight: () => ({ allowed: true, sandboxed: false }),
        postflight: (call, _context, _result, durationMs) => ({
          toolName: call.name,
          durationMs,
          sandboxed: false,
        }),
      };

      pipeline = new ToolExecutionPipeline({
        registry,
        policy,
        sandboxAdapter,
        telemetryHandler: (event) => events.push(event),
      });

      await pipeline.execute(createMockCall("test_tool"), createMockContext());

      expect(events).toHaveLength(1);
      expect(events[0]?.toolName).toBe("test_tool");
    });
  });

  describe("factory function", () => {
    it("should create ToolExecutionPipeline instance", () => {
      const config: ToolExecutorConfig = {
        registry,
        policy,
      };

      const executor = createToolExecutor(config);

      expect(executor).toBeDefined();
    });

    it("should create functional executor", async () => {
      const executor = createToolExecutor({
        registry,
        policy,
      });

      const call = createMockCall("test_tool");
      const result = await executor.execute(call, context);

      expect(result.success).toBe(true);
    });
  });
});

describe("Edge Cases", () => {
  let registry: MockToolRegistry;
  let policy: MockPermissionChecker;

  beforeEach(() => {
    registry = new MockToolRegistry();
    policy = new MockPermissionChecker();
  });

  it("should handle tool not found gracefully", async () => {
    registry.setTools([]); // No tools

    const pipeline = new ToolExecutionPipeline({
      registry,
      policy,
    });

    const call = createMockCall("nonexistent_tool");
    const result = await pipeline.execute(call, createMockContext());

    // Should still execute (registry handles missing tools)
    expect(result).toBeDefined();
  });

  it("should handle empty arguments", async () => {
    registry.setTools([createMockTool("test_tool")]);

    const pipeline = new ToolExecutionPipeline({
      registry,
      policy,
    });

    const call = createMockCall("test_tool", {});
    const result = await pipeline.execute(call, createMockContext());

    expect(result.success).toBe(true);
  });

  it("should handle deeply nested tool names", async () => {
    registry.setTools([createMockTool("nested")]);

    const pipeline = new ToolExecutionPipeline({
      registry,
      policy,
    });

    const call = createMockCall("server:namespace:nested");
    await pipeline.execute(call, createMockContext());

    expect(policy.checkedOperations[0]).toEqual({
      tool: "server",
      operation: "namespace:nested",
      resource: undefined,
    });
  });

  it("should handle concurrent executions", async () => {
    registry.setTools([createMockTool("concurrent_tool")]);

    const pipeline = new ToolExecutionPipeline({
      registry,
      policy,
    });

    const context = createMockContext();
    const calls = Array.from({ length: 5 }, (_, i) => createMockCall("concurrent_tool", { id: i }));

    const results = await Promise.all(calls.map((call) => pipeline.execute(call, context)));

    expect(results.every((r) => r.success)).toBe(true);
  });

  it("should handle special characters in tool names", async () => {
    registry.setTools([createMockTool("tool_with_special-chars.v2")]);

    const pipeline = new ToolExecutionPipeline({
      registry,
      policy,
    });

    const call = createMockCall("tool_with_special-chars.v2");
    const result = await pipeline.execute(call, createMockContext());

    expect(result.success).toBe(true);
  });
});
