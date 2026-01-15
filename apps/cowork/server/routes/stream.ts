import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SessionEventHub } from "../streaming/eventHub";

interface StreamRouteDeps {
  events: SessionEventHub;
}

export function createStreamRoutes(deps: StreamRouteDeps) {
  const app = new Hono();

  app.get("/sessions/:sessionId/stream", (c) => {
    const sessionId = c.req.param("sessionId");
    const lastEventId = c.req.header("Last-Event-ID") ?? c.req.query("lastEventId");

    return streamSSE(c, async (stream) => {
      const send = async (event: { id: string; type: string; data: unknown }) => {
        await stream.writeSSE({
          id: event.id,
          event: event.type,
          data: JSON.stringify(event.data),
        });
      };

      for (const event of deps.events.listSince(sessionId, lastEventId)) {
        await send(event);
      }

      const hello = deps.events.publish(sessionId, "hello", {
        sessionId,
        time: Date.now(),
      });
      await send(hello);

      const unsubscribe = deps.events.subscribe(sessionId, (event) => send(event));

      stream.onAbort(() => {
        unsubscribe();
      });
    });
  });

  return app;
}
