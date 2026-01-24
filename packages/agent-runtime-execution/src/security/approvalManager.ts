/**
 * Approval Manager
 *
 * Tracks approval requests with explicit status transitions and optional timeouts.
 */

export type SecurityApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ApprovalKind = "tool" | "plan" | "escalation";

export interface ApprovalRecord<RequestT = unknown> {
  id: string;
  kind: ApprovalKind;
  request: RequestT;
  status: SecurityApprovalStatus;
  requestedAt: number;
  resolvedAt?: number;
  expiresAt?: number;
  reason?: string;
}

export interface SecurityApprovalDecision {
  status: SecurityApprovalStatus;
  approved: boolean;
  reason?: string;
}

export interface ApprovalRequestOptions {
  timeoutMs?: number;
}

export type ApprovalHandler<RequestT> = (
  request: RequestT
) => Promise<boolean | SecurityApprovalDecision>;

/**
 * Audit logger for approval events.
 * Implement this interface to integrate with external compliance/audit systems.
 */
export interface ApprovalAuditLogger {
  logRequest?(record: ApprovalRecord): void | Promise<void>;
  logResolution?(record: ApprovalRecord, decision: SecurityApprovalDecision): void | Promise<void>;
}

export interface ApprovalManagerConfig {
  auditLogger?: ApprovalAuditLogger;
}

export class ApprovalManager {
  private readonly records = new Map<string, ApprovalRecord>();
  private readonly auditLogger?: ApprovalAuditLogger;
  private counter = 0;

  constructor(config: ApprovalManagerConfig = {}) {
    this.auditLogger = config.auditLogger;
  }

  async request<RequestT>(
    kind: ApprovalKind,
    request: RequestT,
    handler?: ApprovalHandler<RequestT>,
    options: ApprovalRequestOptions = {}
  ): Promise<SecurityApprovalDecision> {
    const record = this.createRecord(kind, request, options.timeoutMs);
    if (!handler) {
      return this.resolve(record.id, {
        status: "rejected",
        approved: false,
        reason: "Approval handler not configured",
      });
    }

    try {
      const decision = await this.awaitDecision(handler, request, options.timeoutMs);
      return this.resolve(record.id, decision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.resolve(record.id, {
        status: "rejected",
        approved: false,
        reason: message,
      });
    }
  }

  get(id: string): ApprovalRecord | undefined {
    return this.records.get(id);
  }

  list(): ApprovalRecord[] {
    return Array.from(this.records.values());
  }

  clear(): void {
    this.records.clear();
  }

  private createRecord<RequestT>(
    kind: ApprovalKind,
    request: RequestT,
    timeoutMs?: number
  ): ApprovalRecord<RequestT> {
    const now = Date.now();
    this.counter += 1;
    const id = `approval_${now.toString(36)}_${this.counter.toString(36)}`;
    const record: ApprovalRecord<RequestT> = {
      id,
      kind,
      request,
      status: "pending",
      requestedAt: now,
      expiresAt: timeoutMs ? now + timeoutMs : undefined,
    };
    this.records.set(id, record);
    void Promise.resolve(this.auditLogger?.logRequest?.(record)).catch(() => undefined);
    return record;
  }

  private resolve(id: string, decision: SecurityApprovalDecision): SecurityApprovalDecision {
    const record = this.records.get(id);
    if (!record) {
      return decision;
    }

    record.status = decision.status;
    record.resolvedAt = Date.now();
    record.reason = decision.reason;
    this.records.set(id, record);
    void Promise.resolve(this.auditLogger?.logResolution?.(record, decision)).catch(
      () => undefined
    );
    return decision;
  }

  private async awaitDecision<RequestT>(
    handler: ApprovalHandler<RequestT>,
    request: RequestT,
    timeoutMs?: number
  ): Promise<SecurityApprovalDecision> {
    if (!timeoutMs) {
      return this.normalizeDecision(await handler(request));
    }

    return new Promise<SecurityApprovalDecision>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ status: "expired", approved: false, reason: "Approval timed out" });
      }, timeoutMs);

      void Promise.resolve(handler(request))
        .then((result) => {
          clearTimeout(timeout);
          resolve(this.normalizeDecision(result));
        })
        .catch((error) => {
          clearTimeout(timeout);
          const message = error instanceof Error ? error.message : String(error);
          resolve({ status: "rejected", approved: false, reason: message });
        });
    });
  }

  private normalizeDecision(result: boolean | SecurityApprovalDecision): SecurityApprovalDecision {
    if (typeof result === "boolean") {
      return {
        status: result ? "approved" : "rejected",
        approved: result,
      };
    }
    return result;
  }
}
