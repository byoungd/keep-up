export type SubagentType = "codebase-research" | "terminal-executor" | "parallel-work" | "custom";

export interface SubagentConfig {
  type: SubagentType;
  name: string;
  prompt?: string;
  tools: string[];
  model?: string;
  maxConcurrency?: number;
  timeout?: number;
}

export interface SubagentResult<T = unknown> {
  success: boolean;
  output: T;
  context: Record<string, unknown>;
  executionTime: number;
  error?: Error;
}

export interface SubagentWorkItem {
  id: string;
  config: SubagentConfig;
  input: unknown;
  dependencies?: string[];
}
