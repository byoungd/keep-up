import { createStreamResponse } from "../../../responseUtils";
import {
  type TaskStreamEvent,
  getPendingConfirmationEvents,
  getTaskEventHistorySince,
  getTaskSnapshots,
  getTaskStats,
  subscribeTaskEvents,
} from "../../taskRuntime";

export const runtime = "nodejs";

type BufferedEvent = { event: TaskStreamEvent; eventId: number };

function createEventSender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  state: { closed: boolean }
) {
  return (event: TaskStreamEvent, eventId?: number) => {
    if (state.closed) {
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
}

function createBufferedHandler(
  send: (event: TaskStreamEvent, eventId?: number) => void,
  buffer: { ready: boolean; pending: BufferedEvent[] }
) {
  return (event: TaskStreamEvent, eventId: number) => {
    if (!buffer.ready) {
      buffer.pending.push({ event, eventId });
      return;
    }
    send(event, eventId);
  };
}

function sendHistoryIfNeeded(
  send: (event: TaskStreamEvent, eventId?: number) => void,
  history: { entries: Array<{ id: number; event: TaskStreamEvent }> },
  includeSnapshot: boolean
) {
  if (includeSnapshot || history.entries.length === 0) {
    return;
  }
  for (const entry of history.entries) {
    send(entry.event, entry.id);
  }
}

async function sendSnapshot(send: (event: TaskStreamEvent, eventId?: number) => void) {
  const snapshot = await getTaskSnapshots();
  send({
    type: "task.snapshot",
    timestamp: Date.now(),
    data: { tasks: snapshot, stats: getTaskStats() },
  });
}

async function sendPendingConfirmations(send: (event: TaskStreamEvent, eventId?: number) => void) {
  const pendingConfirmations = await getPendingConfirmationEvents();
  if (pendingConfirmations.length === 0) {
    return;
  }
  for (const event of pendingConfirmations) {
    send(event);
  }
}

function flushBufferedEvents(
  buffer: { ready: boolean; pending: BufferedEvent[] },
  send: (event: TaskStreamEvent, eventId?: number) => void
) {
  if (buffer.pending.length === 0) {
    return;
  }
  for (const entry of buffer.pending) {
    send(entry.event, entry.eventId);
  }
  buffer.pending = [];
}

function startPing(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  state: { closed: boolean }
) {
  return setInterval(() => {
    if (state.closed) {
      return;
    }
    controller.enqueue(encoder.encode(": ping\n\n"));
  }, 15000);
}

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
      const state = { closed: false };
      const buffer = { ready: false, pending: [] as BufferedEvent[] };
      const send = createEventSender(controller, encoder, state);
      const unsubscribe = subscribeTaskEvents(createBufferedHandler(send, buffer));

      sendHistoryIfNeeded(send, history, includeSnapshot);
      await sendSnapshot(send);
      await sendPendingConfirmations(send);

      buffer.ready = true;
      flushBufferedEvents(buffer, send);

      const ping = startPing(controller, encoder, state);

      cleanup = () => {
        state.closed = true;
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
