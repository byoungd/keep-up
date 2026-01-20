import type { AgentState } from "@ku0/agent-runtime-core";

export type GymDifficulty = "easy" | "medium" | "hard";
export type GymCategory =
  | "syntax-repair"
  | "refactor"
  | "feature-add"
  | "cross-file"
  | "policy-safety";

export interface GymFixtureFile {
  path: string;
  content: string;
}

export interface GymScriptedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface GymScriptedResponse {
  content: string;
  finishReason: "stop" | "tool_use";
  toolCalls?: GymScriptedToolCall[];
}

export interface GymScenarioScript {
  responses: GymScriptedResponse[];
}

export interface GymScenario {
  id: string;
  title: string;
  description?: string;
  category: GymCategory;
  difficulty: GymDifficulty;
  prompt: string;
  setup?: {
    files?: GymFixtureFile[];
  };
  expectations: GymExpectation[];
  script?: GymScenarioScript;
  maxTurns?: number;
}

export type GymExpectation =
  | { type: "file_equals"; path: string; content: string }
  | { type: "file_contains"; path: string; content: string }
  | { type: "file_regex"; path: string; pattern: string }
  | { type: "no_syntax_errors"; path: string }
  | { type: "tool_called"; name: string }
  | { type: "tool_result_error"; name: string; code?: string; messageIncludes?: string }
  | { type: "max_turns"; count: number };

export interface GymExpectationResult {
  type: GymExpectation["type"];
  pass: boolean;
  reason?: string;
  details?: string;
}

export interface GymEvaluationResult {
  pass: boolean;
  reason?: string;
  expectationResults: GymExpectationResult[];
}

export interface GymToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
}

export interface GymScenarioRun {
  scenario: GymScenario;
  workspacePath: string;
  state: AgentState;
  toolCalls: GymToolCallRecord[];
  durationMs: number;
  evaluation: GymEvaluationResult;
}

export interface GymScenarioResult {
  id: string;
  title: string;
  category: GymCategory;
  difficulty: GymDifficulty;
  pass: boolean;
  reason?: string;
  durationMs: number;
  turns: number;
  toolCalls: number;
  expectations: GymExpectationResult[];
}

export interface GymSummaryBucket {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface GymSummary {
  total: GymSummaryBucket & {
    durationMs: number;
    avgTurns: number;
    avgToolCalls: number;
    iqScore: number;
  };
  byDifficulty: Record<GymDifficulty, GymSummaryBucket>;
  byCategory: Record<GymCategory, GymSummaryBucket>;
}

export interface GymReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  suite: {
    difficulties: GymDifficulty[];
    categories: GymCategory[];
  };
  summary: GymSummary;
  scenarios: GymScenarioResult[];
}
