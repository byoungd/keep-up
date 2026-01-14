import { describe, expect, it } from "vitest";
import { createPendingConfirmation, resolvePendingConfirmation } from "../confirmationStore";

describe("confirmationStore", () => {
  it("resolves pending confirmations", async () => {
    const { confirmationId, promise } = createPendingConfirmation({ requestId: "req-1" });
    const result = resolvePendingConfirmation({
      confirmationId,
      confirmed: true,
      requestId: "req-1",
    });

    expect(result.status).toBe("resolved");
    await expect(promise).resolves.toBe(true);
  });

  it("returns not_found for unknown confirmations", () => {
    const result = resolvePendingConfirmation({
      confirmationId: "missing",
      confirmed: false,
    });

    expect(result.status).toBe("not_found");
  });
});
