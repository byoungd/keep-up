/**
 * Approval coordinator service
 * Handles approval workflow and user confirmation
 */

import type { CoworkRiskTag } from "@ku0/agent-runtime";
import type { ApprovalService } from "../../services/approvalService";
import type { ApprovalStoreLike, AuditLogStoreLike } from "../../storage/contracts";
import type { CoworkApproval, CoworkAuditEntry } from "../../storage/types";
import type { EventStreamPublisher } from "./EventStreamPublisher";

export class ApprovalCoordinator {
  constructor(
    private readonly approvalStore: ApprovalStoreLike,
    private readonly auditLogStore: AuditLogStoreLike,
    private readonly approvalService: ApprovalService,
    private readonly eventPublisher: EventStreamPublisher
  ) {}

  /**
   * Request user approval for an action
   */
  async requestApproval(params: {
    sessionId: string;
    taskId?: string;
    description: string;
    riskTags?: string[];
    reason?: string;
    toolName?: string;
  }): Promise<boolean> {
    const approvalId = crypto.randomUUID();
    const approval: CoworkApproval = {
      approvalId,
      sessionId: params.sessionId,
      taskId: params.taskId,
      action: params.description,
      riskTags: this.normalizeRiskTags(params.riskTags),
      reason: params.reason,
      status: "pending",
      createdAt: Date.now(),
    };

    await this.approvalStore.create(approval);

    this.eventPublisher.publishApprovalRequired({
      sessionId: params.sessionId,
      approvalId,
      action: approval.action,
      riskTags: approval.riskTags,
      reason: approval.reason,
      taskId: params.taskId,
    });

    await this.logAuditEntry({
      entryId: crypto.randomUUID(),
      sessionId: params.sessionId,
      taskId: params.taskId,
      timestamp: Date.now(),
      action: "approval_requested",
      toolName: params.toolName,
      riskTags: approval.riskTags,
      reason: params.reason,
    });

    const decision = await this.waitForApprovalDecision(params.sessionId, approvalId);

    await this.logAuditEntry({
      entryId: crypto.randomUUID(),
      sessionId: params.sessionId,
      taskId: params.taskId,
      timestamp: Date.now(),
      action: "approval_resolved",
      toolName: params.toolName,
      policyDecision: decision === "approved" ? "allow" : "deny",
      outcome: decision === "approved" ? "success" : "denied",
    });

    return decision === "approved";
  }

  /**
   * Resolve an approval
   */
  async resolveApproval(
    approvalId: string,
    status: "approved" | "rejected"
  ): Promise<CoworkApproval | null> {
    const updated = await this.approvalStore.update(approvalId, (approval) => ({
      ...approval,
      status,
      resolvedAt: Date.now(),
    }));

    if (!updated) {
      return null;
    }

    this.eventPublisher.publishApprovalResolved({
      sessionId: updated.sessionId,
      approvalId: updated.approvalId,
      status: updated.status,
      taskId: updated.taskId,
    });

    this.approvalService.resolveApproval(approvalId, status);

    return updated;
  }

  /**
   * Wait for approval decision
   */
  private async waitForApprovalDecision(
    _sessionId: string,
    approvalId: string
  ): Promise<"approved" | "rejected"> {
    const decision = await this.approvalService.waitForDecision(approvalId);
    const approval = await this.approvalStore.getById(approvalId);

    if (!approval) {
      return "rejected";
    }

    if (approval.status === "pending") {
      await this.resolveApproval(approvalId, decision);
    }

    return decision;
  }

  /**
   * Log audit entry
   */
  private async logAuditEntry(entry: CoworkAuditEntry): Promise<void> {
    try {
      await this.auditLogStore.log(entry);
    } catch (error) {
      if (this.isErrno(error, "ENOENT")) {
        return;
      }
    }
  }

  /**
   * Normalize risk tags to valid set
   */
  private normalizeRiskTags(tags?: string[]): CoworkRiskTag[] {
    if (!tags) {
      return [];
    }
    const validTags = new Set<CoworkRiskTag>([
      "delete",
      "overwrite",
      "network",
      "connector",
      "batch",
    ]);
    return tags.filter((tag): tag is CoworkRiskTag => validTags.has(tag as CoworkRiskTag));
  }

  /**
   * Check if error is ENOENT
   */
  private isErrno(error: unknown, code: string): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === code
    );
  }
}
