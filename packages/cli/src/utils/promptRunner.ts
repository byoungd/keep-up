import type { RuntimeInstance } from "@ku0/agent-runtime";
import type { RuntimeEvent } from "@ku0/agent-runtime-control";
import type { AgentState, MCPToolResult } from "@ku0/agent-runtime-core";
import type { ToolCallRecord } from "@ku0/tooling-session";
import { writeStderr, writeStdout } from "./terminal";

export interface PromptRunnerOptions {
  runtime: RuntimeInstance;
  prompt: string;
  quiet?: boolean;
  toolCalls?: ToolCallRecord[];
}

export async function runPromptWithStreaming(options: PromptRunnerOptions): Promise<AgentState> {
  const staleSubscription = options.runtime.eventBus?.subscribe(
    "context:file-stale",
    (event: RuntimeEvent) => {
      if (options.quiet) {
        return;
      }
      writeStderr(formatStaleWarning(event.payload));
    }
  );

  const iterator = options.runtime.kernel.runStream(options.prompt)[Symbol.asyncIterator]();
  let finalState: AgentState | undefined;

  try {
    while (true) {
      const result = await iterator.next();
      if (result.done) {
        finalState = result.value;
        break;
      }

      handleRuntimeEvent(result.value, options.quiet ?? false, options.toolCalls);
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
  quiet: boolean,
  toolCalls?: ToolCallRecord[]
): void {
  const payload = event.payload as { type?: string; data?: unknown; timestamp?: number };
  if (!payload.type) {
    return;
  }

  const timestamp = payload.timestamp ?? Date.now();

  switch (payload.type) {
    case "tool:calling":
      handleToolCalling(payload.data, timestamp, quiet, toolCalls);
      break;
    case "tool:result":
      handleToolResult(payload.data, timestamp, quiet, toolCalls);
      break;
    case "error":
      handleError(payload.data, quiet);
      break;
    case "plan:created":
    case "plan:approved":
    case "plan:executing":
      handlePlanEvent(payload.type, quiet);
      break;
    case "thinking":
    case "completion":
      handleAgentEvent(payload.type, quiet);
      break;
    default:
      break;
  }
}

function handleToolCalling(
  data: unknown,
  timestamp: number,
  quiet: boolean,
  toolCalls?: ToolCallRecord[]
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

  if (!quiet) {
    writeStdout(`[tool] ${toolName} -> ${formatArgs(args)}`);
  }
}

function handleToolResult(
  data: unknown,
  timestamp: number,
  quiet: boolean,
  toolCalls?: ToolCallRecord[]
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

  if (!quiet) {
    writeStdout(`[tool] ${toolName} ${success ? "completed" : "failed"}`);
  }
}

function handleError(data: unknown, quiet: boolean) {
  const typedData = data as { error?: string };
  if (!quiet) {
    writeStderr(typedData?.error ?? "Agent error");
  }
}

function handlePlanEvent(type: string, quiet: boolean) {
  if (quiet) {
    return;
  }
  const status = type.split(":")[1];
  writeStdout(`[plan] ${status}`);
}

function handleAgentEvent(type: string, quiet: boolean) {
  if (quiet) {
    return;
  }
  if (type === "thinking") {
    writeStdout("[agent] thinking...");
  } else if (type === "completion") {
    writeStdout("[agent] completion ready");
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
