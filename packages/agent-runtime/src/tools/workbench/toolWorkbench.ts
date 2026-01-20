import { spawn } from "node:child_process";
import type {
  AuditLogger,
  ConfirmationHandler,
  ConfirmationRequest,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  SecurityPolicy,
  ToolContext,
  ToolError,
  ToolErrorCode,
  ToolExecutionContext,
  ToolPolicyDecision,
  ToolPolicyEngine,
  ToolRegistryScope,
} from "@ku0/agent-runtime-core";
import {
  createToolDiscoveryEngine,
  createToolRegistry,
  createToolRegistryView,
  type HookConfig,
  type HookInput,
  type HookResult,
  type IToolRegistry,
  type ToolDiscoveryEngine,
  type ToolSearchCriteria,
  type ToolSearchResult,
} from "@ku0/agent-runtime-tools";
import {
  type ToolConfirmationDetailsProvider,
  type ToolConfirmationResolver,
  ToolExecutionPipeline,
} from "../../executor";
import {
  ApprovalManager,
  createPermissionChecker,
  createSecurityPolicy,
  createToolPolicyEngine,
  type IPermissionChecker,
} from "../../security";
import type { ICheckpointManager } from "../../types";
import {
  ToolWorkbenchPolicyEngine,
  type WorkbenchHookContext,
  type WorkbenchPolicyConfig,
  type WorkbenchPolicyState,
} from "./policyEngine";
import { createIsolatedToolRegistry } from "./registry";
import { StaticToolSource, type ToolWorkbenchSource } from "./sources";

export interface ToolWorkbenchConfig {
  registry?: IToolRegistry;
  toolServers?: MCPToolServer[];
  sources?: ToolWorkbenchSource[];
  registryScope?: ToolRegistryScope;
  allowedTools?: string[];
  policy?: WorkbenchPolicyConfig;
  policyEngine?: ToolPolicyEngine;
  permissionChecker?: IPermissionChecker;
  securityPolicy?: SecurityPolicy;
  audit?: AuditLogger;
  hooks?: HookConfig[];
  checkpointManager?: ICheckpointManager;
  checkpointId?: string;
  confirmationHandler?: ConfirmationHandler;
  approvalManager?: ApprovalManager;
  approvalTimeoutMs?: number;
  toolExecutionContext?: ToolExecutionContext;
  contextFactory?: (call: MCPToolCall) => ToolContext;
}

export interface ToolWorkbenchCallOptions {
  context?: ToolContext;
  confirmationHandler?: ConfirmationHandler;
  approvalTimeoutMs?: number;
}

export interface ToolWorkbenchState {
  version: 1;
  policy?: WorkbenchPolicyState;
  usageCounts: Record<string, number>;
}

export class ToolWorkbench {
  private readonly baseRegistry: IToolRegistry;
  private readonly registry: IToolRegistry;
  private readonly executor: ToolExecutionPipeline;
  private readonly policyEngine?: ToolPolicyEngine;
  private readonly workbenchPolicyEngine?: ToolWorkbenchPolicyEngine;
  private readonly hooks: HookConfig[];
  private readonly sources: ToolWorkbenchSource[];
  private readonly checkpointManager?: ICheckpointManager;
  private readonly checkpointId?: string;
  private readonly approvalManager?: ApprovalManager;
  private readonly confirmationHandler?: ConfirmationHandler;
  private readonly approvalTimeoutMs?: number;
  private readonly toolExecutionContext?: ToolExecutionContext;
  private readonly contextFactory?: (call: MCPToolCall) => ToolContext;
  private readonly securityPolicy: SecurityPolicy;
  private readonly usageCounts = new Map<string, number>();
  private initPromise?: Promise<void>;

