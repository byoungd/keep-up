/**
 * Runtime Event Stream Bridge
 *
 * Maps runtime event bus signals to streaming chunks for progress and artifact previews.
 */

import type {
  ArtifactEvents,
  RuntimeEvent,
  RuntimeEventBus,
  SubagentEventPayload,
  Subscription,
} from "@ku0/agent-runtime-control";
import type {
  CheckpointEvent,
  ExecutionDecision,
  MessageEnvelope,
  ToolExecutionRecord,
} from "../types";
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
  agentId?: string;
  parentId?: string;
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

  const handleExecutionDecision = (
    decision: ExecutionDecision,
    context?: { agentId?: string; parentId?: string }
  ) => {
    if (context?.agentId) {
      stream.writeMetadata("execution:decision", {
        ...decision,
        agentId: context.agentId,
        parentId: context.parentId,
      });
      return;
    }
    stream.writeMetadata("execution:decision", decision);
  };

  const handleExecutionRecord = (
    record: ToolExecutionRecord,
    context?: { agentId?: string; parentId?: string }
  ) => {
    const activity = resolveToolActivity(record.toolName);
    const activityMeta: ToolActivityMetadata = {
      toolName: record.toolName,
      toolCallId: record.toolCallId,
      taskNodeId: record.taskNodeId,
      agentId: context?.agentId,
      parentId: context?.parentId,
      activity,
      label: formatToolActivityLabel(activity),
      status: record.status,
      durationMs: record.durationMs,
      error: record.error,
    };
    const messagePrefix = context?.agentId ? `Subagent ${context.agentId}: ` : "";
    stream.writeMetadata("tool:activity", activityMeta);
    if (record.status === "started") {
      stream.writeProgress(
        "tool",
        `${messagePrefix}${formatToolActivityMessage(activity, "started")}`,
        {
          percent: 0,
        }
      );
    } else if (record.status === "completed") {
      stream.writeProgress(
        "tool",
        `${messagePrefix}${formatToolActivityMessage(activity, "completed")}`,
        {
          percent: 100,
        }
      );
    } else {
      stream.writeError(record.error ?? `${record.toolName} failed`, "TOOL_FAILED", false);
    }
    stream.writeMetadata("execution:record", record);
  };

  const handleArtifactEmitted = (
    payload: ArtifactEvents["artifact:emitted"],
    context?: { agentId?: string; parentId?: string }
  ) => {
    if (context?.agentId) {
      stream.writeMetadata("artifact", {
        ...payload,
        agentId: context.agentId,
        parentId: context.parentId,
      });
    } else {
      stream.writeMetadata("artifact", payload);
    }
    if (payload.stored) {
      const prefix = context?.agentId ? `Subagent ${context.agentId}: ` : "";
      stream.writeProgress("artifact", `${prefix}${payload.artifact.title} ready`, {
        percent: 100,
      });
    }
  };

  const handleArtifactQuarantined = (
    payload: ArtifactEvents["artifact:quarantined"],
    context?: { agentId?: string; parentId?: string }
  ) => {
    if (context?.agentId) {
      stream.writeMetadata("artifact:quarantined", {
        ...payload,
        agentId: context.agentId,
        parentId: context.parentId,
      });
    } else {
      stream.writeMetadata("artifact:quarantined", payload);
    }
    const message =
      payload.errors.length > 0
        ? `Artifact ${payload.artifact.title} quarantined: ${payload.errors[0]}`
        : `Artifact ${payload.artifact.title} quarantined`;
    stream.writeError(message, "ARTIFACT_QUARANTINED", false);
  };

  const handleMessageDelivered = (payload: MessageEnvelope) => {
    stream.writeMetadata("message:delivered", payload);
  };

  const handleCheckpointEvent = (
    payload: CheckpointEvent,
    context?: { agentId?: string; parentId?: string }
  ) => {
    if (context?.agentId) {
      stream.writeMetadata("checkpoint", {
        ...payload,
        agentId: context.agentId,
        parentId: context.parentId,
      });
      return;
    }
    stream.writeMetadata("checkpoint", payload);
  };

  if (includeDecisions) {
    subscriptions.push(
      eventBus.subscribe("execution:decision", (event) => {
        if (!shouldHandle(event)) {
          return;
        }
        handleExecutionDecision(event.payload as ExecutionDecision);
      })
    );
  }

  subscriptions.push(
    eventBus.subscribe("execution:record", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      handleExecutionRecord(event.payload as ToolExecutionRecord);
    })
  );

  subscriptions.push(
    eventBus.subscribe("artifact:emitted", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      handleArtifactEmitted(event.payload as ArtifactEvents["artifact:emitted"]);
    })
  );

  subscriptions.push(
    eventBus.subscribe("artifact:quarantined", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      handleArtifactQuarantined(event.payload as ArtifactEvents["artifact:quarantined"]);
    })
  );

  subscriptions.push(
    eventBus.subscribe("message:delivered", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      handleMessageDelivered(event.payload as MessageEnvelope);
    })
  );

  subscriptions.push(
    eventBus.subscribe("checkpoint:created", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      handleCheckpointEvent(event.payload as CheckpointEvent);
    })
  );

  subscriptions.push(
    eventBus.subscribe("checkpoint:updated", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      handleCheckpointEvent(event.payload as CheckpointEvent);
    })
  );

  subscriptions.push(
    eventBus.subscribe("subagent:event", (event) => {
      if (!shouldHandle(event)) {
        return;
      }
      const payload = event.payload as SubagentEventPayload;
      const innerEvent = payload.event;
      const context = { agentId: payload.agentId, parentId: payload.parentId };

      stream.writeMetadata("subagent:event", payload);

      if (innerEvent.type === "execution:decision" && includeDecisions) {
        handleExecutionDecision(innerEvent.payload as ExecutionDecision, context);
      }

      if (innerEvent.type === "execution:record") {
        handleExecutionRecord(innerEvent.payload as ToolExecutionRecord, context);
      }

      if (innerEvent.type === "artifact:emitted") {
        handleArtifactEmitted(innerEvent.payload as ArtifactEvents["artifact:emitted"], context);
      }

      if (innerEvent.type === "artifact:quarantined") {
        handleArtifactQuarantined(
          innerEvent.payload as ArtifactEvents["artifact:quarantined"],
          context
        );
      }

      if (innerEvent.type === "checkpoint:created" || innerEvent.type === "checkpoint:updated") {
        handleCheckpointEvent(innerEvent.payload as CheckpointEvent, context);
      }
    })
  );

  return () => {
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  };
}
