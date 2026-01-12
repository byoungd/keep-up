/**
 * LFCC v0.9.1+ — Dynamic AI Safety Policies
 *
 * Context-aware, runtime-configurable safety policies for AI operations.
 * Enables fine-grained control based on document type, user role, and risk.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

import type { AIOpCode } from "./opcodes";
import type { AISanitizationPolicyV1 } from "./types";

// ============================================================================
// Policy Condition Types
// ============================================================================

/**
 * Document type condition.
 */
export interface DocumentTypeCondition {
  type: "document_type";
  matches: string[];
}

/**
 * Content sensitivity condition.
 */
export interface ContentSensitivityCondition {
  type: "content_sensitivity";
  level: "public" | "internal" | "confidential" | "restricted";
}

/**
 * Operation scope condition.
 */
export interface OperationScopeCondition {
  type: "operation_scope";
  max_blocks: number;
}

/**
 * Time-based condition.
 */
export interface TimeCondition {
  type: "time_of_day";
  allowed_hours: [number, number]; // [start, end] in 24h format
}

/**
 * User role condition.
 */
export interface UserRoleCondition {
  type: "user_role";
  roles: string[];
}

/**
 * Agent type condition.
 */
export interface AgentTypeCondition {
  type: "agent_type";
  allowed_types: string[];
}

/**
 * Confidence threshold condition.
 */
export interface ConfidenceCondition {
  type: "min_confidence";
  threshold: number;
}

/**
 * Union of all policy conditions.
 */
export type PolicyCondition =
  | DocumentTypeCondition
  | ContentSensitivityCondition
  | OperationScopeCondition
  | TimeCondition
  | UserRoleCondition
  | AgentTypeCondition
  | ConfidenceCondition;

// ============================================================================
// Policy Effect
// ============================================================================

/**
 * Effect when a policy rule matches.
 */
export type PolicyEffect = "allow" | "deny" | "require_approval" | "log_only";

// ============================================================================
// Context Rule
// ============================================================================

/**
 * A context-specific policy rule.
 */
export interface ContextRule {
  /** Rule name */
  name: string;

  /** Rule priority (higher = evaluated first) */
  priority: number;

  /** Conditions that must all match */
  conditions: PolicyCondition[];

  /** Effect when conditions match */
  effect: PolicyEffect;

  /** Operations this rule applies to */
  scope: AIOpCode[] | "all";

  /** Custom message when rule triggers */
  message?: string;
}

// ============================================================================
// User Safety Preference
// ============================================================================

/**
 * User-specific safety preference.
 */
export interface UserSafetyPreference {
  /** User ID */
  user_id: string;

  /** Always require approval for these operations */
  require_approval_for: AIOpCode[];

  /** Never allow these operations */
  never_allow: AIOpCode[];

  /** Custom confidence threshold override */
  confidence_threshold?: number;

  /** Auto-approve high-confidence suggestions */
  auto_approve_high_confidence: boolean;
}

// ============================================================================
// Risk Assessment
// ============================================================================

/**
 * Safety risk level (distinct from semantic merge RiskLevel).
 */
export type SafetyRiskLevel = "none" | "low" | "medium" | "high" | "critical";

/**
 * Risk assessment result.
 */
export interface RiskAssessment {
  /** Overall risk level */
  level: SafetyRiskLevel;

  /** Risk factors identified */
  factors: RiskFactor[];

  /** Suggested mitigations */
  mitigations: string[];

  /** Confidence in assessment */
  confidence: number;
}

/**
 * Individual risk factor.
 */
export interface RiskFactor {
  /** Factor name */
  name: string;

  /** Factor severity */
  severity: SafetyRiskLevel;

  /** Description */
  description: string;
}

// ============================================================================
// Risk Assessor Interface
// ============================================================================

/**
 * Assesses risk for AI operations.
 */
export interface RiskAssessor {
  /**
   * Assess risk for an operation.
   */
  assessRisk(context: RiskContext): RiskAssessment;
}

/**
 * Context for risk assessment.
 */
export interface RiskContext {
  /** Operation code */
  op_code: AIOpCode;

  /** Number of blocks affected */
  blocks_affected: number;

  /** Document sensitivity level */
  sensitivity?: ContentSensitivityCondition["level"];

  /** Agent confidence */
  confidence?: number;

  /** User role */
  user_role?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Dynamic Safety Policy
// ============================================================================

/**
 * Complete dynamic AI safety policy.
 */
export interface DynamicAISafetyPolicy {
  /** Policy ID */
  policy_id: string;

