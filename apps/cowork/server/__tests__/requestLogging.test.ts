import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createRequestLoggingMiddleware } from "../middleware/requestLogging";

function createTestApp(logger: {
  info: (message: string, meta?: Record<string, unknown>) => void;
}) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", createRequestLoggingMiddleware(logger));
  app.get("/api/health", (c) => c.json({ ok: true }));
  return app;
}

describe("Cowork request logging", () => {
  it("adds a request id when missing", async () => {
    const logger = {
      info: vi.fn(),
    };
    const app = createTestApp(logger);
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    expect(logger.info).toHaveBeenCalledWith(
      "request.completed",
      expect.objectContaining({ status: 200 })
    );
  });

  it("echoes incoming request ids", async () => {
    const logger = {
      info: vi.fn(),
    };
    const app = createTestApp(logger);
    const response = await app.request("/api/health", {
      headers: { "x-request-id": "req-test-1" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-test-1");
  });
});
