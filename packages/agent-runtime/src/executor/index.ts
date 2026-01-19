/**
 * Tool Execution Pipeline
 *
 * Centralizes policy checks, auditing, rate limiting, caching, retry, and telemetry.
 */

import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import { AGENT_METRICS } from "@ku0/agent-runtime-telemetry/telemetry";
import type { IToolRegistry } from "@ku0/agent-runtime-tools";
import {
  createExecutionSandboxAdapter,
  type ExecutionSandboxAdapter,
  type ExecutionSandboxDecision,
  type ToolExecutionTelemetry,
} from "../sandbox";
import {
  createToolPolicyEngine,
  DEFAULT_PROMPT_INJECTION_POLICY,
  DefaultPromptInjectionGuard,
  type IPermissionChecker,
  type PromptInjectionAssessment,
  type PromptInjectionGuard,
  type PromptInjectionPolicy,
  shouldBlockPromptInjection,
  type ToolPolicyDecision,
  type ToolPolicyEngine,
} from "../security";
import type {
  AuditLogger,
  ExecutionDecision,
  JSONSchemaProperty,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  ToolContext,
  ToolError,
  ToolExecutionRecord,
  ToolExecutor,
} from "../types";
import type { ToolResultCache } from "../utils/cache";
import type { ToolRateLimiter } from "../utils/rateLimit";
import { type RetryOptions, retry } from "../utils/retry";

export type { ToolExecutor } from "../types";

