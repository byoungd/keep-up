/**
 * Tool Execution Pipeline
 *
 * Centralizes policy checks, auditing, rate limiting, caching, retry, and telemetry.
 */

import {
  type ExecutionSandboxAdapter,
  type ExecutionSandboxDecision,
  type ToolExecutionTelemetry,
  createExecutionSandboxAdapter,
} from "../sandbox";
import {
  type IPermissionChecker,
  type ToolPolicyDecision,
  type ToolPolicyEngine,
  createToolPolicyEngine,
} from "../security";
import { AGENT_METRICS } from "../telemetry";
import type { TelemetryContext } from "../telemetry";
import type { IToolRegistry } from "../tools/mcp/registry";
import type {
  AuditLogger,
  ExecutionDecision,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  ToolContext,
  ToolError,
  ToolExecutionRecord,
} from "../types";
import type { ToolResultCache } from "../utils/cache";
import type { ToolRateLimiter } from "../utils/rateLimit";
import { type RetryOptions, retry } from "../utils/retry";

export interface ToolExecutor {
  execute(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult>;
}

export interface ToolExecutionObserver {
  onDecision?: (decision: ExecutionDecision) => void;
  onRecord?: (record: ToolExecutionRecord) => void;
}

export interface ToolConfirmationResolver extends ToolExecutor {
  requiresConfirmation(call: MCPToolCall, context: ToolContext): boolean;
}

export interface ToolConfirmationDetails {
  requiresConfirmation: boolean;
  reason?: string;
  riskTags?: string[];
}

export interface ToolConfirmationDetailsProvider extends ToolConfirmationResolver {
  getConfirmationDetails(call: MCPToolCall, context: ToolContext): ToolConfirmationDetails;
}

export type CachePredicate = (tool: MCPTool | undefined, call: MCPToolCall) => boolean;

export interface ToolExecutorConfig {
  registry: IToolRegistry;
  policy: IPermissionChecker;
  policyEngine?: ToolPolicyEngine;
  sandboxAdapter?: ExecutionSandboxAdapter;
  telemetryHandler?: (event: ToolExecutionTelemetry) => void;
  executionObserver?: ToolExecutionObserver;
  audit?: AuditLogger;
  telemetry?: TelemetryContext;
  rateLimiter?: ToolRateLimiter;
  cache?: ToolResultCache;
  retryOptions?: RetryOptions;
  cachePredicate?: CachePredicate;
  contextOverrides?: Partial<ToolContext>;
}

export interface ToolExecutionOptions {
  policy?: IPermissionChecker;
  policyEngine?: ToolPolicyEngine;
  sandboxAdapter?: ExecutionSandboxAdapter;
  telemetryHandler?: (event: ToolExecutionTelemetry) => void;
  executionObserver?: ToolExecutionObserver;
  audit?: AuditLogger;
  telemetry?: TelemetryContext;
  rateLimiter?: ToolRateLimiter;
  cache?: ToolResultCache;
  retryOptions?: RetryOptions;
  cachePredicate?: CachePredicate;
  contextOverrides?: Partial<ToolContext>;
}

type ExecutionPreparationResult =
  | { ok: true; sandboxDecision: ExecutionSandboxDecision }
  | { ok: false; result: MCPToolResult };

export class ToolExecutionPipeline
  implements ToolExecutor, ToolConfirmationResolver, ToolConfirmationDetailsProvider
{
  private readonly registry: IToolRegistry;
  private readonly policyEngine: ToolPolicyEngine;
  private readonly sandboxAdapter: ExecutionSandboxAdapter;
  private readonly telemetryHandler?: (event: ToolExecutionTelemetry) => void;
  private readonly executionObserver?: ToolExecutionObserver;
  private readonly audit?: AuditLogger;
  private readonly telemetry?: TelemetryContext;
  private readonly rateLimiter?: ToolRateLimiter;
  private readonly cache?: ToolResultCache;
  private readonly retryOptions?: RetryOptions;
  private readonly cachePredicate?: CachePredicate;
  private readonly contextOverrides?: Partial<ToolContext>;
  private readonly toolCache = new Map<string, MCPTool>();

  constructor(config: ToolExecutorConfig) {
    this.registry = config.registry;
    this.policyEngine = config.policyEngine ?? createToolPolicyEngine(config.policy);
    this.sandboxAdapter = config.sandboxAdapter ?? createExecutionSandboxAdapter();
    this.telemetryHandler = config.telemetryHandler;
    this.executionObserver = config.executionObserver;
    this.audit = config.audit;
    this.telemetry = config.telemetry;
    this.rateLimiter = config.rateLimiter;
    this.cache = config.cache;
    this.retryOptions = config.retryOptions;
    this.cachePredicate = config.cachePredicate;
    this.contextOverrides = config.contextOverrides;
  }

  async execute(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    const executionContext = this.applyContextOverrides(context);
    const startTime = Date.now();
    const toolCallId = this.resolveToolCallId(call);
    const decisionId = this.resolveDecisionId(toolCallId);
    this.recordToolMetric(call.name, "started");

    const tool = this.resolveTool(call.name);
    const preparation = this.prepareExecution({
      call,
      tool,
      context: executionContext,
      startTime,
      toolCallId,
      decisionId,
    });

    if (!preparation.ok) {
      return preparation.result;
    }

    const { sandboxDecision } = preparation;

    const cacheable = this.isCacheable(tool, call);
    if (cacheable && this.cache) {
      const cached = this.cache.get(call.name, call.arguments) as MCPToolResult | undefined;
      if (cached) {
        this.emitRecord(
          this.createExecutionRecord({
            toolCallId,
            toolName: call.name,
            taskNodeId: executionContext.taskNodeId,
            status: "completed",
            durationMs: Date.now() - startTime,
            affectedPaths: sandboxDecision.affectedPaths,
            policyDecisionId: decisionId,
            sandboxed: sandboxDecision.sandboxed,
          })
        );
        this.recordToolMetric(call.name, "success");
        this.recordDuration(call.name, startTime);
        this.emitSandboxTelemetry(call, executionContext, cached, startTime);
        return cached;
      }
    }

    this.auditCall(call, executionContext);

    try {
      const result = await this.executeWithRetry(call, executionContext);
      this.recordToolMetric(call.name, result.success ? "success" : "error");
      this.recordDuration(call.name, startTime);

      this.emitRecord(
        this.createExecutionRecord({
          toolCallId,
          toolName: call.name,
          taskNodeId: executionContext.taskNodeId,
          status: result.success ? "completed" : "failed",
          durationMs: Date.now() - startTime,
          affectedPaths: sandboxDecision.affectedPaths,
          policyDecisionId: decisionId,
          sandboxed: sandboxDecision.sandboxed,
          error: result.success ? undefined : result.error?.message,
        })
      );

      if (cacheable && this.cache && result.success) {
        this.cache.set(call.name, call.arguments, result);
      }

      this.emitSandboxTelemetry(call, executionContext, result, startTime);
      this.auditResult(call, executionContext, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exceptionResult = this.createErrorResult("EXECUTION_FAILED", message);
      this.recordToolMetric(call.name, "exception");
      this.recordDuration(call.name, startTime);
      this.emitRecord(
        this.createExecutionRecord({
          toolCallId,
          toolName: call.name,
          taskNodeId: executionContext.taskNodeId,
          status: "failed",
          durationMs: Date.now() - startTime,
          affectedPaths: sandboxDecision.affectedPaths,
          policyDecisionId: decisionId,
          sandboxed: sandboxDecision.sandboxed,
          error: message,
        })
      );
      this.emitSandboxTelemetry(call, executionContext, exceptionResult, startTime);
      this.auditResult(call, executionContext, exceptionResult);
      return exceptionResult;
    }
  }

  requiresConfirmation(call: MCPToolCall, context: ToolContext): boolean {
    const tool = this.resolveTool(call.name);
    const policyDecision = this.evaluatePolicy(call, tool, context);

    if (!policyDecision.allowed) {
      return false;
    }

    if (policyDecision.requiresConfirmation) {
      return true;
    }

    return tool?.annotations?.requiresConfirmation ?? false;
  }

  getConfirmationDetails(call: MCPToolCall, context: ToolContext): ToolConfirmationDetails {
    const tool = this.resolveTool(call.name);
    const policyDecision = this.evaluatePolicy(call, tool, context);
    const requiresConfirmation =
      policyDecision.allowed &&
      (policyDecision.requiresConfirmation || tool?.annotations?.requiresConfirmation === true);

    return {
      requiresConfirmation,
      reason: policyDecision.reason,
      riskTags: policyDecision.riskTags,
    };
  }

  private resolveTool(callName: string): MCPTool | undefined {
    const simpleName = callName.includes(":") ? callName.split(":")[1] : callName;
    const cached = this.toolCache.get(simpleName);
    if (cached) {
      return cached;
    }

    const tool = this.registry.listTools().find((entry) => entry.name === simpleName);
    if (tool) {
      this.toolCache.set(simpleName, tool);
    }
    return tool;
  }

  private evaluatePolicy(
    call: MCPToolCall,
    tool: MCPTool | undefined,
    context: ToolContext
  ): ToolPolicyDecision {
    const { tool: toolName, operation } = this.parseToolName(call.name);
    const resource = this.extractResource(call);

    return this.policyEngine.evaluate({
      call,
      tool: toolName,
      operation,
      resource,
      toolDefinition: tool,
      context,
      taskNodeId: context.taskNodeId,
    });
  }

  private emitSandboxTelemetry(
    call: MCPToolCall,
    context: ToolContext,
    result: MCPToolResult,
    startTime: number
  ): void {
    if (!this.telemetryHandler) {
      return;
    }

    const durationMs = Date.now() - startTime;
    const telemetry = this.sandboxAdapter.postflight(call, context, result, durationMs);
    this.telemetryHandler(telemetry);
  }

  private applyContextOverrides(context: ToolContext): ToolContext {
    if (!this.contextOverrides) {
      return context;
    }
    return { ...context, ...this.contextOverrides };
  }

  private prepareExecution(input: {
    call: MCPToolCall;
    tool: MCPTool | undefined;
    context: ToolContext;
    startTime: number;
    toolCallId: string;
    decisionId: string;
  }): ExecutionPreparationResult {
    const { call, tool, context, startTime, toolCallId, decisionId } = input;
    const policyDecision = this.evaluatePolicy(call, tool, context);

    if (!policyDecision.allowed) {
      const decision = this.createExecutionDecision({
        decisionId,
        toolName: call.name,
        toolCallId,
        taskNodeId: context.taskNodeId,
        allowed: false,
        requiresConfirmation: policyDecision.requiresConfirmation,
        reason: policyDecision.reason ?? "Permission denied",
        riskTags: policyDecision.riskTags,
        sandboxed: context.security.sandbox.type !== "none",
      });
      this.emitDecision(decision);

      const denied = this.createErrorResult(
        "PERMISSION_DENIED",
        policyDecision.reason ?? "Permission denied"
      );
      this.emitRecord(
        this.createExecutionRecord({
          toolCallId,
          toolName: call.name,
          taskNodeId: context.taskNodeId,
          status: "failed",
          durationMs: Date.now() - startTime,
          policyDecisionId: decisionId,
          sandboxed: decision.sandboxed,
          error: denied.error?.message ?? "Permission denied",
        })
      );
      this.recordDenied(call, startTime, policyDecision.reason);
      this.recordToolMetric(call.name, "error");
      this.emitSandboxTelemetry(call, context, denied, startTime);
      this.auditResult(call, context, denied);
      return { ok: false, result: denied };
    }

    const sandboxDecision = this.sandboxAdapter.preflight(call, context);
    if (!sandboxDecision.allowed) {
      const decision = this.createExecutionDecision({
        decisionId,
        toolName: call.name,
        toolCallId,
        taskNodeId: context.taskNodeId,
        allowed: false,
        requiresConfirmation: policyDecision.requiresConfirmation,
        reason: sandboxDecision.reason ?? "Sandbox policy violation",
        riskTags: mergeRiskTags(policyDecision.riskTags, sandboxDecision.riskTags),
        sandboxed: sandboxDecision.sandboxed,
        affectedPaths: sandboxDecision.affectedPaths,
      });
      this.emitDecision(decision);

      const denied = this.createErrorResult(
        "SANDBOX_VIOLATION",
        sandboxDecision.reason ?? "Sandbox policy violation"
      );
      this.emitRecord(
        this.createExecutionRecord({
          toolCallId,
          toolName: call.name,
          taskNodeId: context.taskNodeId,
          status: "failed",
          durationMs: Date.now() - startTime,
          affectedPaths: sandboxDecision.affectedPaths,
          policyDecisionId: decisionId,
          sandboxed: sandboxDecision.sandboxed,
          error: denied.error?.message ?? "Sandbox policy violation",
        })
      );
      this.recordToolMetric(call.name, "error");
      this.recordDuration(call.name, startTime);
      this.emitSandboxTelemetry(call, context, denied, startTime);
      this.auditResult(call, context, denied);
      return { ok: false, result: denied };
    }

    const executionDecision = this.createExecutionDecision({
      decisionId,
      toolName: call.name,
      toolCallId,
      taskNodeId: context.taskNodeId,
      allowed: true,
      requiresConfirmation: policyDecision.requiresConfirmation,
      reason: policyDecision.reason,
      riskTags: mergeRiskTags(policyDecision.riskTags, sandboxDecision.riskTags),
      sandboxed: sandboxDecision.sandboxed,
      affectedPaths: sandboxDecision.affectedPaths,
    });
    this.emitDecision(executionDecision);

    const rateResult = this.checkRateLimit(call, context);
    if (!rateResult.allowed) {
      const limited = this.createErrorResult(
        "RATE_LIMITED",
        `Rate limit exceeded. Retry after ${rateResult.resetInMs}ms.`
      );
      this.emitRecord(
        this.createExecutionRecord({
          toolCallId,
          toolName: call.name,
          taskNodeId: context.taskNodeId,
          status: "failed",
          durationMs: Date.now() - startTime,
          affectedPaths: sandboxDecision.affectedPaths,
          policyDecisionId: decisionId,
          sandboxed: sandboxDecision.sandboxed,
          error: limited.error?.message ?? "Rate limited",
        })
      );
      this.recordToolMetric(call.name, "error");
      this.recordDuration(call.name, startTime);
      this.emitSandboxTelemetry(call, context, limited, startTime);
      this.auditResult(call, context, limited);
      return { ok: false, result: limited };
    }

    this.emitRecord(
      this.createExecutionRecord({
        toolCallId,
        toolName: call.name,
        taskNodeId: context.taskNodeId,
        status: "started",
        durationMs: 0,
        affectedPaths: sandboxDecision.affectedPaths,
        policyDecisionId: decisionId,
        sandboxed: sandboxDecision.sandboxed,
      })
    );

    return { ok: true, sandboxDecision };
  }

  private checkRateLimit(call: MCPToolCall, context: ToolContext) {
    if (!this.rateLimiter) {
      return { allowed: true, remaining: -1, resetInMs: 0, limit: -1 };
    }
    return this.rateLimiter.checkAndConsume(call.name, context.userId);
  }

  private isCacheable(tool: MCPTool | undefined, call: MCPToolCall): boolean {
    if (!this.cache) {
      return false;
    }
    if (this.cachePredicate) {
      return this.cachePredicate(tool, call);
    }
    return tool?.annotations?.readOnly === true;
  }

  private auditCall(call: MCPToolCall, context: ToolContext): void {
    this.audit?.log({
      timestamp: Date.now(),
      toolName: call.name,
      action: "call",
      userId: context.userId,
      correlationId: context.correlationId,
      input: call.arguments,
      sandboxed: context.security.sandbox.type !== "none",
    });
  }

  private auditResult(call: MCPToolCall, context: ToolContext, result: MCPToolResult): void {
    this.audit?.log({
      timestamp: Date.now(),
      toolName: call.name,
      action: result.success ? "result" : "error",
      userId: context.userId,
      correlationId: context.correlationId,
      output: result.success ? result.content : result.error,
      sandboxed: context.security.sandbox.type !== "none",
    });
  }

  private recordToolMetric(
    toolName: string,
    status: "started" | "success" | "error" | "exception"
  ) {
    this.telemetry?.metrics.increment(AGENT_METRICS.toolCallsTotal.name, {
      tool_name: toolName,
      status,
    });
  }

  private recordDuration(toolName: string, startTime: number): void {
    this.telemetry?.metrics.observe(AGENT_METRICS.toolCallDuration.name, Date.now() - startTime, {
      tool_name: toolName,
    });
  }

  private recordDenied(call: MCPToolCall, startTime: number, _reason?: string): void {
    this.telemetry?.metrics.increment(AGENT_METRICS.permissionDenied.name, {
      tool_name: call.name,
      permission: "policy",
    });
    this.recordDuration(call.name, startTime);
  }

  private emitDecision(decision: ExecutionDecision): void {
    if (!this.executionObserver?.onDecision) {
      return;
    }
    try {
      this.executionObserver.onDecision(decision);
    } catch {
      // Ignore observer errors to avoid breaking execution.
    }
  }

  private emitRecord(record: ToolExecutionRecord): void {
    if (!this.executionObserver?.onRecord) {
      return;
    }
    try {
      this.executionObserver.onRecord(record);
    } catch {
      // Ignore observer errors to avoid breaking execution.
    }
  }

  private createExecutionDecision(
    input: Omit<ExecutionDecision, "decisionId"> & { decisionId: string }
  ): ExecutionDecision {
    return input;
  }

  private createExecutionRecord(record: ToolExecutionRecord): ToolExecutionRecord {
    return record;
  }

  private async executeWithRetry(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    if (!this.retryOptions) {
      return this.registry.callTool(call, context);
    }

    const result = await retry(() => this.registry.callTool(call, context), {
      ...this.retryOptions,
      signal: context.signal ?? this.retryOptions.signal,
    });

    if (result.success) {
      return result.result as MCPToolResult;
    }

    const message = result.error instanceof Error ? result.error.message : String(result.error);
    throw new Error(message);
  }

  private parseToolName(name: string): { tool: string; operation: string } {
    const parts = name.split(":");
    if (parts.length > 1) {
      return { tool: parts[0], operation: parts.slice(1).join(":") };
    }
    return { tool: name, operation: name };
  }

  private extractResource(call: MCPToolCall): string | undefined {
    const args = call.arguments as Record<string, unknown>;
    if (typeof args.path === "string") {
      return args.path;
    }
    if (typeof args.docId === "string") {
      return args.docId;
    }
    return undefined;
  }

  private createErrorResult(code: ToolError["code"], message: string): MCPToolResult {
    return {
      success: false,
      content: [{ type: "text", text: message }],
      error: { code, message },
    };
  }

  private resolveToolCallId(call: MCPToolCall): string {
    return call.id ?? this.generateId("call");
  }

  private resolveDecisionId(toolCallId: string): string {
    return `decision_${toolCallId}`;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function createToolExecutor(config: ToolExecutorConfig): ToolExecutor {
  return new ToolExecutionPipeline(config);
}

function mergeRiskTags(...tags: Array<string[] | undefined>): string[] | undefined {
  const set = new Set<string>();
  for (const group of tags) {
    if (!group) {
      continue;
    }
    for (const tag of group) {
      set.add(tag);
    }
  }
  return set.size > 0 ? Array.from(set) : undefined;
}
