import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentState } from "@ku0/agent-runtime-core";
import { createRuntime } from "@ku0/agent-runtime-execution/runtime";
import { securityPolicy } from "@ku0/agent-runtime-execution/security";
import { createBashToolServer } from "@ku0/agent-runtime-tools/tools/core/bash";
import { createCompletionToolServer } from "@ku0/agent-runtime-tools/tools/core/completion";
import { createFileToolServer } from "@ku0/agent-runtime-tools/tools/core/file";
import { createScriptedLLM, extractToolCallsFromMessages } from "./llm/scripted";
import { evaluateScenario } from "./scoring";
import type { GymScenario, GymScenarioResult, GymScenarioRun } from "./types";
import { cleanupWorkspace, writeFixtures } from "./utils/files";

export interface GymRunnerOptions {
  workspaceRoot?: string;
  preserveWorkspace?: boolean;
  now?: () => number;
}

export async function runScenario(
  scenario: GymScenario,
  options: GymRunnerOptions = {}
): Promise<GymScenarioRun> {
  const now = options.now ?? Date.now;
  const workspacePath = await createWorkspace(options.workspaceRoot);

  try {
    if (scenario.setup?.files?.length) {
      await writeFixtures(workspacePath, scenario.setup.files);
    }

    const llm = createScriptedLLM(scenario, workspacePath);
    const policy = securityPolicy()
      .withSandbox("process")
      .withNetworkAccess("none")
      .withFsIsolation("workspace")
      .withWorkingDirectory(workspacePath)
      .withFilePermission("workspace")
      .withBashPermission("confirm")
      .withCodePermission("disabled")
      .withNetworkPermission("none")
      .withLFCCPermission("read")
      .build();

    const runtime = await createRuntime({
      components: {
        llm,
        toolServers: [createCompletionToolServer(), createFileToolServer(), createBashToolServer()],
        security: policy,
      },
      kernel: {
        orchestrator: {
          requireConfirmation: false,
          maxTurns: scenario.maxTurns ?? 8,
        },
      },
    });

    const startedAt = now();
    const state = await runKernel(runtime.kernel.run.bind(runtime.kernel), scenario.prompt);
    const durationMs = now() - startedAt;

    const toolCalls = extractToolCallsFromMessages(
      state.messages as Array<{
        role: string;
        toolCalls?: { name: string; arguments: Record<string, unknown> }[];
      }>
    );

    const evaluation = await evaluateScenario(scenario, {
      workspacePath,
      state,
      toolCalls,
    });

    return {
      scenario,
      workspacePath,
      state,
      toolCalls,
      durationMs,
      evaluation,
    };
  } finally {
    if (!options.preserveWorkspace) {
      await cleanupWorkspace(workspacePath);
    }
  }
}

export function toScenarioResult(run: GymScenarioRun): GymScenarioResult {
  return {
    id: run.scenario.id,
    title: run.scenario.title,
    category: run.scenario.category,
    difficulty: run.scenario.difficulty,
    pass: run.evaluation.pass,
    reason: run.evaluation.reason,
    durationMs: run.durationMs,
    turns: run.state.turn,
    toolCalls: run.toolCalls.length,
    expectations: run.evaluation.expectationResults,
  };
}

async function runKernel(
  run: (input: string) => Promise<AgentState>,
  prompt: string
): Promise<AgentState> {
  try {
    return await run(prompt);
  } catch (error) {
    return {
      turn: 0,
      messages: [],
      pendingToolCalls: [],
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function createWorkspace(workspaceRoot?: string): Promise<string> {
  const root = workspaceRoot ?? path.join(os.tmpdir(), "keepup-gym-");
  return mkdtemp(root);
}
