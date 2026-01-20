import path from "node:path";
import type {
  AuditLogger,
  MCPToolCall,
  ToolContext,
  ToolPolicyContext,
  ToolPolicyDecision,
  ToolPolicyEngine,
} from "@ku0/agent-runtime-core";
import type { HookConfig } from "@ku0/agent-runtime-tools";

export type WorkbenchPolicyAction = "allow" | "deny" | "ask";
export type WorkbenchPolicyTarget = "tool" | "hook";

export interface WorkbenchPolicyCondition {
  type: "path" | "content" | "size" | "risk";
  operator: "equals" | "contains" | "matches" | "lessThan" | "greaterThan";
  value: string | number | RegExp;
}

export interface WorkbenchPolicyRule {
  id: string;
  target?: WorkbenchPolicyTarget;
  action: WorkbenchPolicyAction;
  tools?: string[];
  hooks?: string[];
  toolPatterns?: string[];
  conditions?: WorkbenchPolicyCondition[];
  priority?: number;
  reason?: string;
  reasonCode?: string;
}

export interface WorkbenchPolicyConfig {
  rules?: WorkbenchPolicyRule[];
  defaultAction?: WorkbenchPolicyAction;
  hookDefaultAction?: WorkbenchPolicyAction;
  autoApproveTools?: string[];
  pathAllowlist?: string[];
  pathSafeguardAction?: Exclude<WorkbenchPolicyAction, "allow">;
  cacheDecisions?: boolean;
  caseInsensitivePaths?: boolean;
}

export interface WorkbenchPolicyState {
  version: 1;
  decisions: CachedPolicyDecision[];
}

export type WorkbenchHookType = HookConfig["type"];

export interface WorkbenchHookContext {
  hookType: WorkbenchHookType;
  toolName: string;
  hookName: string;
  command: string;
  parameters?: Record<string, unknown>;
}

export interface WorkbenchPolicyEngineOptions {
  base?: ToolPolicyEngine;
  audit?: AuditLogger;
  clock?: () => number;
}

type PolicyOutcome = {
  action: WorkbenchPolicyAction;
  reason?: string;
  reasonCode?: string;
  ruleId?: string;
  riskTags?: string[];
};

type CachedPolicyDecision = {
  key: string;
  action: WorkbenchPolicyAction;
  reason?: string;
  reasonCode?: string;
  ruleId?: string;
  riskTags?: string[];
  updatedAt: number;
};

const DEFAULT_TOOL_ACTION: WorkbenchPolicyAction = "ask";
const DEFAULT_HOOK_ACTION: WorkbenchPolicyAction = "allow";
const DEFAULT_PATH_SAFEGUARD_ACTION: Exclude<WorkbenchPolicyAction, "allow"> = "ask";

const PATH_POLICY_CODE = "path_outside_allowlist";
const AUTO_APPROVE_CODE = "auto_approve_allowlist";
const DEFAULT_POLICY_CODE = "default_policy";

export class ToolWorkbenchPolicyEngine implements ToolPolicyEngine {
  private readonly rules: WorkbenchPolicyRule[];
  private readonly autoApproveTools: string[];
  private readonly defaultAction: WorkbenchPolicyAction;
  private readonly hookDefaultAction: WorkbenchPolicyAction;
  private readonly pathAllowlist: string[];
  private readonly pathSafeguardAction: Exclude<WorkbenchPolicyAction, "allow">;
  private readonly decisionCacheEnabled: boolean;
  private readonly caseInsensitivePaths: boolean;
  private readonly decisionCache = new Map<string, CachedPolicyDecision>();
  private readonly base: ToolPolicyEngine;
  private readonly audit?: AuditLogger;
  private readonly clock: () => number;

