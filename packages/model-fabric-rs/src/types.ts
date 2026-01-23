export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  tools?: Tool[];
  topP?: number;
  timeoutMs?: number;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error";

export interface CompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: FinishReason;
  model: string;
  latencyMs: number;
}

export type StreamChunkType = "content" | "tool_call" | "usage" | "done" | "error";

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: ToolCall;
  usage?: TokenUsage;
  error?: string;
  finishReason?: FinishReason;
}

export type ProviderKind = "openai" | "anthropic" | "gemini" | "local";

export interface ProviderConfigRecord {
  providerId: string;
  kind: ProviderKind;
  authRef: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  organizationId?: string;
  modelIds: string[];
  defaultModelId?: string;
}

export interface RouteRule {
  ruleId: string;
  priority: number;
  workerId?: string;
  taskType?: string;
  modelId: string;
  fallbackModelIds?: string[];
}

export interface ModelUsageEvent {
  eventId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd?: number;
  createdAt: number;
}

export interface ModelFabricSnapshot {
  providers: ProviderConfigRecord[];
  routes: RouteRule[];
  usageCursor: number;
}

export interface ModelFabricContext {
  workerId?: string;
  taskType?: string;
}

export interface ModelStreamHandle {
  next(): Promise<StreamChunk | null>;
}
