export interface NativeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface NativeToolResult {
  callId: string;
  result: unknown;
  size?: number;
}

export interface NativeMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  toolCalls?: NativeToolCall[];
  toolResults?: NativeToolResult[];
  toolName?: string;
  result?: unknown;
}

export interface CompressedContext {
  messages: NativeMessage[];
  totalTokens: number;
  removedCount: number;
  compressionRatio: number;
  selectedIndices: number[];
}

export interface CompressedPayload {
  data: Uint8Array;
  originalBytes: number;
  compressedBytes: number;
  compressionRatio: number;
  encoding: "zstd";
}

export interface NativeTokenizer {
  countTokens: (text: string, model: string) => number;
  countTokensBatch: (texts: string[], model: string) => number[];
  estimateJsonTokens: (value: unknown, model: string) => number;
  compressContext: (
    messages: NativeMessage[],
    maxTokens: number,
    preserveLastN: number,
    model?: string
  ) => CompressedContext;
  compressPayloadZstd: (
    value: unknown,
    minBytes: number,
    level?: number
  ) => CompressedPayload | null;
}
