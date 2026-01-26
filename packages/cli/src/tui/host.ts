import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { RuntimeStreamChunk, StreamWriter } from "@ku0/agent-runtime";
import type { RuntimeEvent } from "@ku0/agent-runtime-control";
import type { AgentState, MCPToolResult } from "@ku0/agent-runtime-core";
import type { ToolCallRecord } from "@ku0/tooling-session";
import { extractAssistantText } from "../utils/output";
import { createRuntimeResources } from "../utils/runtimeClient";
import { type SessionRecord, SessionStore } from "../utils/sessionStore";
import { buildHostCapabilities, type HostMessage, type OpName } from "./protocol";

type OpMessage = Extract<HostMessage, { type: "op" }>;

type RuntimeState = {
  runtime?: Awaited<ReturnType<typeof createRuntimeResources>>["runtime"];
  eventBus?: Awaited<ReturnType<typeof createRuntimeResources>>["eventBus"];
  stream?: StreamWriter;
  streamStop?: () => void;
  streamRequestId?: string;
  session?: SessionRecord;
  subscriptions: Array<() => void>;
  activeRun: boolean;
};

const sessionStore = new SessionStore();
const state: RuntimeState = {
  subscriptions: [],
  activeRun: false,
};

function send(message: HostMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendEvent(event: string, payload?: Record<string, unknown>, requestId?: string): void {
  send({ type: "event", event, payload, requestId });
}

function sendResult(id: string, op: OpName, payload?: Record<string, unknown>): void {
  send({ type: "result", id, op, ok: true, payload });
}

function sendError(id: string, op: OpName, message: string, code?: string): void {
  send({ type: "result", id, op, ok: false, error: { message, code } });
}

function sendStreamChunk(chunk: RuntimeStreamChunk): void {
  const requestId = state.streamRequestId;
  if (!requestId) {
    return;
  }
  sendEvent("stream.chunk", { chunk }, requestId);
}

function stopStreamReader(): void {
  state.streamRequestId = undefined;
  state.streamStop?.();
  state.streamStop = undefined;
  state.stream = undefined;
}

function startStreamReader(stream: StreamWriter): void {
  const guard = { active: true };

  const run = async () => {
    try {
      for await (const chunk of stream) {
        if (!guard.active) {
          break;
        }
        sendStreamChunk(chunk);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendEvent("host.error", { message });
    }
  };

  state.stream = stream;
  state.streamStop = () => {
    guard.active = false;
    stream.close();
  };

  void run();
}

function summarizeSession(session: SessionRecord) {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  };
}

async function handleSessionList(message: OpMessage): Promise<void> {
  const limit = Number(message.payload?.limit ?? 20);
  const sessions = await sessionStore.list(Number.isFinite(limit) ? limit : 20);
  sendResult(message.id, message.op, {
    sessions: sessions.map(summarizeSession),
  });
}

async function handleSessionCreate(message: OpMessage): Promise<void> {
  const requestedId =
    typeof message.payload?.sessionId === "string" ? message.payload.sessionId : undefined;
  const sessionId = requestedId ?? `session_${randomUUID()}`;
  const existing = await sessionStore.get(sessionId);
  if (existing) {
    sendError(message.id, message.op, "Session already exists.", "SESSION_EXISTS");
    return;
  }
  const now = Date.now();
  const session: SessionRecord = {
    id: sessionId,
    title: "",
    createdAt: now,
    updatedAt: now,
    messages: [],
    toolCalls: [],
    approvals: [],
  };
  await sessionStore.save(session);
  sendResult(message.id, message.op, { session });
}

async function initRuntime(message: OpMessage): Promise<void> {
  const sessionId =
    typeof message.payload?.sessionId === "string" ? message.payload.sessionId : undefined;
  if (!sessionId) {
    sendError(message.id, message.op, "sessionId is required.", "BAD_REQUEST");
    return;
  }
  if (state.activeRun) {
    sendError(message.id, message.op, "Agent is running.", "BUSY");
    return;
  }
  const session = await sessionStore.get(sessionId);
  if (!session) {
    sendError(message.id, message.op, "Session not found.", "SESSION_NOT_FOUND");
    return;
  }
  if (!session.toolCalls) {
    session.toolCalls = [];
  }
  if (!session.approvals) {
    session.approvals = [];
  }

  const model = typeof message.payload?.model === "string" ? message.payload.model : undefined;
  const provider =
    typeof message.payload?.provider === "string" ? message.payload.provider : undefined;

  for (const unsubscribe of state.subscriptions) {
    unsubscribe();
  }
  state.subscriptions = [];
  stopStreamReader();

  const resources = await createRuntimeResources({
    model,
    provider,
    sessionId: session.id,
    initialMessages: session.messages,
  });
  state.runtime = resources.runtime;
  state.eventBus = resources.eventBus;
  startStreamReader(resources.stream);
  state.session = session;

  if (state.eventBus) {
    const sub = state.eventBus.subscribe("context:file-stale", (event: RuntimeEvent) => {
      sendEvent("runtime.context-file-stale", event.payload as Record<string, unknown>);
    });
    state.subscriptions.push(() => sub.unsubscribe());
  }

  sendResult(message.id, message.op, { session });
}

function updateToolCalls(
  toolCalls: ToolCallRecord[],
  payload: { type: string; data?: unknown },
  timestamp: number
) {
  if (payload.type === "tool:calling") {
    const typed = payload.data as { toolName?: string; arguments?: Record<string, unknown> };
    const toolName = typed?.toolName ?? "unknown";
    const args = typed?.arguments ?? {};
    toolCalls.push({
      id: `tool_${toolName}_${timestamp}`,
      name: toolName,
      arguments: args,
      status: "started",
      startedAt: timestamp,
    });
    return;
  }

  if (payload.type === "tool:result") {
    const typed = payload.data as { toolName?: string; result?: MCPToolResult };
    const toolName = typed?.toolName ?? "unknown";
    const result = typed?.result;
    const success = Boolean(result?.success ?? true);
    const errorMessage = result?.error?.message;
    const errorCode = result?.error?.code;
    const mappedResult = mapToolResult(result);

    const last = findLastPendingCall(toolCalls, toolName);
    const completedAt = timestamp;

    if (last) {
      last.status = success ? "completed" : "failed";
      last.completedAt = completedAt;
      last.durationMs = result?.meta?.durationMs;
      last.error = errorMessage;
      last.errorCode = errorCode;
      last.result = mappedResult;
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
        errorCode,
        result: mappedResult,
      });
    }
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

function mapToolResult(result?: MCPToolResult): ToolCallRecord["result"] {
  if (!result) {
    return undefined;
  }
  return {
    success: result.success,
    content: result.content,
    error: result.error
      ? {
          message: result.error.message,
          code: result.error.code,
        }
      : undefined,
    meta: result.meta
      ? {
          durationMs: result.meta.durationMs,
          toolName: result.meta.toolName,
          sandboxed: result.meta.sandboxed,
          outputSpool: result.meta.outputSpool ?? undefined,
        }
      : undefined,
  };
}

function handleRuntimeEvent(event: RuntimeEvent, requestId: string, toolCalls: ToolCallRecord[]) {
  const payload = event.payload as {
    type?: string;
    data?: unknown;
    timestamp?: number;
    turn?: number;
  };
  if (!payload.type) {
    return;
  }
  const timestamp = payload.timestamp ?? Date.now();
  updateToolCalls(toolCalls, { type: payload.type, data: payload.data }, timestamp);
  sendEvent(
    `agent.${payload.type}`,
    {
      turn: payload.turn ?? 0,
      timestamp,
      data: payload.data ?? null,
    },
    requestId
  );
}

async function handlePrompt(message: OpMessage): Promise<void> {
  if (!state.runtime || !state.session) {
    sendError(message.id, message.op, "Runtime not initialized.", "NOT_READY");
    return;
  }
  if (state.activeRun) {
    sendError(message.id, message.op, "Agent is already running.", "BUSY");
    return;
  }

  const prompt = typeof message.payload?.text === "string" ? message.payload.text.trim() : "";
  if (!prompt) {
    sendError(message.id, message.op, "Prompt is required.", "BAD_REQUEST");
    return;
  }

  state.activeRun = true;
  state.streamRequestId = message.id;
  let finalState: AgentState | undefined;
  const clearStreamRequestId = () => {
    if (state.streamRequestId === message.id) {
      state.streamRequestId = undefined;
    }
  };

  try {
    const iterator = state.runtime.kernel.runStream(prompt)[Symbol.asyncIterator]();
    while (true) {
      const result = await iterator.next();
      if (result.done) {
        finalState = result.value;
        break;
      }
      handleRuntimeEvent(result.value, message.id, state.session.toolCalls);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    sendEvent("agent.error", { error: messageText }, message.id);
    sendError(message.id, message.op, messageText, "RUN_FAILED");
    clearStreamRequestId();
    return;
  } finally {
    state.activeRun = false;
  }

  if (!finalState) {
    sendError(message.id, message.op, "Agent run did not return a final state.", "NO_STATE");
    clearStreamRequestId();
    return;
  }

  const assistantText = extractAssistantText(finalState);
  const now = Date.now();
  state.session.messages.push(
    { role: "user", content: prompt, timestamp: now },
    { role: "assistant", content: assistantText, timestamp: now + 1 }
  );
  state.session.updatedAt = Date.now();
  state.session.title = state.session.title || prompt.slice(0, 48);

  await sessionStore.save(state.session);

  sendResult(message.id, message.op, {
    assistantText,
    sessionId: state.session.id,
    title: state.session.title,
  });
  clearStreamRequestId();
}

async function handleOp(message: OpMessage): Promise<void> {
  switch (message.op) {
    case "client.hello":
      sendResult(message.id, message.op, buildHostCapabilities());
      return;
    case "session.list":
      await handleSessionList(message);
      return;
    case "session.create":
      await handleSessionCreate(message);
      return;
    case "runtime.init":
      await initRuntime(message);
      return;
    case "agent.prompt":
      await handlePrompt(message);
      return;
    case "agent.interrupt":
      if (!state.activeRun) {
        sendError(message.id, message.op, "No active run.", "NO_ACTIVE_RUN");
        return;
      }
      if (state.runtime) {
        const kernel = state.runtime.kernel as { stop?: () => void };
        kernel.stop?.();
      }
      sendResult(message.id, message.op, { status: "ok" });
      return;
    case "client.shutdown":
      sendResult(message.id, message.op, { status: "ok" });
      stopStreamReader();
      process.exit(0);
      return;
    default:
      sendError(message.id, message.op, "Unsupported operation.", "UNSUPPORTED_OP");
      return;
  }
}

function parseMessage(line: string): OpMessage | null {
  try {
    const parsed = JSON.parse(line) as HostMessage;
    if (parsed.type === "op") {
      return parsed as OpMessage;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendEvent("host.error", { message });
  }
  return null;
}

function startHost(): void {
  sendEvent("host.ready", buildHostCapabilities());
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const message = parseMessage(trimmed);
    if (!message) {
      return;
    }
    void handleOp(message).catch((error) => {
      const messageText = error instanceof Error ? error.message : String(error);
      sendError(message.id, message.op, messageText, "HOST_ERROR");
    });
  });
}

startHost();
