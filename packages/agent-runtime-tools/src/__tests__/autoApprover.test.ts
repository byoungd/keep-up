import { describe, expect, it } from "vitest";
import { AutoApprover } from "../approval/AutoApprover";
import type { ApprovalPolicy } from "../approval/types";

describe("AutoApprover", () => {
  it("approves matching policy", () => {
    const policies: ApprovalPolicy[] = [
      {
        name: "allow-file-read",
        tools: ["file:read"],
        action: "approve",
        priority: 10,
      },
    ];

    const approver = new AutoApprover({ policies });
    const decision = approver.shouldAutoApprove(
      "file:read",
      { path: "/workspace/readme.md" },
      { workspacePaths: ["/workspace"] }
    );

    expect(decision.approved).toBe(true);
    expect(decision.requiresUserConfirmation).toBe(false);
  });

  it("blocks paths outside workspace", () => {
    const approver = new AutoApprover({ policies: [] });
    const decision = approver.shouldAutoApprove(
      "file:write",
      { path: "/tmp/notes.txt" },
      { workspacePaths: ["/workspace"] }
    );

    expect(decision.approved).toBe(false);
    expect(decision.requiresUserConfirmation).toBe(true);
  });

  it("denies when policy says deny", () => {
    const policies: ApprovalPolicy[] = [
      {
        name: "deny-all",
        tools: ["*"],
        action: "deny",
        priority: 1,
      },
    ];

    const approver = new AutoApprover({ policies });
    const decision = approver.shouldAutoApprove(
      "file:read",
      { path: "/workspace/readme.md" },
      { workspacePaths: ["/workspace"] }
    );

    expect(decision.approved).toBe(false);
    expect(decision.requiresUserConfirmation).toBe(false);
  });
});
