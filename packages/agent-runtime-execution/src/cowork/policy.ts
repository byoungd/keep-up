/**
 * Cowork Policy DSL
 *
 * Deterministic evaluation of allow/confirm/deny decisions for Cowork actions.
 */

import * as path from "node:path";
import type { CoworkPolicyActionLike } from "@ku0/agent-runtime-core";
import { COWORK_POLICY_ACTIONS } from "@ku0/agent-runtime-core";
import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import { AGENT_METRICS } from "@ku0/agent-runtime-telemetry/telemetry";
import { z } from "zod";
import { LRUCache } from "../utils/cache";

// Defined locally to avoid circular dependency with cowork/types.ts
export type CoworkRiskTag = "delete" | "overwrite" | "network" | "connector" | "batch";

export type CoworkPolicyDecisionType = "allow" | "allow_with_confirm" | "deny";

export type CoworkPolicyAction = CoworkPolicyActionLike;

export interface CoworkPolicyRule {
  id: string;
  action: CoworkPolicyAction;
  when?: CoworkPolicyConditions;
  decision: CoworkPolicyDecisionType;
  riskTags?: CoworkRiskTag[];
  reason?: string;
}

export interface CoworkPolicyConditions {
  pathWithinGrant?: boolean;
  pathWithinOutputRoot?: boolean;
  matchesPattern?: string[];
  fileSizeGreaterThan?: number;
  hostInAllowlist?: boolean;
  connectorScopeAllowed?: boolean;
}

export interface CoworkPolicyConfig {
  version: "1.0";
  defaults: {
    fallback: CoworkPolicyDecisionType;
  };
  rules: CoworkPolicyRule[];
}

export interface CoworkPolicyInput {
  action: CoworkPolicyAction;
  path?: string;
  grantRoots?: string[];
  outputRoots?: string[];
  fileSizeBytes?: number;
  host?: string;
  hostAllowlist?: string[];
  connectorScopeAllowed?: boolean;
  caseInsensitivePaths?: boolean;
}

export interface CoworkPolicyDecision {
  decision: CoworkPolicyDecisionType;
  requiresConfirmation: boolean;
  reason: string;
  riskTags: CoworkRiskTag[];
  ruleId?: string;
}

export interface CoworkPolicyEngineOptions {
  telemetry?: TelemetryContext;
  decisionCache?: LRUCache<CoworkPolicyDecision>;
  enableDecisionCache?: boolean;
}

const COWORK_RISK_TAGS = ["delete", "overwrite", "network", "connector", "batch"] as const;

const policyDecisionSchema = z.enum(["allow", "allow_with_confirm", "deny"]);
const policyActionSchema = z.enum(COWORK_POLICY_ACTIONS);
const policyRiskTagSchema = z.enum(COWORK_RISK_TAGS);
const policyConditionsSchema = z
  .object({
    pathWithinGrant: z.boolean().optional(),
    pathWithinOutputRoot: z.boolean().optional(),
    matchesPattern: z.array(z.string()).optional(),
    fileSizeGreaterThan: z.number().optional(),
    hostInAllowlist: z.boolean().optional(),
    connectorScopeAllowed: z.boolean().optional(),
  })
  .strict();

const policyRuleSchema = z
  .object({
    id: z.string().min(1),
    action: policyActionSchema,
    when: policyConditionsSchema.optional(),
    decision: policyDecisionSchema,
    riskTags: z.array(policyRiskTagSchema).optional(),
    reason: z.string().optional(),
  })
  .strict();

const policyConfigSchema = z
  .object({
    version: z.literal("1.0"),
    defaults: z
      .object({
        fallback: policyDecisionSchema,
      })
      .strict(),
    rules: z.array(policyRuleSchema),
  })
  .strict();

// Re-export from core to maintain API compatibility
export { isCoworkPolicyAction } from "@ku0/agent-runtime-core";