  /** Base sanitization policy (always enforced) */
  base: AISanitizationPolicyV1;

  /** Context-specific rules */
  context_rules: ContextRule[];

  /** User-level preferences */
  user_overrides: Map<string, UserSafetyPreference>;

  /** Risk assessor */
  risk_assessor: RiskAssessor;

  /** Default effect when no rules match */
  default_effect: PolicyEffect;

  /** Audit log enabled */
  audit_enabled: boolean;
}

// ============================================================================
// Policy Evaluation Result
// ============================================================================

/**
 * Result of evaluating a policy.
 */
export interface PolicyEvaluationResult {
  /** Final decision */
  decision: PolicyEffect;

  /** Rules that matched */
  matched_rules: string[];

  /** Risk assessment */
  risk: RiskAssessment;

  /** Actions required before proceeding */
  required_actions: string[];

  /** Audit entry (if audit enabled) */
  audit_entry?: AuditEntry;
}

/**
 * Audit log entry.
 */
export interface AuditEntry {
  timestamp: number;
  op_code: AIOpCode;
  user_id?: string;
  agent_id?: string;
  decision: PolicyEffect;
  matched_rules: string[];
  risk_level: SafetyRiskLevel;
}

// ============================================================================
// Policy Engine Interface
// ============================================================================

/**
 * Engine for evaluating dynamic safety policies.
 */
export interface PolicyEngine {
  /**
   * Evaluate policy for an operation.
   */
  evaluate(context: PolicyContext): PolicyEvaluationResult;

  /**
   * Add a context rule.
   */
  addRule(rule: ContextRule): void;

  /**
   * Remove a rule by name.
   */
  removeRule(name: string): void;

  /**
   * Set user preference.
   */
  setUserPreference(preference: UserSafetyPreference): void;

  /**
   * Get audit log.
   */
  getAuditLog(options?: { limit?: number; since?: number }): AuditEntry[];

  /**
   * Export policy configuration.
   */
  exportPolicy(): DynamicAISafetyPolicy;
}

/**
 * Context for policy evaluation.
 */
export interface PolicyContext {
  /** Operation code */
  op_code: AIOpCode;

  /** User ID */
  user_id?: string;

  /** Agent ID */
  agent_id?: string;

  /** Document type */
  document_type?: string;

  /** Content sensitivity */
  sensitivity?: ContentSensitivityCondition["level"];

  /** Blocks affected */
  blocks_affected: number;

  /** Agent confidence */
  confidence?: number;

  /** User role */
  user_role?: string;

  /** Current hour (0-23) */
  current_hour?: number;

  /** Agent type */
  agent_type?: string;
}

// ============================================================================
// Default Risk Assessor
// ============================================================================

/**
 * Default risk assessor implementation.
 */
export class DefaultRiskAssessor implements RiskAssessor {
  assessRisk(context: RiskContext): RiskAssessment {
    const factors: RiskFactor[] = [];
    let maxSeverity: SafetyRiskLevel = "none";

    // Check blocks affected
    if (context.blocks_affected > 10) {
      factors.push({
        name: "large_scope",
        severity: "medium",
        description: `Operation affects ${context.blocks_affected} blocks`,
      });
      maxSeverity = this.maxRisk(maxSeverity, "medium");
    } else if (context.blocks_affected > 50) {
      factors.push({
        name: "very_large_scope",
        severity: "high",
        description: `Operation affects ${context.blocks_affected} blocks`,
      });
      maxSeverity = this.maxRisk(maxSeverity, "high");
    }

    // Check sensitivity
    if (context.sensitivity === "confidential") {
      factors.push({
        name: "sensitive_content",
        severity: "medium",
        description: "Document contains confidential content",
      });
      maxSeverity = this.maxRisk(maxSeverity, "medium");
    } else if (context.sensitivity === "restricted") {
      factors.push({
        name: "restricted_content",
        severity: "high",
        description: "Document contains restricted content",
      });
      maxSeverity = this.maxRisk(maxSeverity, "high");
    }

    // Check confidence
    if (context.confidence !== undefined && context.confidence < 0.5) {
      factors.push({
        name: "low_confidence",
        severity: "medium",
        description: `AI confidence is only ${(context.confidence * 100).toFixed(0)}%`,
      });
      maxSeverity = this.maxRisk(maxSeverity, "medium");
    }

    // Check destructive operations
    const destructiveOps: AIOpCode[] = ["OP_AI_RESTRUCTURE", "OP_AI_SPLIT_MERGE"];
    if (destructiveOps.includes(context.op_code)) {
      factors.push({
        name: "destructive_operation",
        severity: "medium",
        description: `${context.op_code} can significantly alter document structure`,
      });
      maxSeverity = this.maxRisk(maxSeverity, "medium");
    }

    // Generate mitigations
    const mitigations: string[] = [];
    if (maxSeverity !== "none") {
      mitigations.push("Review changes before applying");
    }
    if (factors.some((f) => f.name === "large_scope")) {
      mitigations.push("Consider applying changes incrementally");
    }
    if (factors.some((f) => f.name === "low_confidence")) {
      mitigations.push("Request human verification");
    }

    return {
      level: maxSeverity,
      factors,
      mitigations,
      confidence: factors.length === 0 ? 1.0 : 0.8,
    };
  }

