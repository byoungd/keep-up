/**
 * Runtime Event Stream Bridge
 *
 * Maps runtime event bus signals to streaming chunks for progress and artifact previews.
 */

import type { RuntimeEvent, RuntimeEventBus, Subscription } from "../events/eventBus";
import type { ArtifactEvents } from "../events/eventBus";
import type { ExecutionDecision, ToolExecutionRecord } from "../types";
import type { StreamWriter } from "./streamWriter";

export interface RuntimeEventStreamBridgeConfig {
  eventBus: RuntimeEventBus;
  stream: StreamWriter;
  correlationId?: string;
  source?: string;
  includeDecisions?: boolean;
}

export function attachRuntimeEventStreamBridge(config: RuntimeEventStreamBridgeConfig): () => void {
  const { eventBus, stream, correlationId, source, includeDecisions = true } = config;
  const subscriptions: Subscription[] = [];

  const shouldHandle = (event: RuntimeEvent) => {
    if (correlationId && event.meta.correlationId !== correlationId) {
      return false;
    }
    if (source && event.meta.source !== source) {
      return false;
    }
    return true;
  };

  if (includeDecisions) {
    subscriptions.push(
      eventBus.subscribe("execution:decision", (event) => {
        if (!shouldHandle(event)) {
          return;
        }
        stream.writeMetadata("execution:decision", event.payload as ExecutionDecision);
      })
    );
  }

  subscriptions.push(
    eventBus.subscribe("execution:record", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      const record = event.payload as ToolExecutionRecord;
      if (record.status === "started") {
        stream.writeProgress("tool", `${record.toolName} started`, { percent: 0 });
      } else if (record.status === "completed") {
        stream.writeProgress("tool", `${record.toolName} completed`, { percent: 100 });
      } else {
        stream.writeError(record.error ?? `${record.toolName} failed`, "TOOL_FAILED", false);
      }
      stream.writeMetadata("execution:record", record);
    })
  );

  subscriptions.push(
    eventBus.subscribe("artifact:emitted", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      const payload = event.payload as ArtifactEvents["artifact:emitted"];
      stream.writeMetadata("artifact", payload);
      if (payload.stored) {
        stream.writeProgress("artifact", `${payload.artifact.title} ready`, { percent: 100 });
      }
    })
  );

  subscriptions.push(
    eventBus.subscribe("artifact:quarantined", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      const payload = event.payload as ArtifactEvents["artifact:quarantined"];
      stream.writeMetadata("artifact:quarantined", payload);
      const message =
        payload.errors.length > 0
          ? `Artifact ${payload.artifact.title} quarantined: ${payload.errors[0]}`
          : `Artifact ${payload.artifact.title} quarantined`;
      stream.writeError(message, "ARTIFACT_QUARANTINED", false);
    })
  );

  return () => {
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  };
}
