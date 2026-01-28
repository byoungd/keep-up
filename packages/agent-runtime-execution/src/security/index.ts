/**
 * Security Module
 *
 * Provides security policies, permission checking, and audit logging
 * for the agent runtime.
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import { AGENT_METRICS, type TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import type {
  AuditEntry,
  AuditFilter,
  AuditLogger,
  ExecutionPolicy,
  PermissionEscalation,
  ResourceLimits,
  SandboxConfig,
  SecurityPolicy,
  ToolExecutionContext,
  ToolGovernancePolicyAction,
  ToolGovernancePolicyRule,
  ToolGovernanceRuleCondition,
  ToolPermissions,
  ToolPolicyContext,
  ToolPolicyDecision,
  ToolPolicyEngine,
  ToolSafetyChecker,
  ToolSafetyCheckerLike,
  ToolSafetyCheckResult,
} from "../types";
import { SECURITY_PRESETS, type SecurityPreset } from "../types";
import { CoworkToolPolicyAdapter } from "./coworkPolicyAdapter";

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
      case "vision":
        return { allowed: true, requiresConfirmation: false };
      case "bash":
        return this.checkBashPermission(operation);
      case "file":
        return this.checkFilePermission(operation, check.resource);
      case "code":
        return this.checkCodePermission(operation);
      case "computer":
        return this.checkComputerPermission(operation);
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

  private checkComputerPermission(operation: string): PermissionResult {
    const permission = this.policy.permissions.computer ?? "disabled";
    const normalized = operation.toLowerCase();
    const isScreenCapture = normalized === "screenshot" || normalized === "screen";
    const isInteraction = !isScreenCapture;

    switch (permission) {
      case "disabled":
        return {
          allowed: false,
          reason: "Computer use is disabled",
          escalation: this.buildEscalation("computer", "observe"),
        };
      case "observe":
        if (isScreenCapture) {
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: "Computer control is disabled",
          escalation: this.buildEscalation("computer", "control"),
        };
      case "control":
        return {
          allowed: true,
          requiresConfirmation: isInteraction,
          riskTags: isInteraction ? ["computer:input"] : undefined,
        };
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
  return new CoworkToolPolicyAdapter(new PermissionPolicyEngine(checker));
}

const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = "batch";
const DEFAULT_ALLOWED_TOOLS = ["*"];
const DEFAULT_INTERACTIVE_APPROVAL_TOOLS = ["bash:execute"];
const DEFAULT_GOVERNANCE_ACTION: ToolGovernancePolicyAction = "allow";

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
  const governanceRules = overrides?.governanceRules ?? [];
  const governanceDefaultAction = overrides?.governanceDefaultAction ?? DEFAULT_GOVERNANCE_ACTION;
  const safetyCheckers = overrides?.safetyCheckers;
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
    governanceRules,
    governanceDefaultAction,
    safetyCheckers,
    nodeCache,
  };
}

export class ToolGovernancePolicyEngine implements ToolPolicyEngine {
  constructor(
    private readonly base: ToolPolicyEngine,
    private readonly defaults: ToolExecutionContext
  ) {}

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: policy evaluation branches
  evaluate(context: ToolPolicyContext): ToolPolicyDecision {
    const baseDecision = this.base.evaluate(context);
    if (!baseDecision.allowed) {
      return baseDecision;
    }

    if (isCompletionToolCall(context)) {
      return baseDecision;
    }

    const executionContext = context.context.toolExecution ?? this.defaults;
    const toolNames = resolveToolNameCandidates(context);
    const requiresApproval = mergeToolPatterns(
      executionContext.policy === "interactive" ? DEFAULT_INTERACTIVE_APPROVAL_TOOLS : [],
      executionContext.requiresApproval
    );

    if (!isAnyToolAllowed(toolNames, executionContext.allowedTools)) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Tool "${context.call.name}" not allowed by execution policy`,
        reasonCode: "policy:allowlist",
        riskTags: mergeRiskTags(baseDecision.riskTags, ["policy:allowlist"]),
        policyDecision: "deny",
        policyRuleId: "execution:allowlist",
        policyAction: baseDecision.policyAction,
        escalation: baseDecision.escalation,
      };
    }

    const governanceOutcome = evaluateGovernanceRules(
      executionContext.governanceRules,
      executionContext.governanceDefaultAction,
      context,
      toolNames
    );

    if (governanceOutcome?.action === "deny") {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: governanceOutcome.reason ?? baseDecision.reason ?? "Tool denied by policy rule",
        reasonCode: governanceOutcome.reasonCode ?? baseDecision.reasonCode ?? "policy:rule",
        riskTags: mergeRiskTags(baseDecision.riskTags, governanceOutcome.riskTags),
        policyDecision: "deny",
        policyRuleId: governanceOutcome.ruleId ?? baseDecision.policyRuleId,
        policyAction: baseDecision.policyAction,
        escalation: baseDecision.escalation,
      };
    }

    const safetyDecision = evaluateSafetyCheckers(executionContext.safetyCheckers, context);
    if (safetyDecision?.decision === "deny") {
      const safetyRuleId = safetyDecision.checkerId
        ? `safety:${safetyDecision.checkerId}`
        : baseDecision.policyRuleId;
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: safetyDecision.reason ?? "Tool denied by safety checker",
        reasonCode: safetyDecision.reasonCode ?? "policy:safety",
        riskTags: mergeRiskTags(baseDecision.riskTags, safetyDecision.riskTags, ["policy:safety"]),
        policyDecision: "deny",
        policyRuleId: safetyRuleId,
        policyAction: baseDecision.policyAction,
        escalation: baseDecision.escalation,
      };
    }

    const approvalRequired = isAnyToolAllowed(toolNames, requiresApproval);
    const governanceRequiresApproval = governanceOutcome?.action === "ask_user";
    const safetyRequiresApproval = safetyDecision?.decision === "ask_user";
    const requiresConfirmation =
      baseDecision.requiresConfirmation ||
      approvalRequired ||
      governanceRequiresApproval ||
      safetyRequiresApproval;
    const approvalReason = approvalRequired
      ? "Tool requires approval by execution policy"
      : undefined;
    const reasonCandidates = [
      baseDecision.requiresConfirmation ? baseDecision.reason : undefined,
      governanceRequiresApproval ? governanceOutcome?.reason : undefined,
      safetyRequiresApproval ? safetyDecision?.reason : undefined,
      approvalReason,
      baseDecision.reason,
      governanceOutcome?.reason,
      safetyDecision?.reason,
    ];
    const reason = reasonCandidates.find((candidate) => candidate);
    const reasonCodeCandidates = [
      baseDecision.requiresConfirmation ? baseDecision.reasonCode : undefined,
      governanceRequiresApproval ? governanceOutcome?.reasonCode : undefined,
      safetyRequiresApproval ? safetyDecision?.reasonCode : undefined,
      approvalRequired ? "policy:approval" : undefined,
      baseDecision.reasonCode,
      governanceOutcome?.reasonCode,
      safetyDecision?.reasonCode,
    ];
    const reasonCode = reasonCodeCandidates.find((candidate) => candidate);
    const safetyTags =
      safetyDecision && safetyDecision.decision !== "allow"
        ? mergeRiskTags(safetyDecision.riskTags, ["policy:safety"])
        : safetyDecision?.riskTags;
    const approvalTags =
      approvalRequired || governanceRequiresApproval || safetyRequiresApproval
        ? ["policy:approval"]
        : undefined;
    let policyRuleId = baseDecision.policyRuleId;
    if (governanceOutcome?.ruleId && (governanceOutcome.action !== "allow" || !policyRuleId)) {
      policyRuleId = governanceOutcome.ruleId;
    }
    if (safetyDecision?.decision === "ask_user" && safetyDecision.checkerId) {
      policyRuleId = `safety:${safetyDecision.checkerId}`;
    }
    const policyDecision = requiresConfirmation
      ? "allow_with_confirm"
      : (baseDecision.policyDecision ?? "allow");

    return {
      allowed: true,
      requiresConfirmation,
      reason,
      reasonCode,
      riskTags: mergeRiskTags(
        baseDecision.riskTags,
        governanceOutcome?.riskTags,
        approvalTags,
        safetyTags
      ),
      policyDecision,
      policyRuleId,
      policyAction: baseDecision.policyAction,
      escalation: baseDecision.escalation,
    };
  }
}

export function createToolGovernancePolicyEngine(
  base: ToolPolicyEngine,
  defaults: ToolExecutionContext
): ToolPolicyEngine {
  return new ToolGovernancePolicyEngine(base, defaults);
}

type GovernanceOutcome = {
  action: ToolGovernancePolicyAction;
  ruleId?: string;
  reason?: string;
  reasonCode?: string;
  riskTags?: string[];
};

const GOVERNANCE_DEFAULT_REASON_CODE = "policy:default";

function evaluateGovernanceRules(
  rules: ToolGovernancePolicyRule[] | undefined,
  defaultAction: ToolGovernancePolicyAction | undefined,
  context: ToolPolicyContext,
  toolNames: string[]
): GovernanceOutcome | undefined {
  const normalizedRules = normalizeGovernanceRules(rules);
  for (const rule of normalizedRules) {
    if (governanceRuleMatches(rule, context, toolNames)) {
      return buildGovernanceOutcome(rule);
    }
  }

  if (!defaultAction || defaultAction === "allow") {
    return undefined;
  }

  return {
    action: defaultAction,
    ruleId: "policy:default",
    reason:
      defaultAction === "deny"
        ? "Tool blocked by governance default policy"
        : "Tool requires approval by governance default policy",
    reasonCode: GOVERNANCE_DEFAULT_REASON_CODE,
    riskTags: mergeRiskTags(["policy:default", `policy:action:${defaultAction}`]),
  };
}

function normalizeGovernanceRules(
  rules: ToolGovernancePolicyRule[] | undefined
): ToolGovernancePolicyRule[] {
  if (!rules || rules.length === 0) {
    return [];
  }
  return [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function governanceRuleMatches(
  rule: ToolGovernancePolicyRule,
  context: ToolPolicyContext,
  toolNames: string[]
): boolean {
  const patterns = resolveGovernanceToolPatterns(rule);
  if (patterns.length > 0) {
    let matched = false;
    for (const name of toolNames) {
      if (isToolAllowed(name, patterns)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      return false;
    }
  }

  if (!rule.conditions || rule.conditions.length === 0) {
    return true;
  }

  return rule.conditions.every((condition) =>
    evaluateGovernanceCondition(condition, context.call.arguments)
  );
}

function resolveGovernanceToolPatterns(rule: ToolGovernancePolicyRule): string[] {
  const patterns = new Set<string>();
  for (const entry of rule.tools ?? []) {
    const trimmed = entry.trim();
    if (trimmed) {
      patterns.add(trimmed);
    }
  }
  for (const entry of rule.toolPatterns ?? []) {
    const trimmed = entry.trim();
    if (trimmed) {
      patterns.add(trimmed);
    }
  }
  if (rule.tool) {
    const trimmed = rule.tool.trim();
    if (trimmed) {
      patterns.add(trimmed);
    }
  }
  return Array.from(patterns);
}

function buildGovernanceOutcome(rule: ToolGovernancePolicyRule): GovernanceOutcome {
  return {
    action: rule.action,
    ruleId: rule.id,
    reason: rule.reason,
    reasonCode: rule.reasonCode ?? rule.id,
    riskTags: mergeRiskTags(rule.riskTags, [
      "policy:rule",
      `policy:rule:${rule.id}`,
      `policy:action:${rule.action}`,
    ]),
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: policy condition evaluation branches
function evaluateGovernanceCondition(
  condition: ToolGovernanceRuleCondition,
  args: unknown
): boolean {
  if (!args || typeof args !== "object") {
    return false;
  }
  const value = resolveArgumentValue(args as Record<string, unknown>, condition.path);
  switch (condition.operator) {
    case "equals":
      return Object.is(value, condition.value);
    case "contains":
      if (typeof value === "string" && typeof condition.value === "string") {
        return value.includes(condition.value);
      }
      if (Array.isArray(value)) {
        return value.includes(condition.value);
      }
      return false;
    case "matches":
      if (typeof value !== "string") {
        return false;
      }
      if (condition.value instanceof RegExp) {
        return condition.value.test(value);
      }
      try {
        return new RegExp(String(condition.value)).test(value);
      } catch {
        return false;
      }
    case "lessThan":
      return typeof value === "number" && typeof condition.value === "number"
        ? value < condition.value
        : false;
    case "greaterThan":
      return typeof value === "number" && typeof condition.value === "number"
        ? value > condition.value
        : false;
    default:
      return false;
  }
}

function resolveArgumentValue(args: Record<string, unknown>, path: string): unknown {
  if (!path) {
    return undefined;
  }
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  let current: unknown = args;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current) && isNumericSegment(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function isNumericSegment(segment: string): boolean {
  return segment !== "" && Number.isInteger(Number(segment));
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

type NormalizedSafetyChecker = {
  id: string;
  check: ToolSafetyChecker;
  onError: ToolSafetyCheckResult["decision"];
  riskTags?: string[];
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: policy checker evaluation branches
function evaluateSafetyCheckers(
  checkers: ToolSafetyCheckerLike[] | undefined,
  context: ToolPolicyContext
): ToolSafetyCheckResult | undefined {
  if (!checkers || checkers.length === 0) {
    return undefined;
  }

  const normalized = normalizeSafetyCheckers(checkers);
  let askUser: ToolSafetyCheckResult | undefined;

  for (const checker of normalized) {
    try {
      const result = checker.check(context);
      if (!result) {
        continue;
      }
      const resolved = resolveSafetyResult(result, checker);
      if (resolved.decision === "deny") {
        return resolved;
      }
      if (resolved.decision === "ask_user" && !askUser) {
        askUser = resolved;
      }
    } catch (error) {
      const decision = checker.onError ?? "deny";
      const fallback: ToolSafetyCheckResult = {
        decision,
        reason: error instanceof Error ? error.message : String(error),
        reasonCode: "policy:safety_error",
        riskTags: mergeRiskTags(checker.riskTags, ["policy:safety"]),
        checkerId: checker.id,
      };
      if (decision === "deny") {
        return fallback;
      }
      if (decision === "ask_user" && !askUser) {
        askUser = fallback;
      }
    }
  }

  return askUser;
}

function normalizeSafetyCheckers(checkers: ToolSafetyCheckerLike[]): NormalizedSafetyChecker[] {
  return checkers.map((checker, index) => {
    if (typeof checker === "function") {
      return {
        id: `checker_${index + 1}`,
        check: checker,
        onError: "deny",
      };
    }
    return {
      id: checker.id || `checker_${index + 1}`,
      check: checker.check,
      onError: checker.onError ?? "deny",
      riskTags: checker.riskTags,
    };
  });
}

function resolveSafetyResult(
  result: ToolSafetyCheckResult,
  checker: NormalizedSafetyChecker
): ToolSafetyCheckResult {
  const checkerId = result.checkerId ?? checker.id;
  const reasonCode =
    result.reasonCode ?? (checkerId ? `policy:safety:${checkerId}` : "policy:safety");
  const decisionTags =
    result.decision === "allow"
      ? mergeRiskTags(result.riskTags, checker.riskTags)
      : mergeRiskTags(result.riskTags, checker.riskTags, ["policy:safety"]);

  return {
    ...result,
    checkerId,
    reasonCode,
    riskTags: decisionTags,
  };
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

export interface AuditTelemetryOptions {
  eventBus?: RuntimeEventBus;
  telemetry?: TelemetryContext;
  source?: string;
}

export interface AuditLoggerOptions extends AuditTelemetryOptions {
  maxEntries?: number;
  delegate?: AuditLogger;
}

const AUDIT_TELEMETRY_WRAPPED = Symbol.for("ku0.audit.telemetry");

class TelemetryAuditLogger implements AuditLogger {
  private readonly base: AuditLogger;
  private readonly eventBus?: RuntimeEventBus;
  private readonly telemetry?: TelemetryContext;
  private readonly source: string;

  constructor(base: AuditLogger, options: AuditTelemetryOptions) {
    this.base = base;
    this.eventBus = options.eventBus;
    this.telemetry = options.telemetry;
    this.source = options.source ?? "audit";
    (this as unknown as { [AUDIT_TELEMETRY_WRAPPED]?: boolean })[AUDIT_TELEMETRY_WRAPPED] = true;
  }

  log(entry: AuditEntry): void {
    this.base.log(entry);
    this.emitEvent(entry);
    this.recordMetrics(entry);
    this.recordTrace(entry);
  }

  getEntries(filter?: AuditFilter): AuditEntry[] {
    return this.base.getEntries(filter);
  }

  private emitEvent(entry: AuditEntry): void {
    if (!this.eventBus) {
      return;
    }
    try {
      this.eventBus.emit("audit:entry", entry, {
        source: this.source,
        correlationId: entry.correlationId,
        priority: "low",
      });
    } catch {
      // Avoid breaking audit logging if telemetry hooks fail.
    }
  }

  private recordMetrics(entry: AuditEntry): void {
    if (!this.telemetry) {
      return;
    }
    this.telemetry.metrics.increment(AGENT_METRICS.auditEntriesTotal.name, {
      tool_name: entry.toolName,
      action: entry.action,
    });
    if (entry.action === "policy" && entry.policyDecision) {
      this.telemetry.metrics.increment(AGENT_METRICS.auditPolicyDecisionsTotal.name, {
        tool_name: entry.toolName,
        decision: entry.policyDecision,
      });
    }
  }

  private recordTrace(entry: AuditEntry): void {
    const tracer = this.telemetry?.tracer;
    if (!tracer) {
      return;
    }
    const span = tracer.getActiveSpan();
    if (!span) {
      return;
    }
    span.addEvent("audit:entry", {
      "audit.tool": entry.toolName,
      "audit.action": entry.action,
      "audit.sandboxed": entry.sandboxed,
      "audit.hasError": entry.action === "error" || Boolean(entry.error),
      ...(entry.policyDecision ? { "audit.policyDecision": entry.policyDecision } : {}),
      ...(entry.riskScore !== undefined ? { "audit.riskScore": entry.riskScore } : {}),
      ...(entry.durationMs !== undefined ? { "audit.durationMs": entry.durationMs } : {}),
    });
  }
}

export function withAuditTelemetry(
  logger: AuditLogger,
  options: AuditTelemetryOptions
): AuditLogger {
  if (!options.eventBus && !options.telemetry) {
    return logger;
  }
  const wrapped = logger as unknown as { [AUDIT_TELEMETRY_WRAPPED]?: boolean };
  if (wrapped[AUDIT_TELEMETRY_WRAPPED]) {
    return logger;
  }
  return new TelemetryAuditLogger(logger, options);
}

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
    computer: "disabled",
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

  /** Set computer permission */
  withComputerPermission(permission: ToolPermissions["computer"]): this {
    this.permissions.computer = permission;
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
export function createAuditLogger(options?: number | AuditLoggerOptions): AuditLogger {
  const resolved = typeof options === "number" ? { maxEntries: options } : (options ?? {});
  const { delegate, maxEntries, ...telemetryOptions } = resolved;
  const base = delegate ?? new InMemoryAuditLogger(maxEntries);
  return withAuditTelemetry(base, telemetryOptions);
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

export type {
  ToolGovernancePolicyAction,
  ToolGovernancePolicyRule,
  ToolGovernanceRuleCondition,
  ToolPolicyContext,
  ToolPolicyDecision,
  ToolPolicyEngine,
  ToolSafetyChecker,
  ToolSafetyCheckerLike,
  ToolSafetyCheckResult,
} from "../types";

export {
  type ApprovalAuditLogger,
  type ApprovalHandler,
  type ApprovalKind,
  ApprovalManager,
  type ApprovalManagerConfig,
  type ApprovalRecord,
  type ApprovalRequestOptions,
  type SecurityApprovalDecision,
  type SecurityApprovalStatus,
} from "./approvalManager";
export { CoworkToolPolicyAdapter } from "./coworkPolicyAdapter";
export {
  DEFAULT_PROMPT_INJECTION_POLICY,
  DefaultPromptInjectionGuard,
  type PromptInjectionAssessment,
  type PromptInjectionGuard,
  type PromptInjectionGuardResult,
  type PromptInjectionPolicy,
  type PromptInjectionPolicyOverride,
  type PromptInjectionRisk,
  resolvePromptInjectionPolicy,
  shouldBlockPromptInjection,
} from "./promptInjection";
