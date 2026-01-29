import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClarificationRoutes } from "../routes/clarifications";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";

describe("Clarification routes", () => {
  let app: Hono;
  let taskRuntime: CoworkTaskRuntime;

  beforeEach(() => {
    taskRuntime = {
      listClarifications: vi.fn(() => [{ requestId: "c1", prompt: "Need input" }]),
      submitClarification: vi.fn(),
    } as unknown as CoworkTaskRuntime;

    app = createClarificationRoutes({ taskRuntime });
  });

  it("returns 503 when runtime is unavailable", async () => {
    const offlineApp = createClarificationRoutes({});
    const res = await offlineApp.request("/sessions/session-1/clarifications");
    expect(res.status).toBe(503);
  });

  it("lists clarifications for a session", async () => {
    const res = await app.request("/sessions/session-1/clarifications");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; clarifications: unknown[] };
    expect(data.ok).toBe(true);
    expect(data.clarifications).toHaveLength(1);
  });

  it("rejects clarification updates when runtime is unavailable", async () => {
    const offlineApp = createClarificationRoutes({});
    const res = await offlineApp.request("/clarifications/clarification-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "ok" }),
    });
    expect(res.status).toBe(503);
  });

  it("rejects invalid clarification responses", async () => {
    const res = await app.request("/clarifications/clarification-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when clarification is missing", async () => {
    const submitClarification = taskRuntime.submitClarification as ReturnType<typeof vi.fn>;
    submitClarification.mockReturnValueOnce(null);

    const res = await app.request("/clarifications/clarification-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "ok" }),
    });
    expect(res.status).toBe(404);
  });

  it("submits clarification responses", async () => {
    const submitClarification = taskRuntime.submitClarification as ReturnType<typeof vi.fn>;
    submitClarification.mockReturnValueOnce({ requestId: "c1", status: "answered" });

    const res = await app.request("/clarifications/clarification-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "ok", selectedOption: 1 }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; response: { requestId: string } };
    expect(data.ok).toBe(true);
    expect(data.response.requestId).toBe("c1");
    expect(submitClarification).toHaveBeenCalledWith({
      requestId: "clarification-1",
      answer: "ok",
      selectedOption: 1,
    });
  });
});
