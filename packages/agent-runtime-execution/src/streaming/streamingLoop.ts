/**
 * Streaming Execution Loop
 *
 * Interleaves model output with tool execution while emitting stream events.
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type {
  ToolConfirmationDetailsProvider,
  ToolConfirmationResolver,
  ToolExecutor,
} from "../executor";
import type {
  AgentLLMRequest,
  AgentLLMResponse,
  AgentToolDefinition,
  IAgentLLM,
} from "../orchestrator/llmTypes";
import type {
  AgentMessage,
  ConfirmationHandler,
  ConfirmationRequest,
  MCPToolCall,
  MCPToolResult,
  TokenUsageStats,
  ToolContext,
} from "../types";
import { attachStreamEventBus } from "./streamEventBridge";
import type { IStreamWriter } from "./types";

export interface StreamingLoopConfig {
  llm: IAgentLLM;
  stream: IStreamWriter;
  toolExecutor: ToolExecutor;
  toolDefinitions: AgentToolDefinition[];
  messages: AgentMessage[];
  toolContext?: ToolContext;
  createToolContext?: (call: MCPToolCall) => ToolContext;
  confirmationHandler?: ConfirmationHandler;
  requireConfirmation?: boolean;
  maxTurns?: number;
  eventBus?: RuntimeEventBus;
  eventSource?: string;
  correlationId?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamingLoopResult {
  messages: AgentMessage[];
  finalResponse: AgentLLMResponse;
  usage?: TokenUsageStats;
  toolCalls: MCPToolCall[];
  toolResults: MCPToolResult[];
  turns: number;
}

type StreamingLoopState = {
  messages: AgentMessage[];
  toolCalls: MCPToolCall[];
  toolResults: MCPToolResult[];
  usage?: TokenUsageStats;
  finalResponse?: AgentLLMResponse;
  turns: number;
};

type ToolResultEntry = {
  call: MCPToolCall;
  result: MCPToolResult;
};

export async function runStreamingLoop(config: StreamingLoopConfig): Promise<StreamingLoopResult> {
  const maxTurns = config.maxTurns ?? 8;
  const requireConfirmation = config.requireConfirmation ?? true;
  const state = createStreamingState(config.messages);

  const detach =
    config.eventBus && config.stream
      ? attachStreamEventBus({
          stream: config.stream,
          eventBus: config.eventBus,
          source: config.eventSource,
          correlationId: config.correlationId,
        })
      : undefined;

  try {
    await runStreamingTurns(config, state, maxTurns, requireConfirmation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await config.stream.writeError(message, false);
    throw error;
  } finally {
    detach?.();
  }

  const finalResponse = state.finalResponse ?? { content: "", finishReason: "error" };
  if (state.turns >= maxTurns && finalResponse.finishReason === "tool_use") {
    await config.stream.writeError("Max turns reached before completion.", false);
  }

  return {
    messages: state.messages,
    finalResponse,
    usage: state.usage,
    toolCalls: state.toolCalls,
    toolResults: state.toolResults,
    turns: state.turns,
  };
}

function createStreamingState(messages: AgentMessage[]): StreamingLoopState {
  return {
    messages: [...messages],
    toolCalls: [],
    toolResults: [],
    turns: 0,
  };
}

async function runStreamingTurns(
  config: StreamingLoopConfig,
  state: StreamingLoopState,
  maxTurns: number,
  requireConfirmation: boolean
): Promise<void> {
  for (let index = 0; index < maxTurns; index += 1) {
    state.turns = index + 1;
    const turn = await executeStreamingTurn(config, state.messages, requireConfirmation);
    state.messages = turn.messages;
    state.usage = turn.usage ?? state.usage;
    state.finalResponse = turn.response;
    state.toolCalls.push(...turn.toolCalls);
    state.toolResults.push(...turn.toolResults);
    if (turn.completed) {
      return;
    }
  }
}

async function executeStreamingTurn(
  config: StreamingLoopConfig,
  messages: AgentMessage[],
  requireConfirmation: boolean
): Promise<{
  messages: AgentMessage[];
  response: AgentLLMResponse;
  toolCalls: MCPToolCall[];
  toolResults: MCPToolResult[];
  usage?: TokenUsageStats;
  completed: boolean;
}> {
  const request = buildRequest(config, messages);
  const streamed = await streamCompletion(config.llm, config.stream, request, {
    executeToolCall: (call) =>
      executeToolCallWithStreaming(call, {
        stream: config.stream,
        toolExecutor: config.toolExecutor,
        toolContext: resolveToolContext(config, call),
        confirmationHandler: config.confirmationHandler,
        requireConfirmation,
      }),
  });

  const normalizedToolCalls = streamed.toolCalls.map(ensureToolCallId);
  if (normalizedToolCalls.length === 0) {
    const nextMessages: AgentMessage[] = [
      ...messages,
      { role: "assistant" as const, content: streamed.response.content },
    ];
    await config.stream.writeDone("complete");
    return {
      messages: nextMessages,
      response: streamed.response,
      toolCalls: [],
      toolResults: [],
      usage: streamed.usage,
      completed: true,
    };
  }

  const nextMessages: AgentMessage[] = [
    ...messages,
    { role: "assistant", content: streamed.response.content, toolCalls: normalizedToolCalls },
  ];
  const toolEntries = await resolveToolResults(
    normalizedToolCalls,
    streamed.toolResultsMap,
    config,
    requireConfirmation
  );
  for (const entry of toolEntries) {
    nextMessages.push({ role: "tool", toolName: entry.call.name, result: entry.result });
  }

  return {
    messages: nextMessages,
    response: streamed.response,
    toolCalls: normalizedToolCalls,
    toolResults: toolEntries.map((entry) => entry.result),
    usage: streamed.usage,
    completed: false,
  };
}

function buildRequest(config: StreamingLoopConfig, messages: AgentMessage[]): AgentLLMRequest {
  return {
    messages,
    tools: config.toolDefinitions,
    systemPrompt: config.systemPrompt,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

async function resolveToolResults(
  calls: MCPToolCall[],
  toolResultsMap: Map<string, MCPToolResult>,
  config: StreamingLoopConfig,
  requireConfirmation: boolean
): Promise<ToolResultEntry[]> {
  const results: ToolResultEntry[] = [];
  for (const call of calls) {
    const cached = toolResultsMap.get(call.id ?? "");
    const result =
      cached ??
      (await executeToolCallWithStreaming(call, {
        stream: config.stream,
        toolExecutor: config.toolExecutor,
        toolContext: resolveToolContext(config, call),
        confirmationHandler: config.confirmationHandler,
        requireConfirmation,
      }));
    results.push({ call, result });
  }
  return results;
}

interface StreamCompletionResult {
  response: AgentLLMResponse;
  toolCalls: MCPToolCall[];
  toolResults: MCPToolResult[];
  toolResultsMap: Map<string, MCPToolResult>;
  usage?: TokenUsageStats;
}

async function streamCompletion(
  llm: IAgentLLM,
  stream: IStreamWriter,
  request: AgentLLMRequest,
  options: {
    executeToolCall: (call: MCPToolCall) => Promise<MCPToolResult>;
  }
): Promise<StreamCompletionResult> {
  if (!llm.stream) {
    return completeWithoutStream(llm, stream, request);
  }
  return completeWithStream(llm, stream, request, options.executeToolCall);
}

async function completeWithoutStream(
  llm: IAgentLLM,
  stream: IStreamWriter,
  request: AgentLLMRequest
): Promise<StreamCompletionResult> {
  const response = await llm.complete(request);
  const content = response.content ?? "";
  if (content) {
    await stream.writeToken(content);
  }
  const toolCalls = response.toolCalls?.map(ensureToolCallId) ?? [];
  const usage = response.usage;
  return {
    response: buildResponse(content, toolCalls, usage, response.finishReason),
    toolCalls,
    toolResults: [],
    toolResultsMap: new Map(),
    usage,
  };
}

async function completeWithStream(
  llm: IAgentLLM,
  stream: IStreamWriter,
  request: AgentLLMRequest,
  executeToolCall: (call: MCPToolCall) => Promise<MCPToolResult>
): Promise<StreamCompletionResult> {
  let content = "";
  const toolCalls: MCPToolCall[] = [];
  const toolResults: MCPToolResult[] = [];
  const toolResultsMap = new Map<string, MCPToolResult>();
  let usage: TokenUsageStats | undefined;

  if (!llm.stream) {
    throw new Error("LLM does not support streaming");
  }

  for await (const chunk of llm.stream(request)) {
    if (chunk.type === "content" && chunk.content) {
      content += chunk.content;
      await stream.writeToken(chunk.content);
      continue;
    }
    if (chunk.type === "tool_call" && chunk.toolCall) {
      const call = ensureToolCallId(chunk.toolCall);
      toolCalls.push(call);
      const result = await executeToolCall(call);
      toolResults.push(result);
      toolResultsMap.set(call.id ?? "", result);
      continue;
    }
    if (chunk.type === "usage" && chunk.usage) {
      usage = chunk.usage;
    }
  }

  return {
    response: buildResponse(content, toolCalls, usage, "stop"),
    toolCalls,
    toolResults,
    toolResultsMap,
    usage,
  };
}

function buildResponse(
  content: string,
  toolCalls: MCPToolCall[],
  usage: TokenUsageStats | undefined,
  finishReason?: AgentLLMResponse["finishReason"]
): AgentLLMResponse {
  const hasTools = toolCalls.length > 0;
  return {
    content,
    toolCalls: hasTools ? toolCalls : undefined,
    finishReason: hasTools ? "tool_use" : (finishReason ?? "stop"),
    usage,
  };
}

async function executeToolCallWithStreaming(
  call: MCPToolCall,
  options: {
    stream: IStreamWriter;
    toolExecutor: ToolExecutor;
    toolContext: ToolContext;
    confirmationHandler?: ConfirmationHandler;
    requireConfirmation: boolean;
  }
): Promise<MCPToolResult> {
  const resolvedCall = ensureToolCallId(call);
  const toolContext = options.toolContext;

  await options.stream.writeToolStart(
    resolvedCall.name,
    resolvedCall.id ?? "",
    resolvedCall.arguments
  );

  if (
    options.requireConfirmation &&
    requiresConfirmation(options.toolExecutor, resolvedCall, toolContext)
  ) {
    const confirmationDetails = getConfirmationDetails(
      options.toolExecutor,
      resolvedCall,
      toolContext
    );
    const approved = await requestConfirmation(options, resolvedCall, confirmationDetails);
    if (!approved) {
      const denied: MCPToolResult = {
        success: false,
        content: [{ type: "text", text: "User denied the operation" }],
        error: { code: "PERMISSION_DENIED", message: "User denied the operation" },
      };
      await options.stream.writeToolEnd(
        resolvedCall.id ?? "",
        false,
        denied,
        denied.error?.message
      );
      return denied;
    }
  }

  const result = await options.toolExecutor.execute(resolvedCall, toolContext);

  if (result.success) {
    await emitToolProgress(options.stream, resolvedCall.id ?? "", result);
  }

  await options.stream.writeToolEnd(
    resolvedCall.id ?? "",
    result.success,
    result,
    result.error?.message
  );

  return result;
}

async function emitToolProgress(
  stream: IStreamWriter,
  callId: string,
  result: MCPToolResult
): Promise<void> {
  const total = result.content.length;
  if (total === 0) {
    await stream.writeToolProgress(callId, 100);
    return;
  }

  for (let index = 0; index < total; index += 1) {
    const progress = Math.round(((index + 1) / total) * 100);
    await stream.writeToolProgress(callId, progress, result.content[index]);
  }
}

function requiresConfirmation(
  executor: ToolExecutor,
  call: MCPToolCall,
  context: ToolContext
): boolean {
  if (isToolConfirmationResolver(executor)) {
    return executor.requiresConfirmation(call, context);
  }
  return false;
}

function getConfirmationDetails(
  executor: ToolExecutor,
  call: MCPToolCall,
  context: ToolContext
): { reason?: string; riskTags?: string[] } | undefined {
  if (isToolConfirmationDetailsProvider(executor)) {
    const details = executor.getConfirmationDetails(call, context);
    return { reason: details.reason, riskTags: details.riskTags };
  }
  return undefined;
}

async function requestConfirmation(
  options: {
    confirmationHandler?: ConfirmationHandler;
    stream: IStreamWriter;
  },
  call: MCPToolCall,
  details?: { reason?: string; riskTags?: string[] }
): Promise<boolean> {
  if (!options.confirmationHandler) {
    await options.stream.writeToolProgress(call.id ?? "", 0, {
      status: "awaiting_confirmation",
      approved: false,
    });
    return false;
  }

  await options.stream.writeToolProgress(call.id ?? "", 0, {
    status: "awaiting_confirmation",
    reason: details?.reason,
    riskTags: details?.riskTags,
  });

  const approved = await options.confirmationHandler(buildConfirmationRequest(call, details));
  return approved;
}

function buildConfirmationRequest(
  call: MCPToolCall,
  details?: { reason?: string; riskTags?: string[] }
): ConfirmationRequest {
  return {
    toolName: call.name,
    description: `Execute ${call.name}`,
    arguments: call.arguments,
    risk: assessRisk(call),
    reason: details?.reason,
    riskTags: details?.riskTags,
  };
}

function assessRisk(call: MCPToolCall): "low" | "medium" | "high" {
  const highRiskTools = [
    "bash:execute",
    "file:delete",
    "file:write",
    "computer:click",
    "computer:keypress",
    "computer:type",
  ];
  const mediumRiskTools = ["code:run", "lfcc:delete_block", "computer:pointer_move"];

  if (highRiskTools.some((tool) => call.name.includes(tool))) {
    return "high";
  }
  if (mediumRiskTools.some((tool) => call.name.includes(tool))) {
    return "medium";
  }
  return "low";
}

function ensureToolCallId(call: MCPToolCall): MCPToolCall {
  if (call.id) {
    return call;
  }
  return { ...call, id: generateId("call") };
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveToolContext(config: StreamingLoopConfig, call: MCPToolCall): ToolContext {
  if (config.createToolContext) {
    return config.createToolContext(call);
  }
  if (config.toolContext) {
    return config.toolContext;
  }
  throw new Error("Streaming loop requires toolContext or createToolContext.");
}

function isToolConfirmationResolver(
  executor: ToolExecutor
): executor is ToolExecutor & ToolConfirmationResolver {
  return (
    typeof (executor as { requiresConfirmation?: unknown }).requiresConfirmation === "function"
  );
}

function isToolConfirmationDetailsProvider(
  executor: ToolExecutor
): executor is ToolExecutor & ToolConfirmationDetailsProvider {
  return (
    typeof (executor as { getConfirmationDetails?: unknown }).getConfirmationDetails === "function"
  );
}
