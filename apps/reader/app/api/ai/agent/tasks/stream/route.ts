import { createStreamResponse } from "../../../responseUtils";
import {
  type TaskStreamEvent,
  getTaskSnapshots,
  getTaskStats,
  subscribeTaskEvents,
} from "../../taskRuntime";

export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: TaskStreamEvent) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event })}\n\n`));
      };

      send({
        type: "task.snapshot",
        timestamp: Date.now(),
        data: { tasks: getTaskSnapshots(), stats: getTaskStats() },
      });

      const unsubscribe = subscribeTaskEvents((event) => {
        send(event);
      });

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