  constructor(config: ToolWorkbenchConfig = {}) {
    const securityPolicy = config.securityPolicy ?? createSecurityPolicy("balanced");
    const permissionChecker = config.permissionChecker ?? createPermissionChecker(securityPolicy);

    const baseRegistry = config.registry
      ? createIsolatedToolRegistry(config.registry)
      : createToolRegistry();

    const registryScope =
      config.registryScope ??
      (config.allowedTools ? { allowedTools: config.allowedTools } : undefined);
    const scopedRegistry = registryScope
      ? createToolRegistryView(baseRegistry, registryScope)
      : baseRegistry;

    const sources = [...(config.sources ?? [])];
    if (config.toolServers && config.toolServers.length > 0) {
      sources.unshift(new StaticToolSource(config.toolServers, "configured"));
    }

    const basePolicyEngine = config.policyEngine ?? createToolPolicyEngine(permissionChecker);
    const workbenchPolicyEngine = config.policy
      ? new ToolWorkbenchPolicyEngine(config.policy, {
          base: basePolicyEngine,
          audit: config.audit,
        })
      : undefined;
    const policyEngine = workbenchPolicyEngine ?? basePolicyEngine;

    this.baseRegistry = baseRegistry;
    this.registry = scopedRegistry;
    this.sources = sources;
    this.policyEngine = policyEngine;
    this.workbenchPolicyEngine = workbenchPolicyEngine;
    this.executor = new ToolExecutionPipeline({
      registry: this.registry,
      policy: permissionChecker,
      policyEngine,
      audit: config.audit,
    });
    this.hooks = config.hooks ?? [];
    this.checkpointManager = config.checkpointManager;
    this.checkpointId = config.checkpointId;
    this.confirmationHandler = config.confirmationHandler;
    this.approvalManager =
      config.approvalManager ?? (config.confirmationHandler ? new ApprovalManager() : undefined);
    this.approvalTimeoutMs = config.approvalTimeoutMs;
    this.toolExecutionContext = config.toolExecutionContext;
    this.contextFactory = config.contextFactory;
    this.securityPolicy = securityPolicy;
  }

  async listTools(): Promise<MCPTool[]> {
    await this.ensureInitialized();
    return this.registry.listTools();
  }

  async list_tools(): Promise<MCPTool[]> {
    return this.listTools();
  }

  async callTool(
    name: string,
    params: Record<string, unknown> = {},
    options: ToolWorkbenchCallOptions = {}
  ): Promise<MCPToolResult> {
    await this.ensureInitialized();

    const call: MCPToolCall = { name, arguments: params };
    const context = this.buildContext(call, options.context);
    const preResult = await this.runHooks(
      "PreToolUse",
      {
        preToolUse: { toolName: name, parameters: params },
      },
      name,
      context
    );

    if (preResult.cancel) {
      return buildErrorResult(
        "PERMISSION_DENIED",
        preResult.errorMessage ?? "Tool call cancelled by hook"
      );
    }

    if (preResult.errorMessage) {
      return buildErrorResult("EXECUTION_FAILED", preResult.errorMessage);
    }

    const finalParams = normalizeParams(preResult.modifiedParams, params);
    const finalCall: MCPToolCall = { name, arguments: finalParams };

    if (this.requiresConfirmation(finalCall, context)) {
      const approved = await this.requestConfirmation(finalCall, context, options);
      if (!approved) {
        return buildErrorResult("PERMISSION_DENIED", "Tool execution not approved");
      }
    }

    const result = await this.executor.execute(finalCall, context);
    this.recordUsage(name);

    await this.runHooks(
      "PostToolUse",
      {
        postToolUse: {
          toolName: name,
          parameters: finalParams,
          result,
          success: result.success,
          executionTimeMs: result.meta?.durationMs ?? 0,
        },
      },
      name,
      context
    );

    if (!result.success) {
      const message = result.error?.message ?? "Tool execution failed";
      await this.runHooks(
        "OnError",
        { onError: { toolName: name, error: new Error(message) } },
        name,
        context
      );
    }

    return result;
  }

  async call_tool(
    name: string,
    params: Record<string, unknown> = {},
    options: ToolWorkbenchCallOptions = {}
  ): Promise<MCPToolResult> {
    return this.callTool(name, params, options);
  }

  async saveState(): Promise<ToolWorkbenchState> {
    const usageCounts = Object.fromEntries(this.usageCounts.entries());
    const state: ToolWorkbenchState = {
      version: 1,
      usageCounts,
      policy: this.workbenchPolicyEngine?.saveState(),
    };

    if (this.checkpointManager && this.checkpointId) {
      await this.checkpointManager.updateMetadata(this.checkpointId, {
        workbench: state,
      });
    }

    return state;
  }

  async save_state(): Promise<ToolWorkbenchState> {
    return this.saveState();
  }

  async loadState(state: ToolWorkbenchState): Promise<void> {
    if (state.version !== 1) {
      return;
    }

    this.usageCounts.clear();
    for (const [toolName, count] of Object.entries(state.usageCounts)) {
      const numericCount = typeof count === "number" ? count : Number(count);
      if (Number.isFinite(numericCount)) {
        this.usageCounts.set(toolName, numericCount);
      }
    }

    if (state.policy && this.workbenchPolicyEngine) {
      this.workbenchPolicyEngine.loadState(state.policy);
    }
  }

  async load_state(state: ToolWorkbenchState): Promise<void> {
    return this.loadState(state);
  }

  async discoverTools(criteria: ToolSearchCriteria): Promise<ToolSearchResult[]> {
    await this.ensureInitialized();
    const discovery = this.buildDiscoveryEngine();
    return discovery.search(criteria);
  }

