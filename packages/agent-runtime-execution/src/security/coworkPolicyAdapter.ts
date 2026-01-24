/**
 * Cowork Tool Policy Adapter
 *
 * Enforces Cowork policyAction metadata and evaluates Cowork policy decisions
 * for tool calls with deterministic, fail-closed behavior.
 */

import type { CoworkPolicyActionLike, MCPTool, ToolPolicyContext } from "@ku0/agent-runtime-core";
import { type CoworkPolicyDecisionType, isCoworkPolicyAction } from "../cowork/policy";
import type { ToolPolicyDecision, ToolPolicyEngine } from "../types";

export class CoworkToolPolicyAdapter implements ToolPolicyEngine {
  constructor(private readonly base: ToolPolicyEngine) {}

  evaluate(context: ToolPolicyContext): ToolPolicyDecision {
    const baseDecision = this.base.evaluate(context);
    if (!baseDecision.allowed) {
      return baseDecision;
    }

    const cowork = context.context.cowork;
    if (!cowork) {
      return baseDecision;
    }

    const toolDefinition = context.toolDefinition;
    if (!toolDefinition) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "Tool definition missing for policy evaluation",
        reasonCode: "policy:tool_definition_missing",
        riskTags: baseDecision.riskTags,
        escalation: baseDecision.escalation,
      };
    }

    const policyAction = toolDefinition.annotations?.policyAction;
    if (!policyAction || !isCoworkPolicyAction(policyAction)) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "Tool policyAction is missing or invalid",
        reasonCode: "policy:action_invalid",
        riskTags: baseDecision.riskTags,
        escalation: baseDecision.escalation,
      };
    }

    const outcome = evaluateCoworkPolicy(policyAction, context, toolDefinition);

    if (outcome.decision === "deny") {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: outcome.reason ?? baseDecision.reason,
        reasonCode: outcome.reasonCode ?? baseDecision.reasonCode,
        riskTags: mergeRiskTags(baseDecision.riskTags, outcome.riskTags),
        escalation: baseDecision.escalation,
        policyDecision: "deny",
        policyRuleId: outcome.ruleId,
        policyAction,
      };
    }

    const requiresConfirmation =
      baseDecision.requiresConfirmation || outcome.decision === "allow_with_confirm";
    const reason = outcome.reason ?? baseDecision.reason;
    const reasonCode = outcome.reasonCode ?? baseDecision.reasonCode;

    return {
      allowed: true,
      requiresConfirmation,
      reason,
      reasonCode,
      riskTags: mergeRiskTags(baseDecision.riskTags, outcome.riskTags),
      escalation: baseDecision.escalation,
      policyDecision: outcome.decision,
      policyRuleId: outcome.ruleId,
      policyAction,
    };
  }
}

type CoworkPolicyEvaluation = {
  decision: CoworkPolicyDecisionType;
  reason?: string;
  reasonCode?: string;
  ruleId?: string;
  riskTags?: string[];
};

type CoworkContext = NonNullable<ToolPolicyContext["context"]["cowork"]>;

function evaluateCoworkPolicy(
  policyAction: CoworkPolicyActionLike,
  context: ToolPolicyContext,
  toolDefinition: MCPTool
): CoworkPolicyEvaluation {
  const cowork = context.context.cowork;
  if (!cowork) {
    return {
      decision: "deny",
      reason: "Cowork context missing for policy evaluation",
      reasonCode: "policy:cowork_missing",
    };
  }

  const derivedRiskTags = deriveRiskTags(context, policyAction);
  if (policyAction === "file.read" || policyAction === "file.write") {
    return evaluateFilePolicy(cowork, policyAction, context, derivedRiskTags);
  }

  if (policyAction === "network.request") {
    return evaluateNetworkPolicy(cowork, context, derivedRiskTags);
  }

  return evaluateConnectorPolicy(cowork, policyAction, context, toolDefinition, derivedRiskTags);
}

