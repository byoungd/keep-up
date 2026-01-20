import type { AgentState, MCPToolResult, RuntimeEvent, RuntimeInstance } from "@ku0/agent-runtime";
import type { ToolCallRecord } from "@ku0/tooling-session";

export interface RuntimeEventMessage {
  type: "progress" | "tool" | "error" | "plan" | "thinking";
  text: string;
}

export interface PromptRunnerOptions {
  runtime: RuntimeInstance;
  prompt: string;
  toolCalls?: ToolCallRecord[];
  onEvent?: (event: RuntimeEventMessage) => void;
}

export async function runPromptWithStreaming(options: PromptRunnerOptions): Promise<AgentState> {
  const staleSubscription = options.runtime.eventBus?.subscribe("context:file-stale", (event) => {
    options.onEvent?.({ type: "error", text: formatStaleWarning(event.payload) });
  });

  const iterator = options.runtime.kernel.runStream(options.prompt)[Symbol.asyncIterator]();
  let finalState: AgentState | undefined;

  try {
    while (true) {
      const result = await iterator.next();
      if (result.done) {
        finalState = result.value;
        break;
      }

      handleRuntimeEvent(result.value, options.toolCalls, options.onEvent);
    }
  } finally {
    staleSubscription?.unsubscribe();
  }

  if (!finalState) {
    throw new Error("Agent run did not return a final state.");
  }

  return finalState;
}

function handleRuntimeEvent(
  event: RuntimeEvent,
  toolCalls: ToolCallRecord[] | undefined,
  onEvent: ((event: RuntimeEventMessage) => void) | undefined
): void {
  const payload = event.payload as { type?: string; data?: unknown; timestamp?: number };
  if (!payload.type) {
    return;
  }

  const timestamp = payload.timestamp ?? Date.now();

  switch (payload.type) {
    case "tool:calling":
      handleToolCalling(payload.data, timestamp, toolCalls, onEvent);
      break;
    case "tool:result":
      handleToolResult(payload.data, timestamp, toolCalls, onEvent);
      break;
    case "error":
      handleError(payload.data, onEvent);
      break;
    case "plan:created":
    case "plan:approved":
    case "plan:executing":
      handlePlanEvent(payload.type, onEvent);
      break;
    case "thinking":
    case "completion":
      handleAgentEvent(payload.type, onEvent);
      break;
    default:
      break;
  }
}

function handleToolCalling(
  data: unknown,
  timestamp: number,
  toolCalls: ToolCallRecord[] | undefined,
  onEvent: ((event: RuntimeEventMessage) => void) | undefined
) {
  const typedData = data as { toolName?: string; arguments?: Record<string, unknown> };
  const toolName = typedData?.toolName ?? "unknown";
  const args = typedData?.arguments ?? {};

  if (toolCalls) {
    toolCalls.push({
      id: `tool_${toolName}_${timestamp}`,
      name: toolName,
      arguments: args,
      status: "started",
      startedAt: timestamp,
    });
  }
  onEvent?.({ type: "tool", text: `[tool] ${toolName} -> ${formatArgs(args)}` });
}

function handleToolResult(
  data: unknown,
  timestamp: number,
  toolCalls: ToolCallRecord[] | undefined,
  onEvent: ((event: RuntimeEventMessage) => void) | undefined
) {
  const typedData = data as { toolName?: string; result?: MCPToolResult };
  const toolName = typedData?.toolName ?? "unknown";
  const result = typedData?.result;
  const success = Boolean(result?.success ?? true);
  const errorMessage = result?.error?.message;

  if (toolCalls) {
    const last = findLastPendingCall(toolCalls, toolName);
    const completedAt = timestamp;

    if (last) {
      last.status = success ? "completed" : "failed";
      last.completedAt = completedAt;
      last.durationMs = result?.meta?.durationMs;
      last.error = errorMessage;
    } else {
      toolCalls.push({
        id: `tool_${toolName}_${timestamp}`,
        name: toolName,
        arguments: {},
        status: success ? "completed" : "failed",
        startedAt: completedAt,
        completedAt,
        durationMs: result?.meta?.durationMs,
        error: errorMessage,
      });
    }
  }

  onEvent?.({
    type: "tool",
    text: `[tool] ${toolName} ${success ? "completed" : "failed"}`,
  });
}

function handleError(data: unknown, onEvent: ((event: RuntimeEventMessage) => void) | undefined) {
  const typedData = data as { error?: string };
  onEvent?.({ type: "error", text: typedData?.error ?? "Agent error" });
}

function handlePlanEvent(
  type: string,
  onEvent: ((event: RuntimeEventMessage) => void) | undefined
) {
  const status = type.split(":")[1];
  onEvent?.({ type: "plan", text: `[plan] ${status}` });
}

function handleAgentEvent(
  type: string,
  onEvent: ((event: RuntimeEventMessage) => void) | undefined
) {
  if (type === "thinking") {
    onEvent?.({ type: "thinking", text: "[agent] thinking..." });
  } else if (type === "completion") {
    onEvent?.({ type: "progress", text: "[agent] completion ready" });
  }
}

function findLastPendingCall(toolCalls: ToolCallRecord[], toolName: string) {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const record = toolCalls[i];
    if (record.name === toolName && record.status === "started") {
      return record;
    }
  }
  return undefined;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) {
    return "{}";
  }
  try {
    return JSON.stringify(args);
  } catch {
    return "{...}";
  }
}

function formatStaleWarning(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Stale file context detected. Reload before editing.";
  }
  const record = payload as Record<string, unknown>;
  const path =
    typeof record.path === "string"
      ? record.path
      : typeof record.absolutePath === "string"
        ? record.absolutePath
        : "unknown";
  return `Stale file context detected: ${path}. Reload before editing.`;
}
