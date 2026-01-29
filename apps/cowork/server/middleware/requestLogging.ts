import { randomUUID } from "node:crypto";
import type { Logger } from "../logger";

export function createRequestLoggingMiddleware(logger: Logger) {
  return async (
    c: {
      req: { header: (name: string) => string | undefined; method: string; path: string };
      res?: { status?: number };
      header: (name: string, value: string) => void;
      set: (name: string, value: string) => void;
    },
    next: () => Promise<void>
  ) => {
    const start = performance.now();
    const incomingRequestId = c.req.header("x-request-id");
    const requestId = incomingRequestId?.trim() ? incomingRequestId : randomUUID();
    c.set("requestId", requestId);

    try {
      await next();
    } finally {
      const status = c.res?.status ?? 500;
      const durationMs = Math.round(performance.now() - start);
      c.header("x-request-id", requestId);
      logger.info("request.completed", {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs,
      });
    }
  };
}