function evaluateFilePolicy(
  cowork: CoworkContext,
  policyAction: CoworkPolicyActionLike,
  context: ToolPolicyContext,
  derivedRiskTags: string[]
): CoworkPolicyEvaluation {
  const paths = extractAffectedPaths(context.call.arguments);
  if (paths.length === 0) {
    return {
      decision: "deny",
      reason: "File policy action missing path",
      reasonCode: "policy:file_path_missing",
    };
  }

  let mergedRiskTags: string[] | undefined = derivedRiskTags;
  let matchedRuleId: string | undefined;
  let matchedReason: string | undefined;
  let matchedDecision: CoworkPolicyDecisionType | undefined;

  for (const path of paths) {
    const decision = cowork.policyEngine.evaluate({
      action: policyAction,
      path,
      grantRoots: collectGrantRoots(cowork.session),
      outputRoots: collectOutputRoots(cowork.session),
      fileSizeBytes: extractFileSize(context.call.arguments),
      caseInsensitivePaths: cowork.caseInsensitivePaths,
    });

    mergedRiskTags = mergeRiskTags(mergedRiskTags, decision.riskTags);
    if (!matchedRuleId) {
      matchedRuleId = decision.ruleId;
    }
    if (!matchedReason) {
      matchedReason = decision.reason;
    }
    if (!matchedDecision) {
      matchedDecision = decision.decision;
    }

    if (decision.decision === "deny") {
      return {
        decision: "deny",
        reason: decision.reason,
        reasonCode: "policy:deny",
        ruleId: decision.ruleId,
        riskTags: mergedRiskTags,
      };
    }
  }

  return {
    decision: matchedDecision ?? "allow",
    reason: matchedReason,
    reasonCode: matchedDecision ? "policy:allow" : undefined,
    ruleId: matchedRuleId,
    riskTags: mergedRiskTags,
  };
}

function evaluateNetworkPolicy(
  cowork: CoworkContext,
  context: ToolPolicyContext,
  derivedRiskTags: string[]
): CoworkPolicyEvaluation {
  const host = extractHost(context.call.arguments);
  if (!host) {
    return {
      decision: "deny",
      reason: "Network policy action missing host",
      reasonCode: "policy:host_missing",
      riskTags: derivedRiskTags,
    };
  }

  const decision = cowork.policyEngine.evaluate({
    action: "network.request",
    host,
    hostAllowlist: context.context.security.sandbox.allowedHosts,
  });

  return {
    decision: decision.decision,
    reason: decision.reason,
    reasonCode: decision.decision === "deny" ? "policy:deny" : undefined,
    ruleId: decision.ruleId,
    riskTags: mergeRiskTags(derivedRiskTags, decision.riskTags),
  };
}

function evaluateConnectorPolicy(
  cowork: CoworkContext,
  policyAction: CoworkPolicyActionLike,
  context: ToolPolicyContext,
  toolDefinition: MCPTool,
  derivedRiskTags: string[]
): CoworkPolicyEvaluation {
  const connectorStatus = resolveConnectorScopeAllowed(context, toolDefinition, policyAction);
  if (!connectorStatus.allowed) {
    return {
      decision: "deny",
      reason: connectorStatus.reason ?? "Connector scope not allowed",
      reasonCode: "policy:connector_scope",
      riskTags: derivedRiskTags,
    };
  }

  const decision = cowork.policyEngine.evaluate({
    action: policyAction,
    connectorScopeAllowed: connectorStatus.allowed,
  });

  return {
    decision: decision.decision,
    reason: decision.reason,
    reasonCode: decision.decision === "deny" ? "policy:deny" : undefined,
    ruleId: decision.ruleId,
    riskTags: mergeRiskTags(derivedRiskTags, decision.riskTags),
  };
}

function deriveRiskTags(
  context: ToolPolicyContext,
  policyAction: CoworkPolicyActionLike
): string[] {
  const tags = new Set<string>();

  if (policyAction === "network.request") {
    tags.add("network");
  }

  if (policyAction.startsWith("connector.")) {
    tags.add("connector");
  }

  if (policyAction.startsWith("file.")) {
    const operation = context.operation.toLowerCase();
    if (operation === "delete") {
      tags.add("delete");
    } else if (operation !== "read" && operation !== "list" && operation !== "info") {
      tags.add("overwrite");
    }
  }

  if (context.context.toolExecution?.policy === "batch") {
    tags.add("batch");
  }

  return Array.from(tags);
}