  constructor(config: WorkbenchPolicyConfig = {}, options: WorkbenchPolicyEngineOptions = {}) {
    this.rules = [...(config.rules ?? [])].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.autoApproveTools = normalizePatterns(config.autoApproveTools ?? []);
    this.defaultAction = config.defaultAction ?? DEFAULT_TOOL_ACTION;
    this.hookDefaultAction = config.hookDefaultAction ?? DEFAULT_HOOK_ACTION;
    this.pathAllowlist = normalizePatterns(config.pathAllowlist ?? []);
    this.pathSafeguardAction = config.pathSafeguardAction ?? DEFAULT_PATH_SAFEGUARD_ACTION;
    this.decisionCacheEnabled = config.cacheDecisions ?? true;
    this.caseInsensitivePaths = config.caseInsensitivePaths ?? false;
    this.base = options.base ?? {
      evaluate: () => ({ allowed: true, requiresConfirmation: false }),
    };
    this.audit = options.audit;
    this.clock = options.clock ?? (() => Date.now());
  }

  evaluate(context: ToolPolicyContext): ToolPolicyDecision {
    const baseDecision = this.base.evaluate(context);
    if (!baseDecision.allowed) {
      this.logDecision(context.call.name, baseDecision, context.context);
      return baseDecision;
    }

    const outcome = this.resolveCachedOutcome(buildDecisionKey("tool", context.call), () =>
      this.evaluateToolOutcome(context.call)
    );

    const decision = mergePolicyDecision(baseDecision, outcome);
    this.logDecision(context.call.name, decision, context.context);

    return decision;
  }

  evaluateHook(hookContext: WorkbenchHookContext, toolContext: ToolContext): ToolPolicyDecision {
    const outcome = this.resolveCachedOutcome(buildHookDecisionKey(hookContext), () =>
      this.evaluateHookOutcome(hookContext)
    );
    const decision = outcomeToPolicyDecision(outcome);
    this.logDecision(`hook:${hookContext.hookType}`, decision, toolContext);

    return decision;
  }

  saveState(): WorkbenchPolicyState {
    return {
      version: 1,
      decisions: Array.from(this.decisionCache.values()).map((entry) => ({ ...entry })),
    };
  }

  loadState(state: WorkbenchPolicyState): void {
    if (state.version !== 1) {
      return;
    }
    this.decisionCache.clear();
    for (const entry of state.decisions) {
      this.decisionCache.set(entry.key, { ...entry });
    }
  }

  private resolveCachedOutcome(key: string, resolve: () => PolicyOutcome): PolicyOutcome {
    if (!this.decisionCacheEnabled) {
      return resolve();
    }
    const cached = this.decisionCache.get(key);
    if (cached) {
      return {
        action: cached.action,
        reason: cached.reason,
        reasonCode: cached.reasonCode,
        ruleId: cached.ruleId,
        riskTags: cached.riskTags,
      };
    }

    const outcome = resolve();
    this.decisionCache.set(key, {
      key,
      action: outcome.action,
      reason: outcome.reason,
      reasonCode: outcome.reasonCode,
      ruleId: outcome.ruleId,
      riskTags: outcome.riskTags,
      updatedAt: this.clock(),
    });

    return outcome;
  }

  private evaluateToolOutcome(call: MCPToolCall): PolicyOutcome {
    if (this.pathAllowlist.length > 0 && isFileOperation(call.name)) {
      const targetPath = extractPath(call.arguments);
      if (
        targetPath &&
        !isPathWithinRoots(targetPath, this.pathAllowlist, this.caseInsensitivePaths)
      ) {
        return {
          action: this.pathSafeguardAction,
          reason: "Path is outside the approved allowlist",
          reasonCode: PATH_POLICY_CODE,
          riskTags: ["policy:path"],
        };
      }
    }

    const ruleOutcome = this.matchRules("tool", call.name, call.arguments, undefined);
    if (ruleOutcome) {
      return ruleOutcome;
    }

    if (this.autoApproveTools.length > 0 && matchesAnyPattern(call.name, this.autoApproveTools)) {
      return {
        action: "allow",
        reason: "Tool auto-approved by allowlist",
        reasonCode: AUTO_APPROVE_CODE,
        riskTags: ["policy:auto-approve"],
      };
    }

    return {
      action: this.defaultAction,
      reason: this.defaultAction === "ask" ? "Tool requires approval" : undefined,
      reasonCode: DEFAULT_POLICY_CODE,
      riskTags: ["policy:default"],
    };
  }