  async getToolDefinitions(): Promise<MCPTool[]> {
    return this.listTools();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    if (this.sources.length === 0) {
      return;
    }

    const registered = new Set<string>();

    for (const source of this.sources) {
      const servers = await source.load();
      for (const server of servers) {
        if (registered.has(server.name)) {
          continue;
        }
        registered.add(server.name);
        await this.baseRegistry.register(server);
      }
    }
  }

  private buildDiscoveryEngine(): ToolDiscoveryEngine {
    const discovery = createToolDiscoveryEngine();
    discovery.registerServer(new RegistryToolServerAdapter(this.registry));
    return discovery;
  }

  private buildContext(call: MCPToolCall, override?: ToolContext): ToolContext {
    const base = this.contextFactory?.(call) ?? { security: this.securityPolicy };
    const security = base.security ?? this.securityPolicy;
    return {
      ...base,
      ...override,
      security,
      toolExecution: override?.toolExecution ?? base.toolExecution ?? this.toolExecutionContext,
    };
  }

  private requiresConfirmation(call: MCPToolCall, context: ToolContext): boolean {
    if (isToolConfirmationResolver(this.executor)) {
      return this.executor.requiresConfirmation(call, context);
    }
    return false;
  }

  private getConfirmationDetails(
    call: MCPToolCall,
    context: ToolContext
  ): {
    reason?: string;
    reasonCode?: string;
    riskTags?: string[];
  } {
    if (isToolConfirmationDetailsProvider(this.executor)) {
      return this.executor.getConfirmationDetails(call, context);
    }
    return {};
  }

  private async requestConfirmation(
    call: MCPToolCall,
    context: ToolContext,
    options: ToolWorkbenchCallOptions
  ): Promise<boolean> {
    const handler = options.confirmationHandler ?? this.confirmationHandler;
    if (!handler) {
      return false;
    }

    const details = this.getConfirmationDetails(call, context);
    const request: ConfirmationRequest = {
      toolName: call.name,
      description: `Execute ${call.name}`,
      arguments: call.arguments,
      risk: "medium",
      reason: details.reason,
      reasonCode: details.reasonCode,
      riskTags: details.riskTags,
      taskNodeId: context.taskNodeId,
    };

    if (this.approvalManager) {
      const timeoutMs = options.approvalTimeoutMs ?? this.approvalTimeoutMs;
      const decision = await this.approvalManager.request(
        "tool",
        request,
        handler,
        timeoutMs ? { timeoutMs } : undefined
      );
      return decision.approved;
    }

    return handler(request);
  }

  private async runHooks(
    type: HookConfig["type"],
    input: HookInput,
    toolName: string,
    context: ToolContext
  ): Promise<HookResult> {
    const matching = this.getMatchingHooks(type, toolName);
    if (matching.length === 0) {
      return {};
    }

    return this.executeHooks(matching, input, toolName, context);
  }

  private getMatchingHooks(type: HookConfig["type"], toolName: string): HookConfig[] {
    if (this.hooks.length === 0) {
      return [];
    }

    return this.hooks.filter(
      (hook) => hook.type === type && matchesHookPattern(toolName, hook.toolPatterns)
    );
  }

  private async executeHooks(
    hooks: HookConfig[],
    input: HookInput,
    toolName: string,
    context: ToolContext
  ): Promise<HookResult> {
    let combined: HookResult = {};

    for (const hook of hooks) {
      const result = await this.evaluateAndRunHook(hook, input, toolName, context);
      combined = mergeHookResults(combined, result);
      if (result.cancel) {
        break;
      }
    }

    return combined;
  }

  private async evaluateAndRunHook(
    hook: HookConfig,
    input: HookInput,
    toolName: string,
    context: ToolContext
  ): Promise<HookResult> {
    const decision = this.evaluateHookPolicy(hook, toolName, input, context);
    if (!decision.allowed) {
      return buildHookDeniedResult(hook, decision);
    }

    if (decision.requiresConfirmation) {
      const approved = await this.requestHookApproval(hook, toolName, decision, context);
      if (!approved) {
        return buildHookDeniedResult(hook, decision);
      }
    }

    return executeHookCommand(hook, input);
  }

  private evaluateHookPolicy(
    hook: HookConfig,
    toolName: string,
    input: HookInput,
    context: ToolContext
  ): ToolPolicyDecision {
    const engine = resolveHookPolicyEngine(this.workbenchPolicyEngine, this.policyEngine);
    if (!engine) {
      return { allowed: true, requiresConfirmation: false };
    }

    const parameters = input.preToolUse?.parameters ?? input.postToolUse?.parameters ?? undefined;

    const hookContext: WorkbenchHookContext = {
      hookType: hook.type,
      toolName,
      hookName: hook.name,
      command: hook.command,
      parameters: isRecord(parameters) ? parameters : undefined,
    };

    return engine.evaluateHook(hookContext, context);
  }

