/**
 * Stream Event Bridge
 *
 * Persists stream events to the runtime event bus.
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type { IStreamWriter, StreamEvent, StreamEventHandler } from "./types";

interface StreamEventEmitter {
  onEvent: (handler: StreamEventHandler) => () => void;
  getId?: () => string;
}

export interface StreamEventBridgeConfig {
  stream: IStreamWriter;
  eventBus: RuntimeEventBus;
  source?: string;
  correlationId?: string;
}

export function attachStreamEventBus(config: StreamEventBridgeConfig): () => void {
  if (!isStreamEventEmitter(config.stream)) {
    return () => undefined;
  }

  const streamId = typeof config.stream.getId === "function" ? config.stream.getId() : "stream";

  return config.stream.onEvent((event: StreamEvent) => {
    config.eventBus.emitRaw(
      "stream:event",
      { streamId, event },
      {
        source: config.source ?? "stream",
        correlationId: config.correlationId,
        priority: "normal",
      }
    );
  });
}

function isStreamEventEmitter(stream: IStreamWriter): stream is IStreamWriter & StreamEventEmitter {
  return typeof (stream as StreamEventEmitter).onEvent === "function";
}
