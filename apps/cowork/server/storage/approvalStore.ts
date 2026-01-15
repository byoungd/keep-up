import { JsonStore } from "./jsonStore";
import type { CoworkApproval } from "./types";

export class ApprovalStore {
  private readonly store: JsonStore<CoworkApproval>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkApproval>({
      filePath,
      idKey: "approvalId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkApproval[]> {
    return this.store.getAll();
  }

  getById(approvalId: string): Promise<CoworkApproval | null> {
    return this.store.getById(approvalId);
  }

  getBySession(sessionId: string): Promise<CoworkApproval[]> {
    return this.store
      .getAll()
      .then((items) => items.filter((item) => item.sessionId === sessionId));
  }

  create(approval: CoworkApproval): Promise<CoworkApproval> {
    return this.store.upsert(approval);
  }

  update(
    approvalId: string,
    updater: (approval: CoworkApproval) => CoworkApproval
  ): Promise<CoworkApproval | null> {
    return this.store.update(approvalId, updater);
  }
}

export function createApprovalStore(filePath: string): ApprovalStore {
  return new ApprovalStore(filePath);
}
