/**
 * Runtime Event Stream Bridge
 *
 * Maps runtime event bus signals to streaming chunks for progress and artifact previews.
 */

import type {
  ArtifactEvents,
  RuntimeEvent,
  RuntimeEventBus,
  Subscription,
} from "../events/eventBus";
import type { ExecutionDecision, ToolExecutionRecord } from "../types";
import {
  formatToolActivityLabel,
  formatToolActivityMessage,
  resolveToolActivity,
  type ToolActivity,
} from "../utils/toolActivity";
import type { StreamWriter } from "./streamWriter";

interface ToolActivityMetadata {
  toolName: string;
  toolCallId?: string;
  taskNodeId?: string;
  activity: ToolActivity;
  label: string;
  status: ToolExecutionRecord["status"];
  durationMs: number;
  error?: string;
}

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
      const activity = resolveToolActivity(record.toolName);
      const activityMeta: ToolActivityMetadata = {
        toolName: record.toolName,
        toolCallId: record.toolCallId,
        taskNodeId: record.taskNodeId,
        activity,
        label: formatToolActivityLabel(activity),
        status: record.status,
        durationMs: record.durationMs,
        error: record.error,
      };
      stream.writeMetadata("tool:activity", activityMeta);
      if (record.status === "started") {
        stream.writeProgress("tool", formatToolActivityMessage(activity, record.status), {
          percent: 0,
        });
      } else if (record.status === "completed") {
        stream.writeProgress("tool", formatToolActivityMessage(activity, record.status), {
          percent: 100,
        });
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