function collectGrantRoots(
  session: NonNullable<ToolPolicyContext["context"]["cowork"]>["session"]
) {
  return session.grants.map((grant) => grant.rootPath);
}

function collectOutputRoots(
  session: NonNullable<ToolPolicyContext["context"]["cowork"]>["session"]
) {
  const roots: string[] = [];
  for (const grant of session.grants) {
    if (grant.outputRoots) {
      roots.push(...grant.outputRoots);
    }
  }
  return roots;
}

function extractAffectedPaths(args: Record<string, unknown>): string[] {
  const paths: string[] = [];
  if (typeof args.path === "string") {
    paths.push(args.path);
  }
  if (Array.isArray(args.paths)) {
    for (const entry of args.paths) {
      if (typeof entry === "string") {
        paths.push(entry);
      }
    }
  }
  if (typeof args.srcPath === "string") {
    paths.push(args.srcPath);
  }
  if (typeof args.sourcePath === "string") {
    paths.push(args.sourcePath);
  }
  if (typeof args.destPath === "string") {
    paths.push(args.destPath);
  }
  if (typeof args.targetPath === "string") {
    paths.push(args.targetPath);
  }
  if (typeof args.from === "string") {
    paths.push(args.from);
  }
  if (typeof args.to === "string") {
    paths.push(args.to);
  }
  if (typeof args.imagePath === "string") {
    paths.push(args.imagePath);
  }
  if (typeof args.audioPath === "string") {
    paths.push(args.audioPath);
  }
  return paths;
}

function extractHost(args: Record<string, unknown>): string | null {
  if (typeof args.host === "string") {
    return args.host;
  }
  if (typeof args.url === "string") {
    try {
      return new URL(args.url).host;
    } catch {
      return null;
    }
  }
  return null;
}

function extractFileSize(args: Record<string, unknown>): number | undefined {
  const size = args.fileSizeBytes ?? args.sizeBytes ?? args.size;
  if (typeof size === "number" && Number.isFinite(size)) {
    return size;
  }
  return undefined;
}

function resolveConnectorScopeAllowed(
  context: ToolPolicyContext,
  toolDefinition: MCPTool,
  policyAction: CoworkPolicyActionLike
): { allowed: boolean; reason?: string } {
  const cowork = context.context.cowork;
  if (!cowork) {
    return { allowed: false, reason: "Cowork context missing" };
  }

  const connectorId = resolveConnectorId(context.call.arguments, toolDefinition);
  const isRemote = typeof toolDefinition.metadata?.mcpServer === "string";

  if (!connectorId) {
    if (isRemote) {
      return { allowed: false, reason: "Connector id not provided" };
    }
    return { allowed: true };
  }

  const grant = cowork.session.connectors.find((entry) => entry.id === connectorId);
  if (!grant) {
    return { allowed: false, reason: "Connector not granted" };
  }

  if (policyAction === "connector.action" && !grant.allowActions) {
    return { allowed: false, reason: "Connector actions not allowed" };
  }

  const requiredScopes = toolDefinition.annotations?.requiredScopes ?? [];
  if (requiredScopes.length > 0) {
    const grantScopes = grant.scopes ?? [];
    const hasAllScopes = requiredScopes.every((scope) => grantScopes.includes(scope));
    if (!hasAllScopes) {
      return { allowed: false, reason: "Connector scopes not allowed" };
    }
  }

  return { allowed: true };
}

function resolveConnectorId(args: Record<string, unknown>, toolDefinition: MCPTool): string | null {
  const connectorId =
    typeof args.connectorId === "string"
      ? args.connectorId
      : typeof args.connector === "string"
        ? args.connector
        : null;
  if (connectorId) {
    return connectorId;
  }
  return typeof toolDefinition.metadata?.mcpServer === "string"
    ? toolDefinition.metadata.mcpServer
    : null;
}

function mergeRiskTags(first?: string[], second?: string[]): string[] | undefined {
  const set = new Set<string>();
  for (const group of [first, second]) {
    if (!group) {
      continue;
    }
    for (const tag of group) {
      set.add(tag);
    }
  }
  return set.size > 0 ? Array.from(set) : undefined;
}
