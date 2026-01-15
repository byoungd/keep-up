import { COWORK_EVENTS, type CoworkEventPayloads, type CoworkEventType } from "../events";

export { COWORK_EVENTS };
export type { CoworkEventType, CoworkEventPayloads };

export interface CoworkEvent {
  id: string;
  type: string;
  data: unknown;
  timestamp: number;
}

/**
 * Type-safe publish helper for known event types.
 * Use this when you want compile-time type checking.
 */
export function createTypedEvent<T extends CoworkEventType>(
  type: T,
  data: CoworkEventPayloads[T]
): { type: T; data: CoworkEventPayloads[T] } {
  return { type, data };
}

type EventListener = (event: CoworkEvent) => void | Promise<void>;

class EventBuffer {
  private readonly limit: number;
  private readonly events: CoworkEvent[] = [];
  private nextId = 1;

  constructor(limit = 100) {
    this.limit = limit;
  }

  publish(type: string, data: unknown): CoworkEvent {
    const event: CoworkEvent = {
      id: String(this.nextId++),
      type,
      data,
      timestamp: Date.now(),
    };
    this.events.push(event);
    if (this.events.length > this.limit) {
      this.events.splice(0, this.events.length - this.limit);
    }
    return event;
  }

  listSince(lastEventId?: string | null): CoworkEvent[] {
    if (!lastEventId) {
      return [...this.events];
    }
    const lastId = Number(lastEventId);
    if (Number.isNaN(lastId)) {
      return [...this.events];
    }
    return this.events.filter((event) => Number(event.id) > lastId);
  }
}

export class SessionEventHub {
  private readonly buffers = new Map<string, EventBuffer>();
  private readonly listeners = new Map<string, Set<EventListener>>();

  publish<T extends CoworkEventType>(
    sessionId: string,
    type: T,
    data: CoworkEventPayloads[T]
  ): CoworkEvent;
  publish(sessionId: string, type: string, data: unknown): CoworkEvent;
  publish(sessionId: string, type: string, data: unknown): CoworkEvent {
    const buffer = this.getBuffer(sessionId);
    const event = buffer.publish(type, data);
    const listeners = this.listeners.get(sessionId);
    if (listeners) {
      for (const listener of listeners) {
        void listener(event);
      }
    }
    return event;
  }

  listSince(sessionId: string, lastEventId?: string | null): CoworkEvent[] {
    return this.getBuffer(sessionId).listSince(lastEventId);
  }

  subscribe(sessionId: string, listener: EventListener): () => void {
    const set = this.listeners.get(sessionId) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(sessionId, set);
    return () => {
      const current = this.listeners.get(sessionId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  private getBuffer(sessionId: string): EventBuffer {
    const existing = this.buffers.get(sessionId);
    if (existing) {
      return existing;
    }
    const created = new EventBuffer();
    this.buffers.set(sessionId, created);
    return created;
  }
}
