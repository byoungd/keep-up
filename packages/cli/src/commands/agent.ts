import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { AgentState } from "@ku0/agent-runtime-core";
import { Command } from "commander";
import { createConfirmationHandler, resolveApprovalMode } from "../utils/approvals";
import { type CliConfig, ConfigStore } from "../utils/configStore";
import { runInteractiveSession } from "../utils/interactiveSession";
import { extractAssistantText, formatAgentOutput } from "../utils/output";
import { loadProjectInstructions } from "../utils/projectInstructions";
import { runPromptWithStreaming } from "../utils/promptRunner";
import { createRuntimeResources } from "../utils/runtimeClient";
import { resolveOutput, resolveRuntimeConfigString } from "../utils/runtimeOptions";
import { type SessionMessage, type SessionRecord, SessionStore } from "../utils/sessionStore";
import { writeStderr, writeStdout } from "../utils/terminal";
import {
  resolveTuiBinary,
  resolveTuiHost,
  TUI_HOST_ENV,
  TUI_MODEL_ENV,
  TUI_PROVIDER_ENV,
  TUI_SESSION_ENV,
} from "../utils/tui";
import { configCommand } from "./config";
import { sessionCommand } from "./session";

export function agentCommand(): Command {
  return new Command("agent")
    .description("Manage agent runtime")
    .addCommand(runCommand())
    .addCommand(tuiCommand())
    .addCommand(sessionCommand())
    .addCommand(configCommand());
}

function runCommand(): Command {
  return new Command("run")
    .description("Run agent with a prompt")
    .argument("[prompt]", "The prompt to execute")
    .option("--prompt <text>", "The prompt to execute")
    .option("-m, --model <model>", "Model to use", "auto")
    .option("-p, --provider <provider>", "Provider to use (auto, openai, claude, gemini, etc.)")
    .option("-o, --output <format>", "Output format: text, json, markdown", "text")
    .option("--format <format>", "Output format: text, json, markdown")
    .option("--json", "Output json")
    .option("-q, --quiet", "Suppress progress output", false)
    .option("--session <id>", "Continue existing session")
    .option("--approval <mode>", "Approval mode: ask, auto, deny")
    .option("--instructions <text>", "Override AGENTS/CLAUDE instructions")
    .option("--no-stream", "Disable streaming output (still runs the agent)")
    .action((inputPrompt: string | undefined, options: RunOptions) => {
      void runPromptCommand(inputPrompt, options).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        writeStderr(message);
        process.exit(1);
      });
    });
}

