import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoworkSession } from "@ku0/agent-runtime";
import { describe, expect, it } from "vitest";
import { CoworkRuntimeBridge } from "../runtime/coworkRuntime";
import { ApprovalStore } from "../storage/approvalStore";

async function createApprovalStore() {
  const dir = await mkdtemp(join(tmpdir(), "cowork-approval-"));
  const store = new ApprovalStore(join(dir, "approvals.json"));
  return { store, dir };
}

function createSession(): CoworkSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    grants: [
      {
        id: "grant-1",
        rootPath: "/workspace",
        allowCreate: true,
        allowWrite: true,
        allowDelete: true,
      },
    ],
    connectors: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("CoworkRuntimeBridge", () => {
  it("allows file writes within grants without approval", async () => {
    const { store, dir } = await createApprovalStore();
    const runtime = new CoworkRuntimeBridge(store);
    const session = createSession();

    const result = await runtime.checkAction(session, {
      kind: "file",
      path: "/workspace/note.md",
      intent: "write",
    });

    expect(result.status).toBe("allowed");
    const approvals = await store.getAll();
    expect(approvals.length).toBe(0);

    await rm(dir, { recursive: true, force: true });
  });

  it("allows file reads within grants", async () => {
    const { store, dir } = await createApprovalStore();
    const runtime = new CoworkRuntimeBridge(store);
    const session = createSession();

    const result = await runtime.checkAction(session, {
      kind: "file",
      path: "/workspace/readme.md",
      intent: "read",
    });

    expect(result.status).toBe("allowed");
    const approvals = await store.getAll();
    expect(approvals.length).toBe(0);

    await rm(dir, { recursive: true, force: true });
  });

  it("requires approval for deletes", async () => {
    const { store, dir } = await createApprovalStore();
    const runtime = new CoworkRuntimeBridge(store);
    const session = createSession();

    const result = await runtime.checkAction(session, {
      kind: "file",
      path: "/workspace/old.md",
      intent: "delete",
    });

    expect(result.status).toBe("approval_required");
    const approvals = await store.getAll();
    expect(approvals.length).toBe(1);

    await rm(dir, { recursive: true, force: true });
  });
});
