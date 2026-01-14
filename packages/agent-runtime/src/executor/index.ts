/**
 * Tool Execution Pipeline
 *
 * Centralizes policy checks, auditing, rate limiting, caching, retry, and telemetry.
 */

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
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  ToolContext,
  ToolError,
} from "../types";
import type { ToolResultCache } from "../utils/cache";
import type { ToolRateLimiter } from "../utils/rateLimit";
import { type RetryOptions, retry } from "../utils/retry";

export interface ToolExecutor {
  execute(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult>;
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
  audit?: AuditLogger;
  telemetry?: TelemetryContext;
  rateLimiter?: ToolRateLimiter;
  cache?: ToolResultCache;
  retryOptions?: RetryOptions;
  cachePredicate?: CachePredicate;
  contextOverrides?: Partial<ToolContext>;
}

export class ToolExecutionPipeline
  implements ToolExecutor, ToolConfirmationResolver, ToolConfirmationDetailsProvider
{
  private readonly registry: IToolRegistry;
  private readonly policyEngine: ToolPolicyEngine;
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
    this.recordToolMetric(call.name, "started");

    const tool = this.resolveTool(call.name);
    const policyDecision = this.evaluatePolicy(call, tool, executionContext);
    if (!policyDecision.allowed) {
      const denied = this.createErrorResult(
        "PERMISSION_DENIED",
        policyDecision.reason ?? "Permission denied"
      );
      this.recordDenied(call, startTime, policyDecision.reason);
      this.recordToolMetric(call.name, "error");
      this.auditResult(call, executionContext, denied);
      return denied;
    }

    const rateResult = this.checkRateLimit(call, executionContext);
    if (!rateResult.allowed) {
      const limited = this.createErrorResult(
        "RATE_LIMITED",
        `Rate limit exceeded. Retry after ${rateResult.resetInMs}ms.`
      );
      this.recordToolMetric(call.name, "error");
      this.recordDuration(call.name, startTime);
      this.auditResult(call, executionContext, limited);
      return limited;
    }

    const cacheable = this.isCacheable(tool, call);
    if (cacheable && this.cache) {
      const cached = this.cache.get(call.name, call.arguments) as MCPToolResult | undefined;
      if (cached) {
        this.recordToolMetric(call.name, "success");
        this.recordDuration(call.name, startTime);
        return cached;
      }
    }

    this.auditCall(call, executionContext);

    try {
      const result = await this.executeWithRetry(call, executionContext);
      this.recordToolMetric(call.name, result.success ? "success" : "error");
      this.recordDuration(call.name, startTime);

      if (cacheable && this.cache && result.success) {
        this.cache.set(call.name, call.arguments, result);
      }

      this.auditResult(call, executionContext, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exceptionResult = this.createErrorResult("EXECUTION_FAILED", message);
      this.recordToolMetric(call.name, "exception");
      this.recordDuration(call.name, startTime);
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

  private applyContextOverrides(context: ToolContext): ToolContext {
    if (!this.contextOverrides) {
      return context;
    }
    return { ...context, ...this.contextOverrides };
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
}

export function createToolExecutor(config: ToolExecutorConfig): ToolExecutor {
  return new ToolExecutionPipeline(config);
}