function tuiCommand(): Command {
  return new Command("tui")
    .description("Start interactive TUI session")
    .option("-m, --model <model>", "Model to use", "auto")
    .option("-p, --provider <provider>", "Provider to use (auto, openai, claude, gemini, etc.)")
    .option("-o, --output <format>", "Output format: text, json, markdown", "text")
    .option("--format <format>", "Output format: text, json, markdown")
    .option("-q, --quiet", "Suppress progress output", false)
    .option("--session <id>", "Resume existing session")
    .option("--approval <mode>", "Approval mode: ask, auto, deny")
    .option("--instructions <text>", "Override AGENTS/CLAUDE instructions")
    .action(async (options: TuiOptions) => {
      const configStore = new ConfigStore();
      const config = await configStore.load();
      const model =
        resolveRuntimeConfigString(options.model, config.model, "KEEPUP_MODEL") ?? "auto";
      const provider = resolveRuntimeConfigString(
        options.provider,
        config.provider,
        "KEEPUP_PROVIDER"
      );
      const output = resolveOutput(
        resolveRuntimeConfigString(
          options.output ?? options.format,
          config.output,
          "KEEPUP_OUTPUT"
        ) ?? "text"
      );
      const approvalMode = resolveApprovalMode(
        options.approval,
        config.approvalMode,
        "KEEPUP_APPROVAL_MODE"
      );
      const instructions = await loadProjectInstructions({
        override: options.instructions,
      });

      try {
        const tuiBinary = resolveTuiBinary();
        const tuiHost = resolveTuiHost();
        if (tuiBinary && tuiHost) {
          await launchRustTui({
            tuiBinary,
            tuiHost,
            model,
            provider,
            sessionId: options.session,
          });
          return;
        }

        if (!tuiBinary) {
          writeStderr(
            "Rust TUI binary not found. Build packages/keepup-tui or set KEEPUP_TUI_BIN."
          );
        } else {
          writeStderr(
            "Rust TUI host not found. Run pnpm --filter @ku0/cli build before using tui."
          );
        }

        await runInteractiveSession({
          sessionId: options.session,
          model,
          provider,
          output,
          quiet: options.quiet,
          approvalMode,
          instructions,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeStderr(message);
        process.exit(1);
      }
    });
}

type RunOptions = {
  model?: string;
  provider?: string;
  output?: string;
  format?: string;
  json?: boolean;
  quiet?: boolean;
  session?: string;
  approval?: string;
  instructions?: string;
  stream?: boolean;
  prompt?: string;
};

type TuiOptions = {
  model?: string;
  provider?: string;
  output?: string;
  format?: string;
  quiet?: boolean;
  session?: string;
  approval?: string;
  instructions?: string;
};

type ResolvedRunConfig = {
  model: string;
  provider?: string;
  output: ReturnType<typeof resolveOutput>;
  approvalMode: ReturnType<typeof resolveApprovalMode>;
  quiet: boolean;
};

async function runPromptCommand(
  inputPrompt: string | undefined,
  options: RunOptions
): Promise<void> {
  const resolvedPrompt = resolvePrompt(inputPrompt, options);
  const configStore = new ConfigStore();
  const config = await configStore.load();
  const resolved = resolveRunConfig(options, config);

  const sessionStore = new SessionStore();
  const sessionId = resolveSessionId(options, config);
  const existingSession = await sessionStore.get(sessionId);
  const session = normalizeSessionRecord(existingSession, sessionId, resolvedPrompt);

  const instructions = await loadProjectInstructions({
    override: options.instructions,
  });

  const askHandle = shouldPromptForApproval(resolved.approvalMode) ? createAskHandle() : undefined;
  try {
    const confirmationHandler = createConfirmationHandler({
      mode: resolved.approvalMode,
      ask: askHandle?.ask,
      quiet: resolved.quiet,
    });
    const { runtime } = await createRuntimeResources({
      model: resolved.model,
      provider: resolved.provider,
      sessionId,
      initialMessages: session.messages,
      instructions,
    });

    const result = await runPromptWithStreaming({
      runtime,
      prompt: resolvedPrompt,
      quiet: resolved.quiet,
      toolCalls: session.toolCalls,
      approvals: session.approvals,
      confirmationHandler,
    });

    updateSessionFromRun(session, resolvedPrompt, result);
    await sessionStore.save(session);

    writeStdout(
      formatAgentOutput(result, resolved.output, {
        sessionId: session.id,
        toolCalls: session.toolCalls,
        approvals: session.approvals,
      })
    );

    const exitCode = resolveExitCode(result, session);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    askHandle?.close();
  }
}

function resolvePrompt(inputPrompt: string | undefined, options: RunOptions): string {
  const resolved = options.prompt ?? inputPrompt;
  if (!resolved) {
    throw new Error("Prompt is required. Pass it as an argument or with --prompt.");
  }
  return resolved;
}

function resolveRunConfig(options: RunOptions, config: CliConfig): ResolvedRunConfig {
  const model = resolveRuntimeConfigString(options.model, config.model, "KEEPUP_MODEL") ?? "auto";
  const provider = resolveRuntimeConfigString(options.provider, config.provider, "KEEPUP_PROVIDER");
  const outputOverride = options.json ? "json" : (options.output ?? options.format);
  const output = resolveOutput(
    resolveRuntimeConfigString(outputOverride, config.output, "KEEPUP_OUTPUT") ?? "text"
  );
  const approvalMode = resolveApprovalMode(
    options.approval,
    config.approvalMode,
    "KEEPUP_APPROVAL_MODE"
  );
  const quiet = options.quiet || options.stream === false;

  return {
    model,
    provider,
    output,
    approvalMode,
    quiet,
  };
}

function resolveSessionId(options: RunOptions, config: CliConfig): string {
  return (
    options.session ??
    resolveRuntimeConfigString(undefined, config.session, "KEEPUP_SESSION") ??
    `session_${randomUUID()}`
  );
}

function shouldPromptForApproval(mode: ReturnType<typeof resolveApprovalMode>): boolean {
  return mode === "ask" && process.stdin.isTTY;
}

function updateSessionFromRun(session: SessionRecord, prompt: string, state: AgentState): void {
  const assistantText = extractAssistantText(state);
  const messageLog = createMessageLog(prompt, assistantText);
  session.messages.push(...messageLog);
  session.updatedAt = Date.now();
  session.title = session.title || prompt.slice(0, 48);
}

function createSessionRecord(id: string, prompt: string): SessionRecord {
  const now = Date.now();
  return {
    id,
    title: prompt.slice(0, 48),
    createdAt: now,
    updatedAt: now,
    messages: [],
    toolCalls: [],
    approvals: [],
  };
}

function createMessageLog(userPrompt: string, assistantReply: string): SessionMessage[] {
  const now = Date.now();
  return [
    { role: "user", content: userPrompt, timestamp: now },
    { role: "assistant", content: assistantReply, timestamp: now + 1 },
  ];
}

function normalizeSessionRecord(
  existing: SessionRecord | undefined,
  sessionId: string,
  prompt: string
): SessionRecord {
  if (existing) {
    return {
      ...existing,
      toolCalls: existing.toolCalls ?? [],
      approvals: existing.approvals ?? [],
    };
  }
  return createSessionRecord(sessionId, prompt);
}

function resolveExitCode(state: AgentState, session: SessionRecord): number {
  if (state.status === "error") {
    return 2;
  }
  if (
    session.approvals.some(
      (approval) => approval.status === "rejected" || approval.status === "timeout"
    )
  ) {
    return 3;
  }
  if (session.toolCalls.some((toolCall) => toolCall.status === "failed")) {
    return 4;
  }
  return 0;
}

type AskHandle = {
  ask: (prompt: string) => Promise<string>;
  close: () => void;
};

let activeAsk: AskHandle | undefined;

function createAskHandle(): AskHandle {
  if (activeAsk) {
    return activeAsk;
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (prompt: string) =>
    new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => resolve(answer.trim()));
    });

  activeAsk = {
    ask,
    close: () => {
      rl.close();
      activeAsk = undefined;
    },
  };

  return activeAsk;
}

type LaunchTuiOptions = {
  tuiBinary: string;
  tuiHost: string;
  model?: string;
  provider?: string;
  sessionId?: string;
};

async function launchRustTui(options: LaunchTuiOptions): Promise<void> {
  await new Promise<void>((_resolve, reject) => {
    const env = {
      ...process.env,
      [TUI_HOST_ENV]: options.tuiHost,
      [TUI_MODEL_ENV]: options.model ?? "",
      [TUI_PROVIDER_ENV]: options.provider ?? "",
      [TUI_SESSION_ENV]: options.sessionId ?? "",
    };

    const child = spawn(options.tuiBinary, [], { stdio: "inherit", env });

    child.on("error", (error) => reject(error));
    child.on("exit", (code, signal) => {
      if (typeof code === "number") {
        process.exit(code);
      }
      process.exit(signal ? 1 : 0);
    });
  });
}
