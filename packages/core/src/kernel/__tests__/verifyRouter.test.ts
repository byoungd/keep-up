import { describe, expect, it, vi } from "vitest";
import type { AnnoAction } from "../annotations/index.js";
import { routeVerifyAction } from "../annotations/verifyRouter.js";
import { CheckpointScheduler } from "../integrity/checkpoint.js";
import type { IntegrityPolicy } from "../policy/index.js";

const defaultPolicy: IntegrityPolicy = {
  version: "v3",
  context_hash: { enabled: true, mode: "lazy_verify", debounce_ms: 10 },
  chain_hash: { enabled: true, mode: "eager" },
  document_checksum: {
    enabled: true,
    mode: "lazy_verify",
    strategy: "two_tier",
    algorithm: "LFCC_DOC_V1",
  },
  checkpoint: { enabled: true, every_ops: 5, every_ms: 1000 },
};

describe("routeVerifyAction", () => {
  it("routes TRIGGER_VERIFY to scheduler with priority", async () => {
    const scheduler = new CheckpointScheduler(defaultPolicy, async () => {
      // noop
    });
    const spy = vi.spyOn(scheduler, "triggerVerify");

    const action: AnnoAction = { type: "TRIGGER_VERIFY", priority: "high" };
    const result = routeVerifyAction(action, scheduler);

    expect(result).toBeNull();
    expect(spy).toHaveBeenCalledWith("high");
  });

  it("returns non-verify actions untouched", () => {
    const scheduler = new CheckpointScheduler(defaultPolicy, async () => {
      // noop
    });
    const action: AnnoAction = { type: "PERSIST_STATE", state: "active" };
    const result = routeVerifyAction(action, scheduler);
    expect(result).toEqual(action);
  });
});