  private maxRisk(a: SafetyRiskLevel, b: SafetyRiskLevel): SafetyRiskLevel {
    const order: SafetyRiskLevel[] = ["none", "low", "medium", "high", "critical"];
    return order.indexOf(a) > order.indexOf(b) ? a : b;
  }
}

// ============================================================================
// Policy Engine Implementation
// ============================================================================

/**
 * In-memory policy engine implementation.
 */
export class InMemoryPolicyEngine implements PolicyEngine {
  private policy: DynamicAISafetyPolicy;
  private auditLog: AuditEntry[] = [];

  constructor(basePolicy: AISanitizationPolicyV1) {
    this.policy = {
      policy_id: `policy_${Date.now().toString(36)}`,
      base: basePolicy,
      context_rules: [],
      user_overrides: new Map(),
      risk_assessor: new DefaultRiskAssessor(),
      default_effect: "allow",
      audit_enabled: true,
    };

    // Add default rules
    this.addDefaultRules();
  }

  evaluate(context: PolicyContext): PolicyEvaluationResult {
    const matchedRules: string[] = [];
    let decision = this.policy.default_effect;

    // Check user-specific preferences
    decision = this.evaluateUserPreferences(context, matchedRules, decision);

    // Evaluate context rules
    decision = this.evaluateContextRules(context, matchedRules, decision);

    // Assess risk
    const risk = this.assessRisk(context);

    // Escalate high risk operations
    if (this.shouldEscalateRisk(risk.level, decision)) {
      decision = "require_approval";
      matchedRules.push("auto_escalate_high_risk");
    }

    // Build result
    const requiredActions = this.buildRequiredActions(decision, risk);
    const auditEntry = this.createAuditEntry(context, decision, matchedRules, risk.level);

    return {
      decision,
      matched_rules: matchedRules,
      risk,
      required_actions: requiredActions,
      audit_entry: auditEntry,
    };
  }

  private evaluateUserPreferences(
    context: PolicyContext,
    matchedRules: string[],
    decision: PolicyEffect
  ): PolicyEffect {
    if (!context.user_id) {
      return decision;
    }
    const userPref = this.policy.user_overrides.get(context.user_id);
    if (!userPref) {
      return decision;
    }

    if (userPref.never_allow.includes(context.op_code)) {
      matchedRules.push(`user_never_allow:${context.user_id}`);
      return "deny";
    }
    if (userPref.require_approval_for.includes(context.op_code)) {
      matchedRules.push(`user_require_approval:${context.user_id}`);
      return "require_approval";
    }
    return decision;
  }

  private evaluateContextRules(
    context: PolicyContext,
    matchedRules: string[],
    decision: PolicyEffect
  ): PolicyEffect {
    const sortedRules = [...this.policy.context_rules].sort((a, b) => b.priority - a.priority);
    let result = decision;

    for (const rule of sortedRules) {
      if (this.ruleMatches(rule, context) && this.ruleAppliesToOp(rule, context.op_code)) {
        matchedRules.push(rule.name);
        result = this.resolveEffects(result, rule.effect);
      }
    }
    return result;
  }

  private assessRisk(context: PolicyContext): RiskAssessment {
    return this.policy.risk_assessor.assessRisk({
      op_code: context.op_code,
      blocks_affected: context.blocks_affected,
      sensitivity: context.sensitivity,
      confidence: context.confidence,
      user_role: context.user_role,
    });
  }

  private shouldEscalateRisk(level: SafetyRiskLevel, decision: PolicyEffect): boolean {
    return (level === "high" || level === "critical") && decision === "allow";
  }

  private buildRequiredActions(decision: PolicyEffect, risk: RiskAssessment): string[] {
    const actions: string[] = [];
    if (decision === "require_approval") {
      actions.push("Obtain human approval before proceeding");
    }
    actions.push(...risk.mitigations);
    return actions;
  }

