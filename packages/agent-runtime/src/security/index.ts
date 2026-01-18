/**
 * Security Module
 *
 * Provides security policies, permission checking, and audit logging
 * for the agent runtime.
 */

import type {
  AuditEntry,
  AuditFilter,
  AuditLogger,
  ExecutionPolicy,
  MCPTool,
  MCPToolCall,
  PermissionEscalation,
  ResourceLimits,
  SandboxConfig,
  SecurityPolicy,
  ToolContext,
  ToolExecutionContext,
  ToolPermissions,
} from "../types";
import { SECURITY_PRESETS, type SecurityPreset } from "../types";

// ============================================================================
// Permission Checker
// ============================================================================

export interface IPermissionChecker {
  /** Check if an operation is allowed */
  check(operation: PermissionCheck): PermissionResult;
  /** Get current policy */
  getPolicy(): SecurityPolicy;
}

export interface PermissionCheck {
  tool: string;
  operation: string;
  resource?: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  riskTags?: string[];
  escalation?: PermissionEscalation;
}

/**
 * Default permission checker implementation.
 */
export class PermissionChecker implements IPermissionChecker {
  private policy: SecurityPolicy;

  constructor(policy: SecurityPolicy) {
    this.policy = policy;
  }

  check(check: PermissionCheck): PermissionResult {
    const { tool, operation } = check;

    // Check tool-specific permissions
    switch (tool) {
      case "completion":
      case "complete_task":
        return { allowed: true, requiresConfirmation: false };
      case "bash":
        return this.checkBashPermission(operation);
      case "file":
        return this.checkFilePermission(operation, check.resource);
      case "code":
        return this.checkCodePermission(operation);
      case "lfcc":
        return this.checkLFCCPermission(operation);
      default:
        // Unknown tools default to checking network permission
        return this.checkNetworkPermission();
    }
  }

  getPolicy(): SecurityPolicy {
    return this.policy;
  }

  updatePolicy(policy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  private checkBashPermission(_operation: string): PermissionResult {
    const permission = this.policy.permissions.bash;

    switch (permission) {
      case "disabled":
        return {
          allowed: false,
          reason: "Bash execution is disabled",
          escalation: this.buildEscalation("bash", "sandbox"),
        };
      case "confirm":
        return { allowed: true, requiresConfirmation: true };
      case "sandbox":
        return { allowed: true, requiresConfirmation: false };
      case "full":
        return { allowed: true };
      default:
        return { allowed: false, reason: "Unknown permission level" };
    }
  }

  private checkFilePermission(operation: string, resource?: string): PermissionResult {
    const permission = this.policy.permissions.file;
    const isWrite = ["write", "delete", "create"].includes(operation);

    switch (permission) {
      case "none":
        return {
          allowed: false,
          reason: "File access is disabled",
          escalation: this.buildEscalation("file", isWrite ? "workspace" : "read", resource),
        };
      case "read":
        if (isWrite) {
          return {
            allowed: false,
            reason: "File write access is disabled",
            escalation: this.buildEscalation("file", "workspace", resource),
          };
        }
        return { allowed: true };
      case "workspace":
      case "home":
      case "full":
        return { allowed: true, requiresConfirmation: isWrite };
      default:
        return { allowed: false, reason: "Unknown permission level" };
    }
  }

  private checkCodePermission(_operation: string): PermissionResult {
    const permission = this.policy.permissions.code;

    switch (permission) {
      case "disabled":
        return {
          allowed: false,
          reason: "Code execution is disabled",
          escalation: this.buildEscalation("code", "sandbox"),
        };
      case "sandbox":
        return { allowed: true, requiresConfirmation: true };
      case "full":
        return { allowed: true };
      default:
        return { allowed: false, reason: "Unknown permission level" };
    }
  }

  private checkLFCCPermission(operation: string): PermissionResult {
    const permission = this.policy.permissions.lfcc;
    const isWrite = ["write", "insert", "update", "delete"].some((op) => operation.includes(op));

    switch (permission) {
      case "none":
        return {
          allowed: false,
          reason: "Document access is disabled",
          escalation: this.buildEscalation("lfcc", isWrite ? "write" : "read"),
        };
      case "read":
        if (isWrite) {
          return {
            allowed: false,
            reason: "Document write access is disabled",
            escalation: this.buildEscalation("lfcc", "write"),
          };
        }
        return { allowed: true };
      case "write":
      case "admin":
        return { allowed: true };
      default:
        return { allowed: false, reason: "Unknown permission level" };
    }
  }

  private checkNetworkPermission(): PermissionResult {
    const permission = this.policy.permissions.network;

    switch (permission) {
      case "none":
        return {
          allowed: false,
          reason: "Network access is disabled",
          escalation: this.buildEscalation("network", "allowlist"),
        };
      case "allowlist":
        return { allowed: true, requiresConfirmation: true };
      case "full":
        return { allowed: true };
      default:
        return { allowed: false, reason: "Unknown permission level" };
    }
  }

  private buildEscalation(
    permission: PermissionEscalation["permission"],
    level: PermissionEscalation["level"],
    resource?: string
  ): PermissionEscalation {
    return {
      permission,
      level,
      resource,
    };
  }
}

// ============================================================================
// Tool Policy Engine
// ============================================================================

export interface ToolPolicyContext {
  call: MCPToolCall;
  tool: string;
  operation: string;
  resource?: string;
  toolDefinition?: MCPTool;
  toolServer?: string;
  context: ToolContext;
  taskNodeId?: string;
}

export interface ToolPolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  riskTags?: string[];
  escalation?: PermissionEscalation;
}

