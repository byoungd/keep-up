// apps/reader/src/lib/ai/types.ts

export type AIAction =
  | "improve_writing"
  | "fix_grammar"
  | "translate"
  | "summarize"
  | "explain"
  | "continue_writing";

export type AIState = {
  status: "idle" | "streaming" | "done" | "error";
  prompt: string;
  response: string;
  error?: string;
  requestId?: string;
};

export type AIStreamChunk = {
  text: string;
  done: boolean;
  error?: string;
};

export interface AIClient {
  streamResponse(prompt: string, context?: string): AsyncGenerator<AIStreamChunk>;
}

export interface AIPrompt {
  id: string;
  label: string;
  description: string;
  systemPrompt?: string;
  userPromptTemplate: string;
  icon?: string;
}
