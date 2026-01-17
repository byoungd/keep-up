/**
 * Runtime Event Stream Bridge
 *
 * Maps runtime event bus signals to streaming chunks for progress and artifact previews.
 */

import type { RuntimeEvent, RuntimeEventBus, Subscription } from "../events/eventBus";
import type { ArtifactEvents } from "../events/eventBus";
import type { ExecutionDecision, ToolExecutionRecord } from "../types";
import type { StreamWriter } from "./streamWriter";

type ToolActivity = "search" | "browse" | "read" | "write" | "run";

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

const TOOL_ACTIVITY_RULES: Array<{ activity: ToolActivity; tokens: string[] }> = [
  {
    activity: "search",
    tokens: ["search", "query", "find", "lookup", "serp", "tavily", "bing", "google"],
  },
  {
    activity: "browse",
    tokens: ["browse", "browser", "navigate", "crawl", "scrape", "page", "url", "http", "fetch"],
  },
  {
    activity: "read",
    tokens: ["read", "open", "load", "download", "extract", "parse", "ingest"],
  },
  {
    activity: "write",
    tokens: [
      "write",
      "save",
      "create",
      "update",
      "insert",
      "delete",
      "remove",
      "append",
      "edit",
      "patch",
      "replace",
      "apply",
      "upload",
      "persist",
      "store",
    ],
  },
];

const TOOL_ACTIVITY_LABELS: Record<ToolActivity, string> = {
  search: "Searching",
  browse: "Browsing",
  read: "Reading",
  write: "Writing",
  run: "Running",
};

function tokenizeToolName(toolName: string): string[] {
  return toolName
    .toLowerCase()
    .split(/[:._/\\-]+/)
    .filter(Boolean);
}

function resolveToolActivity(toolName: string): ToolActivity {
  const tokens = tokenizeToolName(toolName);
  for (const rule of TOOL_ACTIVITY_RULES) {
    if (rule.tokens.some((token) => tokens.includes(token))) {
      return rule.activity;
    }
  }
  return "run";
}

function formatToolActivityMessage(
  activity: ToolActivity,
  status: ToolExecutionRecord["status"]
): string {
  const label = TOOL_ACTIVITY_LABELS[activity] ?? TOOL_ACTIVITY_LABELS.run;
  switch (status) {
    case "started":
      return `${label}...`;
    case "completed":
      return `${label} complete`;
    case "failed":
      return `${label} failed`;
    default:
      return `${label}...`;
  }
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
        label: TOOL_ACTIVITY_LABELS[activity] ?? TOOL_ACTIVITY_LABELS.run,
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
