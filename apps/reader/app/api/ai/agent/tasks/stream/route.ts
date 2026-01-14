import { createStreamResponse } from "../../../responseUtils";
import {
  type TaskStreamEvent,
  getTaskEventHistorySince,
  getTaskSnapshots,
  getTaskStats,
  subscribeTaskEvents,
} from "../../taskRuntime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const url = new URL(request.url);
  const lastEventIdParam = url.searchParams.get("lastEventId");
  const lastEventIdHeader = request.headers.get("last-event-id");
  const lastEventIdValue = lastEventIdParam ?? lastEventIdHeader;
  const lastEventId = lastEventIdValue ? Number(lastEventIdValue) : 0;
  const hasCursor = lastEventIdValue !== null && Number.isFinite(lastEventId);
  const history = hasCursor
    ? getTaskEventHistorySince(lastEventId)
    : { entries: [], hasGap: false };
  const includeSnapshot = !hasCursor || history.hasGap;
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let ready = false;
      const pending: Array<{ event: TaskStreamEvent; eventId: number }> = [];
      const send = (event: TaskStreamEvent, eventId?: number) => {
        if (closed) {
          return;
        }
        const lines = [];
        if (eventId !== undefined) {
          lines.push(`id: ${eventId}`);
        }
        lines.push(`data: ${JSON.stringify({ event })}`);
        lines.push("");
        controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
      };

      const unsubscribe = subscribeTaskEvents((event, eventId) => {
        if (!ready) {
          pending.push({ event, eventId });
          return;
        }
        send(event, eventId);
      });

      if (!includeSnapshot && history.entries.length > 0) {
        for (const entry of history.entries) {
          send(entry.event, entry.id);
        }
      }

      const snapshot = await getTaskSnapshots();
      send({
        type: "task.snapshot",
        timestamp: Date.now(),
        data: { tasks: snapshot, stats: getTaskStats() },
      });

      ready = true;
      if (pending.length > 0) {
        for (const entry of pending) {
          send(entry.event, entry.eventId);
        }
      }

      const ping = setInterval(() => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15000);

      cleanup = () => {
        closed = true;
        clearInterval(ping);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return createStreamResponse(stream);
}