export interface ToolExecutionObserver {
  onDecision?: (decision: ExecutionDecision, context: ToolContext) => void;
  onRecord?: (record: ToolExecutionRecord, context: ToolContext) => void;
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
  promptInjectionGuard?: PromptInjectionGuard;
  promptInjectionPolicy?: PromptInjectionPolicy;
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
  promptInjectionGuard?: PromptInjectionGuard;
  promptInjectionPolicy?: PromptInjectionPolicy;
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

type ValidationSchema = MCPTool["inputSchema"] | JSONSchemaProperty;
type ValidationPathSegment = string | number;
type ValidationType = MCPTool["inputSchema"]["type"];

export class ToolExecutionPipeline
  implements ToolExecutor, ToolConfirmationResolver, ToolConfirmationDetailsProvider
{
  private readonly registry: IToolRegistry;
  private readonly policyEngine: ToolPolicyEngine;
  private readonly sandboxAdapter: ExecutionSandboxAdapter;
  private readonly promptInjectionGuard: PromptInjectionGuard;
  private readonly promptInjectionPolicy: PromptInjectionPolicy;
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
    this.promptInjectionGuard = config.promptInjectionGuard ?? new DefaultPromptInjectionGuard();
    this.promptInjectionPolicy = config.promptInjectionPolicy ?? DEFAULT_PROMPT_INJECTION_POLICY;
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
          }),
          executionContext
        );
        this.recordToolMetric(call.name, "success");
        this.recordDuration(call.name, startTime);
        this.emitSandboxTelemetry(call, executionContext, cached, startTime);
        return cached;
      }
    }

    this.auditCall(call, executionContext);

    try {
      let result = await this.executeWithRetry(call, executionContext);
      result = this.applyPromptInjectionOutput(call, tool, executionContext, result);
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
        }),
        executionContext
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
        }),
        executionContext
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
    const cached = this.toolCache.get(callName);
    if (cached) {
      return cached;
    }

    const isQualified = callName.includes(":");
    const simpleName = isQualified ? callName.split(":")[1] : callName;
    if (!isQualified) {
      const cachedSimple = this.toolCache.get(simpleName);
      if (cachedSimple) {
        return cachedSimple;
      }
    }

    const tools = this.registry.listTools();

    if (isQualified) {
      const exact = tools.find((entry) => entry.name === callName);
      if (exact) {
        this.toolCache.set(callName, exact);

        return exact;
      }
    }

    const tool = tools.find((entry) => entry.name === simpleName);
    if (tool) {
      if (isQualified) {
        this.toolCache.set(callName, tool);
      }
      this.toolCache.set(simpleName, tool);
    }
    return tool;
  }

  private validateArguments(args: unknown, schema: MCPTool["inputSchema"]): ToolError | null {
    const error = this.validateValueAgainstSchema(args, schema, []);
    if (!error) {
      return null;
    }

    return {
      code: "INVALID_ARGUMENTS",
      message: error,
    };
  }

  private toArgumentRecord(args: unknown): Record<string, unknown> | null {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return null;
    }
    return args as Record<string, unknown>;
  }

  private validateValueAgainstSchema(
    value: unknown,
    schema: ValidationSchema,
    path: ValidationPathSegment[]
  ): string | null {
    if ("oneOf" in schema && schema.oneOf && schema.oneOf.length > 0) {
      const matches = schema.oneOf.some(
        (option) => this.validateValueAgainstSchema(value, option, path) === null
      );
      if (matches) {
        return null;
      }
      return `Invalid value for ${this.formatPath(path)}: does not match any allowed schema`;
    }

    if ("enum" in schema && schema.enum && schema.enum.length > 0) {
      if (typeof value !== "string" || !schema.enum.includes(value)) {
        return `Invalid value for ${this.formatPath(path)}: expected one of ${schema.enum.join(
          ", "
        )}`;
      }
    }

    const expectedType = this.resolveExpectedType(schema);
    if (!expectedType) {
      return null;
    }

    if (expectedType === "object") {
      return this.validateObject(value, schema, path);
    }

    if (expectedType === "array") {
      return this.validateArray(value, schema, path);
    }

    if (!this.checkType(value, expectedType)) {
      return this.invalidTypeMessage(path, expectedType);
    }

    return null;
  }

  private resolveExpectedType(schema: ValidationSchema): ValidationType | undefined {
    if (schema.type) {
      return schema.type;
    }
    if ("items" in schema && schema.items) {
      return "array";
    }
    if (schema.properties || schema.required) {
      return "object";
    }
    return undefined;
  }

  private validateObject(
    value: unknown,
    schema: ValidationSchema,
    path: ValidationPathSegment[]
  ): string | null {
    const record = this.toArgumentRecord(value);
    if (!record) {
      return this.invalidTypeMessage(path, "object");
    }

    const requiredError = this.validateRequiredFields(record, schema.required, path);
    if (requiredError) {
      return requiredError;
    }

    const properties = schema.properties ?? {};
    if (!this.allowsAdditionalProperties(schema)) {
      const unknownError = this.validateUnexpectedFields(record, properties, path);
      if (unknownError) {
        return unknownError;
      }
    }

    if (Object.keys(properties).length === 0) {
      return null;
    }

    return this.validateObjectProperties(record, properties, path);
  }

  private validateRequiredFields(
    record: Record<string, unknown>,
    required: string[] | undefined,
    path: ValidationPathSegment[]
  ): string | null {
    if (!required || required.length === 0) {
      return null;
    }

    for (const field of required) {
      if (!(field in record)) {
        return `Missing required argument: ${this.formatPath([...path, field])}`;
      }
    }

    return null;
  }

  private validateUnexpectedFields(
    record: Record<string, unknown>,
    properties: Record<string, JSONSchemaProperty>,
    path: ValidationPathSegment[]
  ): string | null {
    for (const key of Object.keys(record)) {
      if (!(key in properties)) {
        return `Unexpected argument: ${this.formatPath([...path, key])}`;
      }
    }
    return null;
  }

  private validateObjectProperties(
    record: Record<string, unknown>,
    properties: Record<string, JSONSchemaProperty>,
    path: ValidationPathSegment[]
  ): string | null {
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!(key in record)) {
        continue;
      }
      const error = this.validateValueAgainstSchema(record[key], propSchema, [...path, key]);
      if (error) {
        return error;
      }
    }
    return null;
  }

  private allowsAdditionalProperties(schema: ValidationSchema): boolean {
    return schema.additionalProperties !== false;
  }

  private validateArray(
    value: unknown,
    schema: ValidationSchema,
    path: ValidationPathSegment[]
  ): string | null {
    if (!Array.isArray(value)) {
      return this.invalidTypeMessage(path, "array");
    }

    if (!("items" in schema) || !schema.items) {
      return null;
    }

    for (let index = 0; index < value.length; index++) {
      const error = this.validateValueAgainstSchema(value[index], schema.items, [...path, index]);
      if (error) {
        return error;
      }
    }

    return null;
  }

  private invalidTypeMessage(path: ValidationPathSegment[], expectedType: ValidationType): string {
    if (path.length === 0 && expectedType === "object") {
      return "Arguments must be an object";
    }
    return `Invalid type for ${this.formatPath(path)}: expected ${expectedType}`;
  }

  private formatPath(path: ValidationPathSegment[]): string {
    if (path.length === 0) {
      return "arguments";
    }

    let output = "";
    for (const segment of path) {
      if (typeof segment === "number") {
        output += `[${segment}]`;
      } else {
        output = output ? `${output}.${segment}` : segment;
      }
    }
    return output;
  }

  private checkType(value: unknown, expectedType: ValidationType): boolean {
    switch (expectedType) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  private evaluatePolicy(
    call: MCPToolCall,
    tool: MCPTool | undefined,
    context: ToolContext
  ): ToolPolicyDecision {
    const toolServer = this.registry.resolveToolServer?.(call.name);
    const { tool: toolName, operation } = this.resolvePolicyTarget(call.name, toolServer);
    const resource = this.extractResource(call);

    return this.policyEngine.evaluate({
      call,
      tool: toolName,
      operation,
      resource,
      toolDefinition: tool,
      toolServer,
      context,
      taskNodeId: context.taskNodeId,
    });
  }

  private resolvePolicyTarget(
    callName: string,
    toolServer: string | undefined
  ): { tool: string; operation: string } {
    const parsed = this.parseToolName(callName);
    if (!callName.includes(":") && toolServer) {
      return { tool: toolServer, operation: parsed.operation };
    }
    return parsed;
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
      return this.handlePolicyDenied(
        policyDecision,
        call,
        context,
        startTime,
        toolCallId,
        decisionId
      );
    }

    const validationError = tool ? this.validateArguments(call.arguments, tool.inputSchema) : null;
    if (validationError) {
      return this.handleValidationFailure(
        validationError,
        policyDecision,
        call,
        context,
        startTime,
        toolCallId,
        decisionId
      );
    }

    const injectionAssessment = this.evaluatePromptInjectionInput(call, tool, context);
    if (injectionAssessment) {
      return this.handlePromptInjectionBlocked(
        injectionAssessment,
        policyDecision,
        call,
        context,
        startTime,
        toolCallId,
        decisionId
      );
    }

    const sandboxDecision = this.sandboxAdapter.preflight(call, context);
    if (!sandboxDecision.allowed) {
      return this.handleSandboxDenied(
        policyDecision,
        sandboxDecision,
        call,
        context,
        startTime,
        toolCallId,
        decisionId
      );
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
    this.emitDecision(executionDecision, context);

    const rateResult = this.checkRateLimit(call, context);
    if (!rateResult.allowed) {
      return this.handleRateLimitExceeded(
        rateResult.resetInMs,
        sandboxDecision,
        call,
        context,
        startTime,
        toolCallId,
        decisionId
      );
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
      }),
      context
    );

    return { ok: true, sandboxDecision };
  }

  private handleValidationFailure(
    validationError: ToolError,
    policyDecision: ToolPolicyDecision,
    call: MCPToolCall,
    context: ToolContext,
    startTime: number,
    toolCallId: string,
    decisionId: string
  ): ExecutionPreparationResult {
    const decision = this.createExecutionDecision({
      decisionId,
      toolName: call.name,
      toolCallId,
      taskNodeId: context.taskNodeId,
      allowed: false,
      requiresConfirmation: false,
      reason: validationError.message,
      riskTags: policyDecision.riskTags,
      sandboxed: context.security.sandbox.type !== "none",
    });
    this.emitDecision(decision, context);

    const invalidResult: MCPToolResult = {
      success: false,
      content: [{ type: "text", text: validationError.message }],
      error: validationError,
    };
    this.emitRecord(
      this.createExecutionRecord({
        toolCallId,
        toolName: call.name,
        taskNodeId: context.taskNodeId,
        status: "failed",
        durationMs: Date.now() - startTime,
        policyDecisionId: decisionId,
        sandboxed: decision.sandboxed,
        error: validationError.message,
      }),
      context
    );
    this.recordToolMetric(call.name, "error");
    this.recordDuration(call.name, startTime);
    this.auditResult(call, context, invalidResult);
    return { ok: false, result: invalidResult };
  }

  private handlePromptInjectionBlocked(
    assessment: PromptInjectionAssessment,
    policyDecision: ToolPolicyDecision,
    call: MCPToolCall,
    context: ToolContext,
    startTime: number,
    toolCallId: string,
    decisionId: string
  ): ExecutionPreparationResult {
    const message = `Prompt injection signals detected (${assessment.signals.join(", ")}).`;
    const decision = this.createExecutionDecision({
      decisionId,
      toolName: call.name,
      toolCallId,
      taskNodeId: context.taskNodeId,
      allowed: false,
      requiresConfirmation: false,
      reason: message,
      riskTags: policyDecision.riskTags,
      sandboxed: context.security.sandbox.type !== "none",
    });
    this.emitDecision(decision, context);

    const blocked = this.createErrorResult("PROMPT_INJECTION_BLOCKED", message, {
      signals: assessment.signals,
      risk: assessment.risk,
      source: assessment.source,
      truncated: assessment.truncated,
    });
    this.emitRecord(
      this.createExecutionRecord({
        toolCallId,
        toolName: call.name,
        taskNodeId: context.taskNodeId,
        status: "failed",
        durationMs: Date.now() - startTime,
        policyDecisionId: decisionId,
        sandboxed: decision.sandboxed,
        error: blocked.error?.message ?? "Prompt injection blocked",
      }),
      context
    );
    this.recordToolMetric(call.name, "error");
    this.recordDuration(call.name, startTime);
    this.auditResult(call, context, blocked);
    return { ok: false, result: blocked };
  }

  private handlePolicyDenied(
    policyDecision: ToolPolicyDecision,
    call: MCPToolCall,
    context: ToolContext,
    startTime: number,
    toolCallId: string,
    decisionId: string
  ): ExecutionPreparationResult {
    const escalation = policyDecision.escalation;
    const decision = this.createExecutionDecision({
      decisionId,
      toolName: call.name,
      toolCallId,
      taskNodeId: context.taskNodeId,
      allowed: false,
      requiresConfirmation: policyDecision.requiresConfirmation,
      reason: policyDecision.reason ?? "Permission denied",
      riskTags: policyDecision.riskTags,
      escalation,
      sandboxed: context.security.sandbox.type !== "none",
    });
    this.emitDecision(decision, context);

    const denied = this.createErrorResult(
      escalation ? "PERMISSION_ESCALATION_REQUIRED" : "PERMISSION_DENIED",
      policyDecision.reason ?? "Permission denied",
      escalation ? { escalation } : undefined
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
      }),
      context
    );
    this.recordDenied(call, startTime, policyDecision.reason);
    this.recordToolMetric(call.name, "error");
    this.emitSandboxTelemetry(call, context, denied, startTime);
    this.auditResult(call, context, denied);
    return { ok: false, result: denied };
  }

  private handleSandboxDenied(
    policyDecision: ToolPolicyDecision,
    sandboxDecision: ExecutionSandboxDecision,
    call: MCPToolCall,
    context: ToolContext,
    startTime: number,
    toolCallId: string,
    decisionId: string
  ): ExecutionPreparationResult {
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
    this.emitDecision(decision, context);

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
      }),
      context
    );
    this.recordToolMetric(call.name, "error");
    this.recordDuration(call.name, startTime);
    this.emitSandboxTelemetry(call, context, denied, startTime);
    this.auditResult(call, context, denied);
    return { ok: false, result: denied };
  }

  private evaluatePromptInjectionInput(
    call: MCPToolCall,
    tool: MCPTool | undefined,
    context: ToolContext
  ): PromptInjectionAssessment | null {
    if (!this.promptInjectionPolicy.enabled) {
      return null;
    }
    const result = this.promptInjectionGuard.assessInput(
      call,
      tool,
      context,
      this.promptInjectionPolicy
    );
    if (!result) {
      return null;
    }
    if (!shouldBlockPromptInjection(result.assessment, this.promptInjectionPolicy)) {
      return null;
    }
    return result.assessment;
  }

  private applyPromptInjectionOutput(
    call: MCPToolCall,
    tool: MCPTool | undefined,
    context: ToolContext,
    result: MCPToolResult
  ): MCPToolResult {
    if (!this.promptInjectionPolicy.enabled || !result.success) {
      return result;
    }

    const assessment = this.promptInjectionGuard.assessOutput(
      call,
      tool,
      result,
      context,
      this.promptInjectionPolicy
    );
    if (!assessment) {
      return result;
    }
    if (!shouldBlockPromptInjection(assessment.assessment, this.promptInjectionPolicy)) {
      return result;
    }

    const message = `Prompt injection signals detected (${assessment.assessment.signals.join(
      ", "
    )}).`;
    return this.createErrorResult("PROMPT_INJECTION_BLOCKED", message, {
      signals: assessment.assessment.signals,
      risk: assessment.assessment.risk,
      source: assessment.assessment.source,
      truncated: assessment.assessment.truncated,
    });
  }

  private handleRateLimitExceeded(
    resetInMs: number,
    sandboxDecision: ExecutionSandboxDecision,
    call: MCPToolCall,
    context: ToolContext,
    startTime: number,
    toolCallId: string,
    decisionId: string
  ): ExecutionPreparationResult {
    const limited = this.createErrorResult(
      "RATE_LIMITED",
      `Rate limit exceeded. Retry after ${resetInMs}ms.`
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
      }),
      context
    );
    this.recordToolMetric(call.name, "error");
    this.recordDuration(call.name, startTime);
    this.emitSandboxTelemetry(call, context, limited, startTime);
    this.auditResult(call, context, limited);
    return { ok: false, result: limited };
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

  private emitDecision(decision: ExecutionDecision, context: ToolContext): void {
    if (!this.executionObserver?.onDecision) {
      return;
    }
    try {
      this.executionObserver.onDecision(decision, context);
    } catch {
      // Ignore observer errors to avoid breaking execution.
    }
  }

  private emitRecord(record: ToolExecutionRecord, context: ToolContext): void {
    if (!this.executionObserver?.onRecord) {
      return;
    }
    try {
      this.executionObserver.onRecord(record, context);
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
    const args = this.toArgumentRecord(call.arguments);
    if (!args) {
      return undefined;
    }
    if (typeof args.path === "string") {
      return args.path;
    }
    if (typeof args.docId === "string") {
      return args.docId;
    }
    return undefined;
  }

  private createErrorResult(
    code: ToolError["code"],
    message: string,
    details?: ToolError["details"]
  ): MCPToolResult {
    return {
      success: false,
      content: [{ type: "text", text: message }],
      error: { code, message, details },
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
