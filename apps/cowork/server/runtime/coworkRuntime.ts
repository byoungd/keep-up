import {
  type CoworkFileIntent,
  CoworkPolicyEngine,
  type CoworkRiskTag,
  CoworkSandboxAdapter,
  type CoworkSandboxDecision,
  type CoworkSession,
  computeCoworkRiskScore,
  DEFAULT_COWORK_POLICY,
} from "@ku0/agent-runtime";
import type { ApprovalStoreLike, AuditLogStoreLike, ConfigStoreLike } from "../storage/contracts";
import type { CoworkApproval, CoworkAuditEntry } from "../storage/types";
import { resolveCoworkPolicyConfig } from "./policyResolver";

export type ToolCheckRequest =
  | {
      kind: "file";
      path: string;
      intent: CoworkFileIntent;
      reason?: string;
      fileSizeBytes?: number;
    }
  | {
      kind: "network";
      host: string;
      reason?: string;
    }
  | {
      kind: "connector";
      connectorScopeAllowed: boolean;
      reason?: string;
    };

export type ToolCheckResult =
  | {
      status: "allowed";
      decision: CoworkSandboxDecision;
    }
  | {
      status: "approval_required";
      decision: CoworkSandboxDecision;
      approval: CoworkApproval;
    }
  | {
      status: "denied";
      decision: CoworkSandboxDecision;
    };

export class CoworkRuntimeBridge {
  private readonly policyEngine: CoworkPolicyEngine;
  private readonly approvals: ApprovalStoreLike;
  private readonly auditLogs?: AuditLogStoreLike;
  private readonly configStore?: ConfigStoreLike;
  private readonly repoRoot?: string;

  constructor(
    approvals: ApprovalStoreLike,
    policyEngine?: CoworkPolicyEngine,
    auditLogs?: AuditLogStoreLike,
    options: { configStore?: ConfigStoreLike; repoRoot?: string } = {}
  ) {
    this.policyEngine = policyEngine ?? new CoworkPolicyEngine(DEFAULT_COWORK_POLICY);
    this.approvals = approvals;
    this.auditLogs = auditLogs;
    this.configStore = options.configStore;
    this.repoRoot = options.repoRoot;
  }

  async checkAction(session: CoworkSession, request: ToolCheckRequest): Promise<ToolCheckResult> {
    const { policyEngine, caseInsensitivePaths } = await this.resolvePolicyEngine(session);
    const sandbox = new CoworkSandboxAdapter(policyEngine);
    const decision = this.evaluate(sandbox, session, request, caseInsensitivePaths);
    const riskTags = toCoworkRiskTags(decision.riskTags);
    void this.logDecision(session.sessionId, request, decision);
    if (decision.decision === "deny") {
      return { status: "denied", decision };
    }
    if (decision.decision === "allow_with_confirm") {
      const approval = await this.createApproval(session.sessionId, request, riskTags);
      return { status: "approval_required", decision, approval };
    }
    return { status: "allowed", decision };
  }

  private evaluate(
    sandbox: CoworkSandboxAdapter,
    session: CoworkSession,
    request: ToolCheckRequest,
    caseInsensitivePaths: boolean
  ): CoworkSandboxDecision {
    if (request.kind === "file") {
      return sandbox.evaluateFileAction({
        session,
        path: request.path,
        intent: request.intent,
        fileSizeBytes: request.fileSizeBytes,
        caseInsensitivePaths,
      });
    }
    if (request.kind === "network") {
      return sandbox.evaluateNetworkAction({
        session,
        host: request.host,
      });
    }
    return sandbox.evaluateConnectorAction({
      session,
      connectorScopeAllowed: request.connectorScopeAllowed,
    });
  }

  private async resolvePolicyEngine(
    session: CoworkSession
  ): Promise<{ policyEngine: CoworkPolicyEngine; caseInsensitivePaths: boolean }> {
    if (!this.configStore) {
      return { policyEngine: this.policyEngine, caseInsensitivePaths: false };
    }

    const settings = await this.configStore.get();
    const resolution = await resolveCoworkPolicyConfig({
      repoRoot: this.repoRoot ?? process.cwd(),
      settings,
      auditLogStore: this.auditLogs,
      sessionId: session.sessionId,
    });

    return {
      policyEngine: new CoworkPolicyEngine(resolution.config),
      caseInsensitivePaths: settings.caseInsensitivePaths ?? false,
    };
  }

  private async logDecision(
    sessionId: string,
    request: ToolCheckRequest,
    decision: CoworkSandboxDecision
  ): Promise<void> {
    if (!this.auditLogs) {
      return;
    }
    const entry: CoworkAuditEntry = {
      entryId: crypto.randomUUID(),
      sessionId,
      timestamp: Date.now(),
      action: "policy_decision",
      toolName: this.describeAction(request),
      input: buildDecisionInput(request),
      policyDecision: decision.decision,
      policyRuleId: decision.ruleId,
      riskTags: toCoworkRiskTags(decision.riskTags),
      riskScore: computeCoworkRiskScore(decision.riskTags, decision.decision),
      reason: decision.reason,
      outcome: decision.decision === "deny" ? "denied" : "success",
    };
    await this.auditLogs.log(entry);
  }

  private async createApproval(
    sessionId: string,
    request: ToolCheckRequest,
    riskTags: CoworkRiskTag[]
  ): Promise<CoworkApproval> {
    const approval: CoworkApproval = {
      approvalId: crypto.randomUUID(),
      sessionId,
      action: this.describeAction(request),
      riskTags,
      reason: request.reason,
      status: "pending",
      createdAt: Date.now(),
    };
    await this.approvals.create(approval);
    return approval;
  }

  private describeAction(request: ToolCheckRequest): string {
    if (request.kind === "file") {
      return `file.${request.intent}:${request.path}`;
    }
    if (request.kind === "network") {
      return `network.request:${request.host}`;
    }
    return `connector.action:${request.connectorScopeAllowed ? "allowed" : "blocked"}`;
  }
}

function buildDecisionInput(request: ToolCheckRequest): Record<string, unknown> {
  if (request.kind === "file") {
    return {
      kind: request.kind,
      path: request.path,
      intent: request.intent,
      fileSizeBytes: request.fileSizeBytes,
    };
  }
  if (request.kind === "network") {
    return {
      kind: request.kind,
      host: request.host,
    };
  }
  return {
    kind: request.kind,
    connectorScopeAllowed: request.connectorScopeAllowed,
  };
}

const COWORK_RISK_TAGS: CoworkRiskTag[] = ["delete", "overwrite", "network", "connector", "batch"];

function toCoworkRiskTags(tags: string[]): CoworkRiskTag[] {
  const allowed = new Set<CoworkRiskTag>(COWORK_RISK_TAGS);
  return tags.filter((tag): tag is CoworkRiskTag => allowed.has(tag as CoworkRiskTag));
}
