import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentState } from "@ku0/agent-runtime-core";
import ts from "typescript";
import type {
  GymEvaluationResult,
  GymExpectation,
  GymExpectationResult,
  GymScenario,
  GymToolCallRecord,
} from "./types";
import { resolveWorkspacePath } from "./utils/files";

export interface GymEvaluationContext {
  workspacePath: string;
  state: AgentState;
  toolCalls: GymToolCallRecord[];
}

export async function evaluateScenario(
  scenario: GymScenario,
  context: GymEvaluationContext
): Promise<GymEvaluationResult> {
  const expectationResults: GymExpectationResult[] = [];

  for (const expectation of scenario.expectations) {
    expectationResults.push(await evaluateExpectation(expectation, context));
  }

  const firstFailure = expectationResults.find((result) => !result.pass);

  return {
    pass: !firstFailure,
    reason: firstFailure?.reason,
    expectationResults,
  };
}

async function evaluateExpectation(
  expectation: GymExpectation,
  context: GymEvaluationContext
): Promise<GymExpectationResult> {
  switch (expectation.type) {
    case "file_equals":
      return evaluateFileEquals(expectation.path, expectation.content, context);
    case "file_contains":
      return evaluateFileContains(expectation.path, expectation.content, context);
    case "file_regex":
      return evaluateFileRegex(expectation.path, expectation.pattern, context);
    case "no_syntax_errors":
      return evaluateSyntax(expectation.path, context);
    case "tool_called":
      return evaluateToolCalled(expectation.name, context);
    case "max_turns":
      return evaluateMaxTurns(expectation.count, context);
    default:
      return { type: expectation.type, pass: false, reason: "unknown_expectation" };
  }
}

async function evaluateFileEquals(
  targetPath: string,
  expected: string,
  context: GymEvaluationContext
): Promise<GymExpectationResult> {
  const content = await readWorkspaceFile(targetPath, context);
  if (content === null) {
    return { type: "file_equals", pass: false, reason: "missing_file" };
  }
  const pass = content === expected;
  return {
    type: "file_equals",
    pass,
    reason: pass ? undefined : "content_mismatch",
  };
}

async function evaluateFileContains(
  targetPath: string,
  expected: string,
  context: GymEvaluationContext
): Promise<GymExpectationResult> {
  const content = await readWorkspaceFile(targetPath, context);
  if (content === null) {
    return { type: "file_contains", pass: false, reason: "missing_file" };
  }
  const pass = content.includes(expected);
  return {
    type: "file_contains",
    pass,
    reason: pass ? undefined : "content_missing",
  };
}

async function evaluateFileRegex(
  targetPath: string,
  pattern: string,
  context: GymEvaluationContext
): Promise<GymExpectationResult> {
  const content = await readWorkspaceFile(targetPath, context);
  if (content === null) {
    return { type: "file_regex", pass: false, reason: "missing_file" };
  }
  const regex = new RegExp(pattern, "m");
  const pass = regex.test(content);
  return {
    type: "file_regex",
    pass,
    reason: pass ? undefined : "pattern_missing",
  };
}

async function evaluateSyntax(
  targetPath: string,
  context: GymEvaluationContext
): Promise<GymExpectationResult> {
  const content = await readWorkspaceFile(targetPath, context);
  if (content === null) {
    return { type: "no_syntax_errors", pass: false, reason: "missing_file" };
  }

  const sourceFile = ts.createSourceFile(
    path.basename(targetPath),
    content,
    ts.ScriptTarget.ES2022,
    true
  );
  const diagnostics = sourceFile.parseDiagnostics;
  const pass = diagnostics.length === 0;

  return {
    type: "no_syntax_errors",
    pass,
    reason: pass ? undefined : "syntax",
    details: pass ? undefined : diagnostics.map((diag) => diag.messageText).join("; "),
  };
}

function evaluateToolCalled(toolName: string, context: GymEvaluationContext): GymExpectationResult {
  const pass = context.toolCalls.some((call) => call.name === toolName);
  return {
    type: "tool_called",
    pass,
    reason: pass ? undefined : "tool_not_called",
  };
}

function evaluateMaxTurns(count: number, context: GymEvaluationContext): GymExpectationResult {
  const pass = context.state.turn <= count;
  return {
    type: "max_turns",
    pass,
    reason: pass ? undefined : "turns_exceeded",
  };
}

async function readWorkspaceFile(
  targetPath: string,
  context: GymEvaluationContext
): Promise<string | null> {
  const absolutePath = resolveWorkspacePath(context.workspacePath, targetPath);
  try {
    return await readFile(absolutePath, "utf-8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return null;
    }
    throw error;
  }
}
