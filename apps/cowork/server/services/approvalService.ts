export type ApprovalDecision = "approved" | "rejected";

type PendingApproval = {
  promise: Promise<ApprovalDecision>;
  resolve: (decision: ApprovalDecision) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
};

type ResolvedApproval = {
  decision: ApprovalDecision;
  expiresAt: number;
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class ApprovalService {
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly resolvedApprovals = new Map<string, ResolvedApproval>();
  private readonly defaultTimeoutMs: number;

  constructor(options?: { defaultTimeoutMs?: number }) {
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async waitForDecision(
    approvalId: string,
    timeoutMs: number = this.defaultTimeoutMs
  ): Promise<ApprovalDecision> {
    const resolved = this.resolvedApprovals.get(approvalId);
    if (resolved && resolved.expiresAt > Date.now()) {
      this.resolvedApprovals.delete(approvalId);
      return resolved.decision;
    }
    if (resolved) {
      this.resolvedApprovals.delete(approvalId);
    }

    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      return pending.promise;
    }

    let resolvePromise!: (decision: ApprovalDecision) => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<ApprovalDecision>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const timeoutId = setTimeout(() => {
      this.pendingApprovals.delete(approvalId);
      resolvePromise("rejected");
    }, timeoutMs);

    this.pendingApprovals.set(approvalId, {
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      timeoutId,
    });

    return promise;
  }

  resolveApproval(approvalId: string, decision: ApprovalDecision): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      this.pendingApprovals.delete(approvalId);
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pending.resolve(decision);
      return true;
    }

    this.resolvedApprovals.set(approvalId, {
      decision,
      expiresAt: Date.now() + this.defaultTimeoutMs,
    });
    return false;
  }
}