  private evaluateHookOutcome(hookContext: WorkbenchHookContext): PolicyOutcome {
    const ruleOutcome = this.matchRules(
      "hook",
      hookContext.hookType,
      hookContext.parameters ?? {},
      hookContext.toolName
    );
    if (ruleOutcome) {
      return ruleOutcome;
    }

    return {
      action: this.hookDefaultAction,
      reason: this.hookDefaultAction === "ask" ? "Hook requires approval" : undefined,
      reasonCode: DEFAULT_POLICY_CODE,
      riskTags: ["policy:hook"],
    };
  }

  private matchRules(
    target: WorkbenchPolicyTarget,
    name: string,
    params: Record<string, unknown>,
    toolName?: string
  ): PolicyOutcome | undefined {
    for (const rule of this.rules) {
      if (!ruleTargetsMatch(rule, target)) {
        continue;
      }

      if (!ruleNameMatches(rule, target, name, toolName)) {
        continue;
      }

      if (!ruleConditionsMatch(rule, params)) {
        continue;
      }

      return buildRuleOutcome(rule);
    }

    return undefined;
  }

  private logDecision(toolName: string, decision: ToolPolicyDecision, context: ToolContext): void {
    if (!this.audit) {
      return;
    }

    this.audit.log({
      timestamp: this.clock(),
      toolName,
      action: "policy",
      userId: context.userId,
      correlationId: context.correlationId,
      input: {
        allowed: decision.allowed,
        requiresConfirmation: decision.requiresConfirmation,
        reason: decision.reason,
        reasonCode: decision.reasonCode,
        riskTags: decision.riskTags,
      },
      sandboxed: context.security.sandbox.type !== "none",
    });
  }
}

function ruleTargetsMatch(rule: WorkbenchPolicyRule, target: WorkbenchPolicyTarget): boolean {
  return (rule.target ?? "tool") === target;
}

function ruleNameMatches(
  rule: WorkbenchPolicyRule,
  target: WorkbenchPolicyTarget,
  name: string,
  toolName?: string
): boolean {
  if (target === "tool") {
    const patterns = normalizePatterns(rule.tools ?? ["*"]);
    return matchesAnyPattern(name, patterns);
  }

  const hookPatterns = normalizePatterns(rule.hooks ?? ["*"]);
  if (!matchesAnyPattern(name, hookPatterns)) {
    return false;
  }
  if (!rule.toolPatterns || rule.toolPatterns.length === 0) {
    return true;
  }
  if (!toolName) {
    return false;
  }
  return matchesAnyPattern(toolName, normalizePatterns(rule.toolPatterns));
}

function ruleConditionsMatch(rule: WorkbenchPolicyRule, params: Record<string, unknown>): boolean {
  if (!rule.conditions || rule.conditions.length === 0) {
    return true;
  }
  return rule.conditions.every((condition) => evaluateCondition(condition, params));
}

function buildRuleOutcome(rule: WorkbenchPolicyRule): PolicyOutcome {
  return {
    action: rule.action,
    reason: rule.reason,
    reasonCode: rule.reasonCode ?? rule.id,
    ruleId: rule.id,
    riskTags: ["policy:rule", `policy:action:${rule.action}`, `policy:rule:${rule.id}`],
  };
}

function outcomeToPolicyDecision(outcome: PolicyOutcome): ToolPolicyDecision {
  return {
    allowed: outcome.action !== "deny",
    requiresConfirmation: outcome.action === "ask",
    reason: outcome.reason,
    reasonCode: outcome.reasonCode,
    riskTags: outcome.riskTags,
  };
}

function mergePolicyDecision(base: ToolPolicyDecision, outcome: PolicyOutcome): ToolPolicyDecision {
  if (outcome.action === "deny") {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: outcome.reason ?? base.reason,
      reasonCode: outcome.reasonCode ?? base.reasonCode,
      riskTags: mergeRiskTags(base.riskTags, outcome.riskTags),
      escalation: base.escalation,
    };
  }

  return {
    allowed: true,
    requiresConfirmation: base.requiresConfirmation || outcome.action === "ask",
    reason: outcome.reason ?? base.reason,
    reasonCode: outcome.reasonCode ?? base.reasonCode,
    riskTags: mergeRiskTags(base.riskTags, outcome.riskTags),
    escalation: base.escalation,
  };
}