export interface ToolPolicyEngine {
  evaluate(context: ToolPolicyContext): ToolPolicyDecision;
}

export class PermissionPolicyEngine implements ToolPolicyEngine {
  private readonly checker: IPermissionChecker;

  constructor(checker: IPermissionChecker) {
    this.checker = checker;
  }

  evaluate(context: ToolPolicyContext): ToolPolicyDecision {
    const result = this.checker.check({
      tool: context.tool,
      operation: context.operation,
      resource: context.resource,
    });

    return {
      allowed: result.allowed,
      requiresConfirmation: result.requiresConfirmation ?? false,
      reason: result.reason,
      riskTags: result.riskTags,
      escalation: result.escalation,
    };
  }
}

export function createToolPolicyEngine(checker: IPermissionChecker): ToolPolicyEngine {
  return new PermissionPolicyEngine(checker);
}

const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = "batch";
const DEFAULT_ALLOWED_TOOLS = ["*"];
const DEFAULT_INTERACTIVE_APPROVAL_TOOLS = ["bash:execute"];

export function resolveToolExecutionContext(
  overrides: Partial<ToolExecutionContext> | undefined,
  security: SecurityPolicy
): ToolExecutionContext {
  const policy = overrides?.policy ?? DEFAULT_EXECUTION_POLICY;
  const allowedTools = overrides?.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
  const requiresApproval = mergeToolPatterns(
    policy === "interactive" ? DEFAULT_INTERACTIVE_APPROVAL_TOOLS : [],
    overrides?.requiresApproval ?? []
  );
  const maxParallel = Math.max(
    1,
    overrides?.maxParallel ?? security.limits.maxConcurrentCalls ?? 5
  );
  const approvalTimeoutMs = overrides?.approvalTimeoutMs;
  const nodeCache = overrides?.nodeCache
    ? {
        enabled: overrides.nodeCache.enabled,
        ttlMs: overrides.nodeCache.ttlMs,
        includePolicyContext: overrides.nodeCache.includePolicyContext,
      }
    : { enabled: false };

  return {
    policy,
    allowedTools,
    requiresApproval,
    maxParallel,
    approvalTimeoutMs,
    nodeCache,
  };
}

export class ToolGovernancePolicyEngine implements ToolPolicyEngine {
  constructor(
    private readonly base: ToolPolicyEngine,
    private readonly defaults: ToolExecutionContext
  ) {}

