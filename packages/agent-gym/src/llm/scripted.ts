import type {
  AgentLLMRequest,
  AgentLLMResponse,
  IAgentLLM,
} from "@ku0/agent-runtime-execution/orchestrator";
import type { GymScenario, GymScriptedResponse, GymToolCallRecord } from "../types";
import { resolveWorkspacePath } from "../utils/files";

const PATH_KEYS = new Set(["path", "base_path"]);

export class ScriptedLLM implements IAgentLLM {
  private readonly responses: AgentLLMResponse[];
  private cursor = 0;

  constructor(responses: AgentLLMResponse[]) {
    this.responses = responses;
  }

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    const response = this.responses[this.cursor] ?? { content: "", finishReason: "stop" };
    this.cursor += 1;
    return response;
  }
}

export function createScriptedLLM(scenario: GymScenario, workspacePath: string): ScriptedLLM {
  const scripted = scenario.script?.responses ?? [];
  const responses = scripted.map((response) => resolveResponse(response, workspacePath));
  const withCompletion = ensureCompletionResponse(responses, scenario);
  return new ScriptedLLM(withCompletion);
}

function resolveResponse(response: GymScriptedResponse, workspacePath: string): AgentLLMResponse {
  const toolCalls = response.toolCalls?.map((call) => ({
    name: call.name,
    arguments: resolveToolArgs(call.arguments, workspacePath),
  }));

  return {
    content: response.content,
    finishReason: response.finishReason,
    toolCalls,
  };
}

function ensureCompletionResponse(
  responses: AgentLLMResponse[],
  scenario: GymScenario
): AgentLLMResponse[] {
  if (responses.some((response) => hasCompletionCall(response))) {
    return responses;
  }

  const trimmed = [...responses];
  if (trimmed.length > 0 && trimmed[trimmed.length - 1].finishReason === "stop") {
    trimmed.pop();
  }

  trimmed.push({
    content: "Completing scenario.",
    finishReason: "tool_use",
    toolCalls: [
      {
        name: "completion:complete_task",
        arguments: { summary: `KeepUpGym scenario ${scenario.id} complete.` },
      },
    ],
  });

  return trimmed;
}

function hasCompletionCall(response: AgentLLMResponse): boolean {
  return response.toolCalls?.some((call) => call.name.endsWith(":complete_task")) ?? false;
}

function resolveToolArgs(
  args: Record<string, unknown>,
  workspacePath: string
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (PATH_KEYS.has(key) && typeof value === "string") {
      resolved[key] = resolveWorkspacePath(workspacePath, value);
      continue;
    }
    if (key === "paths" && Array.isArray(value)) {
      resolved[key] = value.map((entry) =>
        typeof entry === "string" ? resolveWorkspacePath(workspacePath, entry) : entry
      );
      continue;
    }
    resolved[key] = value;
  }
  return resolved;
}

export function extractToolCallsFromMessages(
  messages: Array<{ role: string; toolCalls?: GymToolCallRecord[] }>
): GymToolCallRecord[] {
  const calls: GymToolCallRecord[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    if (!message.toolCalls || message.toolCalls.length === 0) {
      continue;
    }
    calls.push(...message.toolCalls);
  }
  return calls;
}