  private async requestHookApproval(
    hook: HookConfig,
    toolName: string,
    decision: ToolPolicyDecision,
    context: ToolContext
  ): Promise<boolean> {
    if (!this.confirmationHandler && !this.approvalManager) {
      return false;
    }

    const request: ConfirmationRequest = {
      toolName: `hook:${hook.name}`,
      description: `Run ${hook.type} hook for ${toolName}`,
      arguments: { toolName, hook: hook.name },
      risk: "low",
      reason: decision.reason,
      reasonCode: decision.reasonCode,
      riskTags: decision.riskTags,
      taskNodeId: context.taskNodeId,
    };

    const handler = this.confirmationHandler;
    if (!handler) {
      return false;
    }

    if (this.approvalManager) {
      const decisionResult = await this.approvalManager.request(
        "tool",
        request,
        handler,
        this.approvalTimeoutMs ? { timeoutMs: this.approvalTimeoutMs } : undefined
      );
      return decisionResult.approved;
    }

    return handler(request);
  }

  private recordUsage(toolName: string): void {
    const current = this.usageCounts.get(toolName) ?? 0;
    this.usageCounts.set(toolName, current + 1);
  }
}

class RegistryToolServerAdapter implements MCPToolServer {
  readonly name = "registry";
  readonly description = "Registry-backed tool server for discovery";

  constructor(private readonly registry: IToolRegistry) {}

  listTools(): MCPTool[] {
    return this.registry.listTools();
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    return this.registry.callTool(call, context);
  }
}

function isToolConfirmationResolver(
  executor: ToolExecutionPipeline
): executor is ToolExecutionPipeline & ToolConfirmationResolver {
  return (
    typeof (executor as { requiresConfirmation?: unknown }).requiresConfirmation === "function"
  );
}

function isToolConfirmationDetailsProvider(
  executor: ToolExecutionPipeline
): executor is ToolExecutionPipeline & ToolConfirmationDetailsProvider {
  return (
    typeof (executor as { getConfirmationDetails?: unknown }).getConfirmationDetails === "function"
  );
}

function resolveHookPolicyEngine(
  primary?: ToolWorkbenchPolicyEngine,
  fallback?: ToolPolicyEngine
): (ToolPolicyEngine & { evaluateHook: ToolWorkbenchPolicyEngine["evaluateHook"] }) | undefined {
  if (primary) {
    return primary;
  }
  if (fallback && typeof (fallback as { evaluateHook?: unknown }).evaluateHook === "function") {
    return fallback as ToolPolicyEngine & {
      evaluateHook: ToolWorkbenchPolicyEngine["evaluateHook"];
    };
  }
  return undefined;
}

function buildErrorResult(
  code: ToolErrorCode,
  message: string,
  details?: ToolError["details"]
): MCPToolResult {
  return {
    success: false,
    content: [{ type: "text", text: message }],
    error: { code, message, details },
  };
}

function normalizeParams(
  modifiedParams: unknown,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  if (modifiedParams && typeof modifiedParams === "object" && !Array.isArray(modifiedParams)) {
    return modifiedParams as Record<string, unknown>;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function matchesHookPattern(toolName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === "*") {
      return true;
    }
    if (pattern.endsWith("*")) {
      return toolName.startsWith(pattern.slice(0, -1));
    }
    return toolName === pattern;
  });
}

function mergeHookResults(existing: HookResult, next: HookResult): HookResult {
  const contextModification = [existing.contextModification, next.contextModification]
    .filter(Boolean)
    .join("\n");

  return {
    ...existing,
    ...next,
    contextModification: contextModification || undefined,
  };
}

function buildHookDeniedResult(hook: HookConfig, decision: ToolPolicyDecision): HookResult {
  const message = decision.reason ?? "Hook blocked by policy";
  if (hook.isCancellable) {
    return { cancel: true, errorMessage: message };
  }
  return {};
}

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

async function executeHookCommand(hook: HookConfig, input: HookInput): Promise<HookResult> {
  const payload = JSON.stringify(input);
  const result = await execWithTimeout(hook.command, payload, hook.timeoutMs);

  if (result.timedOut) {
    return { errorMessage: `Hook ${hook.name} timed out after ${hook.timeoutMs}ms` };
  }

  if (result.exitCode !== 0 && result.stderr) {
    return { errorMessage: result.stderr.trim() };
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    return {};
  }

  try {
    return JSON.parse(stdout) as HookResult;
  } catch {
    return { contextModification: stdout };
  }
}

function execWithTimeout(command: string, input: string, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