  evaluate(context: ToolPolicyContext): ToolPolicyDecision {
    const baseDecision = this.base.evaluate(context);
    if (!baseDecision.allowed) {
      return baseDecision;
    }

    if (isCompletionToolCall(context)) {
      return baseDecision;
    }

    const executionContext = context.context.toolExecution ?? this.defaults;
    const requiresApproval = mergeToolPatterns(
      executionContext.policy === "interactive" ? DEFAULT_INTERACTIVE_APPROVAL_TOOLS : [],
      executionContext.requiresApproval
    );
    const toolNames = resolveToolNameCandidates(context);

    if (!isAnyToolAllowed(toolNames, executionContext.allowedTools)) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Tool "${context.call.name}" not allowed by execution policy`,
        riskTags: mergeRiskTags(baseDecision.riskTags, ["policy:allowlist"]),
      };
    }

    const approvalRequired = isAnyToolAllowed(toolNames, requiresApproval);
    const requiresConfirmation = baseDecision.requiresConfirmation || approvalRequired;
    const reason =
      baseDecision.reason ??
      (approvalRequired ? "Tool requires approval by execution policy" : undefined);

    return {
      allowed: true,
      requiresConfirmation,
      reason,
      riskTags: mergeRiskTags(
        baseDecision.riskTags,
        approvalRequired ? ["policy:approval"] : undefined
      ),
    };
  }
}

export function createToolGovernancePolicyEngine(
  base: ToolPolicyEngine,
  defaults: ToolExecutionContext
): ToolPolicyEngine {
  return new ToolGovernancePolicyEngine(base, defaults);
}

function mergeToolPatterns(...lists: string[][]): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    for (const entry of list) {
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      set.add(trimmed);
    }
  }
  return Array.from(set);
}

function isToolAllowed(toolName: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  for (const pattern of patterns) {
    if (matchesToolPattern(toolName, pattern)) {
      return true;
    }
  }
  return false;
}

function matchesToolPattern(toolName: string, pattern: string): boolean {
  const normalizedTool = toolName.toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern === "*") {
    return true;
  }
  if (normalizedPattern.endsWith(":*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedTool.startsWith(prefix);
  }
  return normalizedTool === normalizedPattern;
}

function resolveToolNameCandidates(context: ToolPolicyContext): string[] {
  const names = new Set<string>();
  names.add(context.call.name);
  if (context.toolServer) {
    names.add(`${context.toolServer}:${context.operation}`);
  }
  return Array.from(names);
}

function isCompletionToolCall(context: ToolPolicyContext): boolean {
  if (context.operation !== "complete_task") {
    return false;
  }
  return (
    context.tool === "completion" ||
    context.toolServer === "completion" ||
    context.call.name === "complete_task"
  );
}

function isAnyToolAllowed(toolNames: string[], patterns: string[]): boolean {
  for (const toolName of toolNames) {
    if (isToolAllowed(toolName, patterns)) {
      return true;
    }
  }
  return false;
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

// ============================================================================
// Audit Logger Implementation
// ============================================================================

/**
 * In-memory audit logger.
 * For production, replace with persistent storage.
 */
export class InMemoryAuditLogger implements AuditLogger {
  private entries: AuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  log(entry: AuditEntry): void {
    this.entries.push(entry);

    // Trim if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  getEntries(filter?: AuditFilter): AuditEntry[] {
    let result = [...this.entries];

    if (filter) {
      if (filter.toolName) {
        result = result.filter((e) => e.toolName === filter.toolName);
      }
      if (filter.userId) {
        result = result.filter((e) => e.userId === filter.userId);
      }
      if (filter.correlationId) {
        result = result.filter((e) => e.correlationId === filter.correlationId);
      }
      if (filter.since) {
        const since = filter.since;
        result = result.filter((e) => e.timestamp >= since);
      }
      if (filter.until) {
        const until = filter.until;
        result = result.filter((e) => e.timestamp <= until);
      }
      if (filter.action) {
        result = result.filter((e) => e.action === filter.action);
      }
    }

    return result;
  }

  clear(): void {
    this.entries = [];
  }

  getStats(): { total: number; byTool: Record<string, number>; byAction: Record<string, number> } {
    const byTool: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    for (const entry of this.entries) {
      byTool[entry.toolName] = (byTool[entry.toolName] ?? 0) + 1;
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
    }

    return { total: this.entries.length, byTool, byAction };
  }
}

// ============================================================================
// Security Policy Builder
// ============================================================================

/**
 * Fluent builder for creating security policies.
 */
export class SecurityPolicyBuilder {
  private sandbox: SandboxConfig = {
    type: "process",
    networkAccess: "none",
    fsIsolation: "workspace",
  };

  private permissions: ToolPermissions = {
    bash: "disabled",
    file: "read",
    code: "disabled",
    network: "none",
    lfcc: "read",
  };

  private limits: ResourceLimits = {
    maxExecutionTimeMs: 30_000,
    maxMemoryBytes: 256 * 1024 * 1024,
    maxOutputBytes: 1024 * 1024,
    maxConcurrentCalls: 3,
  };

  /** Start from a preset */
  static fromPreset(preset: SecurityPreset): SecurityPolicyBuilder {
    const builder = new SecurityPolicyBuilder();
    const presetConfig = SECURITY_PRESETS[preset];

    builder.sandbox = { ...presetConfig.sandbox };
    builder.permissions = { ...presetConfig.permissions };
    builder.limits = { ...presetConfig.limits };

    return builder;
  }

  /** Set sandbox type */
  withSandbox(type: SandboxConfig["type"]): this {
    this.sandbox.type = type;
    return this;
  }

  /** Set network access */
  withNetworkAccess(access: SandboxConfig["networkAccess"], hosts?: string[]): this {
    this.sandbox.networkAccess = access;
    if (hosts) {
      this.sandbox.allowedHosts = hosts;
    }
    return this;
  }

  /** Set filesystem isolation */
  withFsIsolation(isolation: SandboxConfig["fsIsolation"]): this {
    this.sandbox.fsIsolation = isolation;
    return this;
  }

  /** Set working directory */
  withWorkingDirectory(dir: string): this {
    this.sandbox.workingDirectory = dir;
    return this;
  }

  /** Set bash permission */
  withBashPermission(permission: ToolPermissions["bash"]): this {
    this.permissions.bash = permission;
    return this;
  }

  /** Set file permission */
  withFilePermission(permission: ToolPermissions["file"]): this {
    this.permissions.file = permission;
    return this;
  }

  /** Set code permission */
  withCodePermission(permission: ToolPermissions["code"]): this {
    this.permissions.code = permission;
    return this;
  }

  /** Set network permission */
  withNetworkPermission(permission: ToolPermissions["network"]): this {
    this.permissions.network = permission;
    return this;
  }

  /** Set LFCC permission */
  withLFCCPermission(permission: ToolPermissions["lfcc"]): this {
    this.permissions.lfcc = permission;
    return this;
  }

  /** Set execution time limit */
  withTimeLimit(ms: number): this {
    this.limits.maxExecutionTimeMs = ms;
    return this;
  }

  /** Set memory limit */
  withMemoryLimit(bytes: number): this {
    this.limits.maxMemoryBytes = bytes;
    return this;
  }

  /** Set output size limit */
  withOutputLimit(bytes: number): this {
    this.limits.maxOutputBytes = bytes;
    return this;
  }

  /** Set concurrent calls limit */
  withConcurrencyLimit(max: number): this {
    this.limits.maxConcurrentCalls = max;
    return this;
  }

  /** Build the security policy */
  build(): SecurityPolicy {
    return {
      sandbox: { ...this.sandbox },
      permissions: { ...this.permissions },
      limits: { ...this.limits },
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a permission checker with the given policy.
 */
export function createPermissionChecker(policy: SecurityPolicy): IPermissionChecker {
  return new PermissionChecker(policy);
}

/**
 * Create an in-memory audit logger.
 */
export function createAuditLogger(maxEntries?: number): AuditLogger {
  return new InMemoryAuditLogger(maxEntries);
}

/**
 * Create a security policy from a preset.
 */
export function createSecurityPolicy(preset: SecurityPreset): SecurityPolicy {
  return { ...SECURITY_PRESETS[preset] };
}

/**
 * Create a security policy builder.
 */
export function securityPolicy(): SecurityPolicyBuilder {
  return new SecurityPolicyBuilder();
}

export {
  type ApprovalDecision,
  type ApprovalHandler,
  type ApprovalKind,
  ApprovalManager,
  type ApprovalRecord,
  type ApprovalRequestOptions,
  type ApprovalStatus,
} from "./approvalManager";
export {
  DEFAULT_PROMPT_INJECTION_POLICY,
  DefaultPromptInjectionGuard,
  type PromptInjectionAssessment,
  type PromptInjectionGuard,
  type PromptInjectionGuardResult,
  type PromptInjectionPolicy,
  type PromptInjectionRisk,
  shouldBlockPromptInjection,
} from "./promptInjection";