function mergeRiskTags(first?: string[], second?: string[]): string[] | undefined {
  if (!first && !second) {
    return undefined;
  }
  const set = new Set<string>();
  for (const tag of first ?? []) {
    if (tag) {
      set.add(tag);
    }
  }
  for (const tag of second ?? []) {
    if (tag) {
      set.add(tag);
    }
  }
  return Array.from(set);
}

function normalizePatterns(patterns: string[]): string[] {
  return patterns.map((pattern) => pattern.trim()).filter(Boolean);
}

function matchesAnyPattern(name: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  for (const pattern of patterns) {
    if (matchesPattern(name, pattern)) {
      return true;
    }
  }
  return false;
}

function matchesPattern(value: string, pattern: string): boolean {
  const normalizedValue = value.toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern === "*") {
    return true;
  }
  if (normalizedPattern.endsWith(":*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedValue.startsWith(prefix);
  }
  if (normalizedPattern.endsWith("*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedValue.startsWith(prefix);
  }
  return normalizedValue === normalizedPattern;
}

function evaluateCondition(
  condition: WorkbenchPolicyCondition,
  params: Record<string, unknown>
): boolean {
  const value = resolveConditionValue(condition.type, params);
  if (value === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "equals":
      return value === condition.value;
    case "contains":
      return typeof value === "string" && value.includes(String(condition.value));
    case "matches":
      return matchesConditionPattern(value, condition.value);
    case "lessThan":
      return typeof value === "number" && value < Number(condition.value);
    case "greaterThan":
      return typeof value === "number" && value > Number(condition.value);
    default:
      return false;
  }
}

function resolveConditionValue(
  type: WorkbenchPolicyCondition["type"],
  params: Record<string, unknown>
): string | number | undefined {
  switch (type) {
    case "path":
      return extractPath(params);
    case "content":
      return findStringParam(params, ["content", "text", "prompt", "command"]);
    case "size": {
      const sizeParam = params.size;
      if (typeof sizeParam === "number") {
        return sizeParam;
      }
      const content = findStringParam(params, ["content", "text"]);
      return content ? content.length : undefined;
    }
    case "risk":
      return findStringParam(params, ["risk", "riskLevel"]);
    default:
      return undefined;
  }
}

function findStringParam(params: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function matchesConditionPattern(value: unknown, pattern: string | number | RegExp): boolean {
  if (typeof value !== "string") {
    return false;
  }
  if (pattern instanceof RegExp) {
    return pattern.test(value);
  }
  const regex = new RegExp(String(pattern));
  return regex.test(value);
}

function extractPath(params: Record<string, unknown>): string | undefined {
  const direct = params.path;
  if (typeof direct === "string") {
    return direct;
  }
  const alt = params.filePath;
  if (typeof alt === "string") {
    return alt;
  }
  const target = params.targetPath;
  if (typeof target === "string") {
    return target;
  }
  return undefined;
}

function isFileOperation(toolName: string): boolean {
  return toolName.startsWith("file:") || toolName.startsWith("file.");
}

function isPathWithinRoots(targetPath: string, roots: string[], caseInsensitive: boolean): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const target = caseInsensitive ? resolvedTarget.toLowerCase() : resolvedTarget;

  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    const normalizedRoot = caseInsensitive ? resolvedRoot.toLowerCase() : resolvedRoot;
    if (target === normalizedRoot) {
      return true;
    }
    if (target.startsWith(`${normalizedRoot}${path.sep}`)) {
      return true;
    }
  }

  return false;
}

function buildDecisionKey(kind: "tool", call: MCPToolCall): string {
  return `${kind}:${call.name}:${stableStringify(call.arguments)}`;
}

function buildHookDecisionKey(context: WorkbenchHookContext): string {
  const params = context.parameters ?? {};
  return `hook:${context.hookType}:${context.toolName}:${stableStringify(params)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([key, val]) => `${key}:${stableStringify(val)}`).join(",")}}`;
}
