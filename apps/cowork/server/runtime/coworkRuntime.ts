import {
  type CoworkFileIntent,
  CoworkPolicyEngine,
  type CoworkRiskTag,
  CoworkSandboxAdapter,
  type CoworkSandboxDecision,
  type CoworkSession,
  DEFAULT_COWORK_POLICY,
} from "@ku0/agent-runtime";
import type { ApprovalStoreLike } from "../storage";
import type { CoworkApproval } from "../storage/types";

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
  private readonly sandbox: CoworkSandboxAdapter;

  constructor(approvals: ApprovalStoreLike, policyEngine?: CoworkPolicyEngine) {
    this.policyEngine = policyEngine ?? new CoworkPolicyEngine(DEFAULT_COWORK_POLICY);
    this.approvals = approvals;
    this.sandbox = new CoworkSandboxAdapter(this.policyEngine);
  }

  async checkAction(session: CoworkSession, request: ToolCheckRequest): Promise<ToolCheckResult> {
    const decision = this.evaluate(session, request);
    if (decision.decision === "deny") {
      return { status: "denied", decision };
    }
    if (decision.decision === "allow_with_confirm") {
      const approval = await this.createApproval(session.sessionId, request, decision.riskTags);
      return { status: "approval_required", decision, approval };
    }
    return { status: "allowed", decision };
  }

  private evaluate(session: CoworkSession, request: ToolCheckRequest): CoworkSandboxDecision {
    if (request.kind === "file") {
      return this.sandbox.evaluateFileAction({
        session,
        path: request.path,
        intent: request.intent,
        fileSizeBytes: request.fileSizeBytes,
      });
    }
    if (request.kind === "network") {
      return this.sandbox.evaluateNetworkAction({
        session,
        host: request.host,
      });
    }
    return this.sandbox.evaluateConnectorAction({
      session,
      connectorScopeAllowed: request.connectorScopeAllowed,
    });
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