  private createAuditEntry(
    context: PolicyContext,
    decision: PolicyEffect,
    matchedRules: string[],
    riskLevel: SafetyRiskLevel
  ): AuditEntry | undefined {
    if (!this.policy.audit_enabled) {
      return undefined;
    }

    const entry: AuditEntry = {
      timestamp: Date.now(),
      op_code: context.op_code,
      user_id: context.user_id,
      agent_id: context.agent_id,
      decision,
      matched_rules: matchedRules,
      risk_level: riskLevel,
    };
    this.auditLog.push(entry);

    // Keep audit log manageable
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
    return entry;
  }

  addRule(rule: ContextRule): void {
    // Remove existing rule with same name
    this.removeRule(rule.name);
    this.policy.context_rules.push(rule);
  }

  removeRule(name: string): void {
    this.policy.context_rules = this.policy.context_rules.filter((r) => r.name !== name);
  }

  setUserPreference(preference: UserSafetyPreference): void {
    this.policy.user_overrides.set(preference.user_id, preference);
  }

  getAuditLog(options?: { limit?: number; since?: number }): AuditEntry[] {
    let entries = this.auditLog;

    if (options?.since !== undefined) {
      const since = options.since;
      entries = entries.filter((e) => e.timestamp >= since);
    }

    if (options?.limit) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  }

  exportPolicy(): DynamicAISafetyPolicy {
    return { ...this.policy };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private addDefaultRules(): void {
    // Rule: Deny structural changes to restricted content
    this.addRule({
      name: "deny_structural_on_restricted",
      priority: 100,
      conditions: [{ type: "content_sensitivity", level: "restricted" }],
      effect: "deny",
      scope: ["OP_AI_RESTRUCTURE", "OP_AI_SPLIT_MERGE"],
      message: "Structural changes are not allowed on restricted documents",
    });

    // Rule: Require approval for large scope operations
    this.addRule({
      name: "approval_for_large_scope",
      priority: 80,
      conditions: [{ type: "operation_scope", max_blocks: 20 }],
      effect: "require_approval",
      scope: "all",
      message: "Operations affecting many blocks require approval",
    });

    // Rule: Require approval for low confidence
    this.addRule({
      name: "approval_for_low_confidence",
      priority: 70,
      conditions: [{ type: "min_confidence", threshold: 0.7 }],
      effect: "require_approval",
      scope: "all",
      message: "Low confidence operations require human review",
    });
  }

  private ruleMatches(rule: ContextRule, context: PolicyContext): boolean {
    return rule.conditions.every((condition) => this.conditionMatches(condition, context));
  }

  private conditionMatches(condition: PolicyCondition, context: PolicyContext): boolean {
    switch (condition.type) {
      case "document_type":
        return context.document_type ? condition.matches.includes(context.document_type) : false;

      case "content_sensitivity":
        return context.sensitivity === condition.level;

      case "operation_scope":
        return context.blocks_affected > condition.max_blocks;

      case "time_of_day": {
        const hour = context.current_hour ?? new Date().getHours();
        const [start, end] = condition.allowed_hours;
        if (start <= end) {
          return hour >= start && hour < end;
        }
        // Handle overnight ranges (e.g., 22-6)
        return hour >= start || hour < end;
      }

      case "user_role":
        return context.user_role ? condition.roles.includes(context.user_role) : false;

      case "agent_type":
        return context.agent_type ? condition.allowed_types.includes(context.agent_type) : false;

      case "min_confidence":
        return context.confidence !== undefined ? context.confidence < condition.threshold : false;

      default:
        return false;
    }
  }

  private ruleAppliesToOp(rule: ContextRule, opCode: AIOpCode): boolean {
    if (rule.scope === "all") {
      return true;
    }
    return rule.scope.includes(opCode);
  }

  private resolveEffects(current: PolicyEffect, incoming: PolicyEffect): PolicyEffect {
    // Priority: deny > require_approval > log_only > allow
    const priority: Record<PolicyEffect, number> = {
      deny: 4,
      require_approval: 3,
      log_only: 2,
      allow: 1,
    };
    return priority[incoming] > priority[current] ? incoming : current;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a policy engine.
 */
export function createPolicyEngine(basePolicy: AISanitizationPolicyV1): PolicyEngine {
  return new InMemoryPolicyEngine(basePolicy);
}

/**
 * Create a risk assessor.
 */
export function createRiskAssessor(): RiskAssessor {
  return new DefaultRiskAssessor();
}
