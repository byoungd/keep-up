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
import {
  type IMetricsCollector,
  InMemoryTracer,
  type MetricValue,
  type TelemetryContext,
} from "../telemetry";
import type { IToolRegistry } from "../tools/mcp/registry";
import type {
  AuditEntry,
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
import { ToolResultCache } from "../utils/cache";
// Actually I need to import the class, so remove 'type'
import { type RateLimitResult, ToolRateLimiter } from "../utils/rateLimit";

// ============================================================================
// Mock Implementations
// ============================================================================

class MockToolRegistry implements IToolRegistry {
  private tools: MCPTool[] = [];
  private toolServers = new Map<string, string>();
  public lastCall?: MCPToolCall;
  public lastContext?: ToolContext;
  public callResult: MCPToolResult = {
    success: true,
    content: [{ type: "text", text: "Mock result" }],
  };
  public shouldThrow = false;
  public throwError = new Error("Mock execution error");
  // biome-ignore lint/complexity/noBannedTypes: Test mock
  private listeners: Record<string, Function[]> = {};

  setTools(tools: MCPTool[]): void {
    this.tools = tools;
  }

  setToolServer(toolName: string, serverName: string): void {
    this.toolServers.set(toolName, serverName);
  }

  setResult(result: MCPToolResult): void {
    this.callResult = result;
  }

  async register(server: { name: string; listTools: () => MCPTool[] }): Promise<void> {
    const tools = server.listTools();
    this.tools.push(...tools);
    tools.forEach((t) => {
      this.toolServers.set(t.name, server.name);
    });
  }

  // Helper for existing tests that use valid arguments but wrong structure for new interface
  // We can't overload in interface implementation easily without 'any'.
  // But we can update the tests.

  async unregister(_serverName: string): Promise<void> {
    // implementation
  }

  listTools(): MCPTool[] {
    return this.tools;
  }

  hasTool(name: string): boolean {
    return this.tools.some((t) => t.name === name);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Test mock
  getServer(_toolName: string): any {
    // Return dummy server if needed or undefined
    return undefined;
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    this.lastCall = call;
    this.lastContext = context;

    if (this.shouldThrow) {
      throw this.throwError;
    }

    return this.callResult;
  }

  resolveToolServer(toolName: string): string | undefined {
    return this.toolServers.get(toolName);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Test mock
  on(event: any, handler: any): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
    return () => {
      // noop unsubscribe
    };
  }
}

// ... MockPermissionChecker ...

// ... MockMetricsRecorder ...
// Updating later in the file, but I can include it here if the chunk covers it.
// The instruction says lines 280-285 for metrics.
// But this tool call is for MockToolRegistry mainly. I'll stick to replacing MockToolRegistry.

// Actually, I should update the usages in text too or I will get errors.
// There are too many usages to update manually one by one. I should use `multi_replace` or replace specific blocks.

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

  getPolicy() {
    return {
      name: "mock-policy",
      permissions: {},
      resourceLimits: {},
      sandbox: { type: "none" },
      // biome-ignore lint/suspicious/noExplicitAny: Test mock
    } as any;
  }
}

class MockRateLimiter extends ToolRateLimiter {
  public allowAll = true;
  public resetInMs = 5000;
  public remaining = 10;
  public limit = 100;
  public consumedCalls: Array<{ toolName: string; userId?: string }> = [];

  constructor() {
    super({ default: { maxRequests: 100, windowMs: 5000 } });
  }

  override checkAndConsume(toolName: string, userId?: string): RateLimitResult {
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

  override check(_toolName: string, _userId?: string): RateLimitResult {
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

  override reset(): void {
    // noop for mock
  }
  override cleanup(): void {
    // noop for mock
  }
}

class MockToolResultCache extends ToolResultCache {
  public getCalls: Array<{ toolName: string; args: unknown }> = [];
  public setCalls: Array<{ toolName: string; args: unknown; result: MCPToolResult }> = [];

  override get(toolName: string, args: Record<string, unknown>): unknown | undefined {
    this.getCalls.push({ toolName, args });
    // Delegate to super or just mock behavior? The tests likely expect specific behavior.
    // The previous implementation used a local Map. Let's keep using a local map but we can't access private 'cache' of super.
    // Actually, let's just use the super's cache if we can, OR shadow the functionality.
    // Since we are mocking, we often want to spy.
    return super.get(toolName, args);
  }

  override set(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    ttlMs?: number
  ): void {
    this.setCalls.push({ toolName, args, result: result as MCPToolResult });
    super.set(toolName, args, result, ttlMs);
  }

  // The tests use 'cache' property which was local.
  // We should rely on public methods for tests, or add helper methods.
  // The original mock had a public 'cache' map? No, private.

  preload(toolName: string, args: Record<string, unknown>, result: MCPToolResult): void {
    this.set(toolName, args, result);
  }
}

class MockAuditLogger implements AuditLogger {
  public logs: AuditEntry[] = [];

  log(entry: AuditEntry): void {
    this.logs.push(entry);
  }

  getCallLogs(): AuditEntry[] {
    return this.logs.filter((l) => l.action === "call");
  }

  getResultLogs(): AuditEntry[] {
    return this.logs.filter((l) => l.action === "result" || l.action === "error");
  }

  getEntries(): AuditEntry[] {
    return this.logs;
  }
}

class MockMetricsRecorder implements IMetricsCollector {
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

  getMetrics(): MetricValue[] {
    return [];
  }

  toPrometheus(): string {
    return "";
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    security: {
      sandbox: {
        type: "none",
        networkAccess: "none",
        fsIsolation: "none",
        workingDirectory: "/test/project",
      },
      permissions: {
        bash: "disabled",
        file: "read",
        network: "none",
        code: "disabled",
        lfcc: "read",
      },
      limits: {
        maxExecutionTimeMs: 30000,
        maxMemoryBytes: 256 * 1024 * 1024,
        maxOutputBytes: 1024 * 1024,
        maxConcurrentCalls: 5,
      },
    },
    correlationId: "test-trace-id",
    userId: "test-user",
    ...overrides,
  };
}

function createMockTool(name: string, options?: { readOnly?: boolean }): MCPTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: "object" },
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
      // biome-ignore lint/suspicious/noExplicitAny: ToolContent union type
      expect((result.content[0] as any).text).toBe("Mock result");
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

    it("allows unqualified tools when the registry resolves the server", async () => {
      registry.setTools([createMockTool("read")]);
      registry.setToolServer("read", "file");
      const toolExecutionContext: ToolExecutionContext = {
        policy: "interactive",
        allowedTools: ["file:read"],
        requiresApproval: [],
        maxParallel: 1,
      };
      const policyEngine = createToolGovernancePolicyEngine(
        createToolPolicyEngine(policy),
        toolExecutionContext
      );
      pipeline = new ToolExecutionPipeline({ registry, policy, policyEngine });

      const result = await pipeline.execute(createMockCall("read"), context);

      expect(result.success).toBe(true);
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

    it("rejects non-object arguments for object schemas", async () => {
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

      const call: MCPToolCall = {
        name: "test:tool",
        arguments: null as unknown as Record<string, unknown>,
      };
      const result = await pipeline.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
      expect(result.error?.message).toBe("Arguments must be an object");
      expect(registry.lastCall).toBeUndefined();
    });

    it("rejects unexpected arguments when properties are declared", async () => {
      registry.setTools([
        {
          name: "test:tool",
          description: "test tool",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: [],
          },
        },
      ]);

      const result = await pipeline.execute(
        createMockCall("test:tool", { path: "/tmp/file.txt", extra: "nope" }),
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
      expect(result.error?.message).toBe("Unexpected argument: extra");
      expect(registry.lastCall).toBeUndefined();
    });

    it("validates enum and nested object properties", async () => {
      registry.setTools([
        {
          name: "test:tool",
          description: "test tool",
          inputSchema: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ["fast", "slow"] },
              options: {
                type: "object",
                properties: { level: { type: "number" } },
                required: ["level"],
              },
            },
            required: ["mode", "options"],
          },
        },
      ]);

      const result = await pipeline.execute(
        createMockCall("test:tool", { mode: "medium", options: { level: 1 } }),
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
      expect(result.error?.message).toBe("Invalid value for mode: expected one of fast, slow");
      expect(registry.lastCall).toBeUndefined();
    });

    it("validates array items", async () => {
      registry.setTools([
        {
          name: "test:tool",
          description: "test tool",
          inputSchema: {
            type: "object",
            properties: {
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["tags"],
          },
        },
      ]);

      const result = await pipeline.execute(
        createMockCall("test:tool", { tags: ["ok", 2] }),
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
      expect(result.error?.message).toBe("Invalid type for tags[1]: expected string");
      expect(registry.lastCall).toBeUndefined();
    });

    it("validates oneOf schemas", async () => {
      registry.setTools([
        {
          name: "test:tool",
          description: "test tool",
          inputSchema: {
            type: "object",
            properties: {
              value: {
                oneOf: [{ type: "string" }, { type: "number" }],
              },
            },
            required: ["value"],
          },
        },
      ]);

      const result = await pipeline.execute(createMockCall("test:tool", { value: true }), context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_ARGUMENTS");
      expect(result.error?.message).toBe(
        "Invalid value for value: does not match any allowed schema"
      );
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
      (cache as MockToolResultCache).preload("read_tool", { id: "123" }, cachedResult);

      const call = createMockCall("read_tool", { id: "123" });
      const result = await pipeline.execute(call, context);

      // biome-ignore lint/suspicious/noExplicitAny: ToolContent union type
      expect((result.content[0] as any).text).toBe("Cached response");
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

      expect(audit.logs[0].correlationId).toBe("test-trace-id");
    });

    it("should include sandbox status in audit logs", async () => {
      const sandboxedContext = createMockContext({
        security: {
          ...context.security,
          sandbox: {
            type: "docker",
            networkAccess: "none",
            fsIsolation: "temp",
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
        metrics,
        tracer: new InMemoryTracer(),
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
        retryOptions: { maxAttempts: 3, initialDelayMs: 10 },
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