export function parseCoworkPolicyConfig(input: unknown): CoworkPolicyConfig | null {
  const parsed = policyConfigSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function createDenyAllPolicy(): CoworkPolicyConfig {
  return {
    version: "1.0",
    defaults: { fallback: "deny" },
    rules: [],
  };
}

export class CoworkPolicyEngine {
  private readonly config: CoworkPolicyConfig;
  private readonly telemetry?: TelemetryContext;
  private readonly decisionCache?: LRUCache<CoworkPolicyDecision>;
  private readonly actionRuleCache = new Map<CoworkPolicyAction, CoworkPolicyRule[]>();

  constructor(config: CoworkPolicyConfig, options: CoworkPolicyEngineOptions = {}) {
    this.config = config;
    this.telemetry = options.telemetry;
    this.decisionCache =
      options.enableDecisionCache === false
        ? undefined
        : (options.decisionCache ?? new LRUCache<CoworkPolicyDecision>({ maxEntries: 2000 }));
  }

  evaluate(input: CoworkPolicyInput): CoworkPolicyDecision {
    const startTime = Date.now();
    const cacheKey = this.decisionCache ? buildDecisionCacheKey(input) : undefined;
    if (cacheKey) {
      const cached = this.decisionCache?.get(cacheKey);
      if (cached) {
        this.recordTelemetry(cached, startTime);
        return cached;
      }
    }

    const context = buildPolicyContext(input);

    const candidateRules = this.getRulesForAction(input.action);
    for (const rule of candidateRules) {
      if (!conditionsMatch(rule.when, context)) {
        continue;
      }

      const decision = buildDecision(rule.decision, {
        reason: rule.reason ?? `rule:${rule.id}`,
        riskTags: rule.riskTags ?? [],
        ruleId: rule.id,
      });
      if (cacheKey) {
        this.decisionCache?.set(cacheKey, decision);
      }
      this.recordTelemetry(decision, startTime);
      return decision;
    }

    const fallback = buildDecision(this.config.defaults.fallback, {
      reason: "fallback",
      riskTags: [],
    });
    if (cacheKey) {
      this.decisionCache?.set(cacheKey, fallback);
    }
    this.recordTelemetry(fallback, startTime);
    return fallback;
  }

  private getRulesForAction(action: CoworkPolicyAction): CoworkPolicyRule[] {
    const cached = this.actionRuleCache.get(action);
    if (cached) {
      return cached;
    }

    const exact: CoworkPolicyRule[] = [];
    const wildcard: CoworkPolicyRule[] = [];

    for (const rule of this.config.rules) {
      if (!actionMatches(rule.action, action)) {
        continue;
      }
      if (rule.action === action) {
        exact.push(rule);
      } else {
        wildcard.push(rule);
      }
    }

    const ordered = [...exact, ...wildcard];
    this.actionRuleCache.set(action, ordered);
    return ordered;
  }

  private recordTelemetry(decision: CoworkPolicyDecision, startTime: number): void {
    if (!this.telemetry) {
      return;
    }

    const decisionLabel = decision.decision;
    this.telemetry.metrics.increment(AGENT_METRICS.coworkPolicyEvaluations.name, {
      decision: decisionLabel,
    });

    if (decision.decision === "deny") {
      this.telemetry.metrics.increment(AGENT_METRICS.coworkPolicyDenials.name, {
        reason: decision.reason,
      });
    }

    this.telemetry.metrics.observe(AGENT_METRICS.coworkPolicyLatency.name, Date.now() - startTime, {
      decision: decisionLabel,
    });
  }
}

interface CoworkPolicyContext {
  pathWithinGrant: boolean;
  pathWithinOutputRoot: boolean;
  hostInAllowlist: boolean;
  connectorScopeAllowed: boolean;
  fileSizeBytes?: number;
  path?: string;
  caseInsensitivePaths: boolean;
}

function buildDecision(
  decision: CoworkPolicyDecisionType,
  context: { reason: string; riskTags: CoworkRiskTag[]; ruleId?: string }
): CoworkPolicyDecision {
  return {
    decision,
    requiresConfirmation: decision === "allow_with_confirm",
    reason: context.reason,
    riskTags: context.riskTags,
    ruleId: context.ruleId,
  };
}

function buildDecisionCacheKey(input: CoworkPolicyInput): string {
  const grantRoots = input.grantRoots ?? [];
  const outputRoots = input.outputRoots ?? [];
  const hostAllowlist = input.hostAllowlist ?? [];
  const parts = [
    input.action,
    input.path ?? "",
    input.caseInsensitivePaths ? "1" : "0",
    input.fileSizeBytes?.toString() ?? "",
    input.host ?? "",
    input.connectorScopeAllowed ? "1" : "0",
    `grant:${grantRoots.join("|")}`,
    `output:${outputRoots.join("|")}`,
    `allow:${hostAllowlist.join("|")}`,
  ];

  return parts.join("::");
}

function buildPolicyContext(input: CoworkPolicyInput): CoworkPolicyContext {
  const caseInsensitivePaths = input.caseInsensitivePaths ?? false;
  const pathWithinGrant = input.path
    ? isPathWithinRoots(input.path, input.grantRoots ?? [], caseInsensitivePaths)
    : false;
  const pathWithinOutputRoot = input.path
    ? isPathWithinRoots(input.path, input.outputRoots ?? [], caseInsensitivePaths)
    : false;
  const hostInAllowlist =
    typeof input.host === "string" &&
    input.host.length > 0 &&
    (input.hostAllowlist ?? []).includes(input.host);
  const connectorScopeAllowed = input.connectorScopeAllowed ?? false;

  return {
    pathWithinGrant,
    pathWithinOutputRoot,
    hostInAllowlist,
    connectorScopeAllowed,
    fileSizeBytes: input.fileSizeBytes,
    path: input.path,
    caseInsensitivePaths,
  };
}

function conditionsMatch(
  conditions: CoworkPolicyConditions | undefined,
  context: CoworkPolicyContext
): boolean {
  if (!conditions) {
    return true;
  }

  return (
    matchBooleanCondition(conditions.pathWithinGrant, context.pathWithinGrant) &&
    matchBooleanCondition(conditions.pathWithinOutputRoot, context.pathWithinOutputRoot) &&
    matchPatternCondition(conditions.matchesPattern, context.path, context.caseInsensitivePaths) &&
    matchFileSizeCondition(conditions.fileSizeGreaterThan, context.fileSizeBytes) &&
    matchBooleanCondition(conditions.hostInAllowlist, context.hostInAllowlist) &&
    matchBooleanCondition(conditions.connectorScopeAllowed, context.connectorScopeAllowed)
  );
}

function matchBooleanCondition(expected: boolean | undefined, actual: boolean): boolean {
  if (typeof expected !== "boolean") {
    return true;
  }

  return expected === actual;
}

function matchPatternCondition(
  patterns: string[] | undefined,
  targetPath: string | undefined,
  caseInsensitive: boolean
): boolean {
  if (!Array.isArray(patterns)) {
    return true;
  }

  if (!targetPath) {
    return false;
  }

  return matchesAnyPattern(targetPath, patterns, caseInsensitive);
}

function matchFileSizeCondition(threshold: number | undefined, size: number | undefined): boolean {
  if (typeof threshold !== "number") {
    return true;
  }

  if (typeof size !== "number") {
    return false;
  }

  return size > threshold;
}

function actionMatches(ruleAction: CoworkPolicyAction, inputAction: CoworkPolicyAction): boolean {
  if (ruleAction === inputAction) {
    return true;
  }

  if (ruleAction.endsWith(".*")) {
    const prefix = ruleAction.slice(0, -2);
    return inputAction.startsWith(`${prefix}.`);
  }

  if (ruleAction.includes("*")) {
    const escaped = escapeRegex(ruleAction).replace(/\\\*/g, ".*");
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(inputAction);
  }

  return false;
}

export function isPathWithinRoots(
  targetPath: string,
  roots: string[],
  caseInsensitive: boolean
): boolean {
  if (roots.length === 0) {
    return false;
  }

  const normalizedTarget = normalizePathForEvaluation(targetPath, caseInsensitive);
  if (!normalizedTarget) {
    return false;
  }

  for (const root of roots) {
    const normalizedRoot = normalizePathForEvaluation(root, caseInsensitive);
    if (!normalizedRoot) {
      continue;
    }
    const rootWithSlash = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;

    if (normalizedTarget === normalizedRoot) {
      return true;
    }

    if (normalizedTarget.startsWith(rootWithSlash)) {
      return true;
    }
  }

  return false;
}

export function matchesAnyPattern(
  targetPath: string,
  patterns: string[],
  caseInsensitive: boolean
): boolean {
  if (patterns.length === 0) {
    return false;
  }

  for (const pattern of patterns) {
    if (matchGlob(targetPath, pattern, caseInsensitive)) {
      return true;
    }
  }

  return false;
}

function matchGlob(targetPath: string, pattern: string, caseInsensitive: boolean): boolean {
  const normalizedTarget = normalizePathForEvaluation(targetPath, caseInsensitive);
  if (!normalizedTarget) {
    return false;
  }
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const regexBody = escapeRegex(normalizedPattern)
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*");
  const flags = caseInsensitive ? "i" : "";
  const regex = new RegExp(`^${regexBody}$`, flags);
  return regex.test(normalizedTarget);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const normalizedPathCache = new LRUCache<string>({ maxEntries: 5000 });

function normalizePathForEvaluation(input: string, caseInsensitive: boolean): string | null {
  const cacheKey = `${caseInsensitive ? "i" : "s"}:${input}`;
  const cached = normalizedPathCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const resolved = path.resolve(input).replace(/\\/g, "/");
    const normalized = caseInsensitive ? resolved.toLowerCase() : resolved;
    normalizedPathCache.set(cacheKey, normalized);
    return normalized;
  } catch {
    return null;
  }
}
