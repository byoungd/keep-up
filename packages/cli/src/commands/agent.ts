import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { ConfigStore } from "../utils/configStore";
import { runInteractiveSession } from "../utils/interactiveSession";
import { extractAssistantText, formatAgentOutput } from "../utils/output";
import { runPromptWithStreaming } from "../utils/promptRunner";
import { createRuntimeResources } from "../utils/runtimeClient";
import { resolveOutput, resolveRuntimeConfigString } from "../utils/runtimeOptions";
import { type SessionMessage, type SessionRecord, SessionStore } from "../utils/sessionStore";
import { writeStderr, writeStdout } from "../utils/terminal";
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
    .argument("<prompt>", "The prompt to execute")
    .option("-m, --model <model>", "Model to use", "auto")
    .option("-p, --provider <provider>", "Provider to use (auto, openai, claude, gemini, etc.)")
    .option("-o, --output <format>", "Output format: text, json", "text")
    .option("-q, --quiet", "Suppress progress output", false)
    .option("--session <id>", "Continue existing session")
    .action(async (prompt: string, options: RunOptions) => {
      const configStore = new ConfigStore();
      const config = await configStore.load();
      const model = resolveRuntimeConfigString(options.model, config.model) ?? "auto";
      const provider = resolveRuntimeConfigString(options.provider, config.provider);
      const output = resolveOutput(
        resolveRuntimeConfigString(options.output, config.output) ?? "text"
      );

      const sessionStore = new SessionStore();
      const sessionId = options.session ?? `session_${randomUUID()}`;
      const existingSession = await sessionStore.get(sessionId);
      const session = existingSession ?? createSessionRecord(sessionId, prompt);

      try {
        const { runtime } = await createRuntimeResources({
          model,
          provider,
          sessionId,
          initialMessages: session.messages,
        });

        const result = await runPromptWithStreaming({
          runtime,
          prompt,
          quiet: options.quiet,
          toolCalls: session.toolCalls,
        });

        const assistantText = extractAssistantText(result);
        const messageLog = createMessageLog(prompt, assistantText);
        session.messages.push(...messageLog);
        session.updatedAt = Date.now();
        session.title = session.title || prompt.slice(0, 48);

        await sessionStore.save(session);

        writeStdout(formatAgentOutput(result, output));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeStderr(message);
        process.exit(1);
      }
    });
}

function tuiCommand(): Command {
  return new Command("tui")
    .description("Start interactive TUI session")
    .option("-m, --model <model>", "Model to use", "auto")
    .option("-p, --provider <provider>", "Provider to use (auto, openai, claude, gemini, etc.)")
    .option("-o, --output <format>", "Output format: text, json", "text")
    .option("-q, --quiet", "Suppress progress output", false)
    .option("--session <id>", "Resume existing session")
    .action(async (options: TuiOptions) => {
      const configStore = new ConfigStore();
      const config = await configStore.load();
      const model = resolveRuntimeConfigString(options.model, config.model) ?? "auto";
      const provider = resolveRuntimeConfigString(options.provider, config.provider);
      const output = resolveOutput(
        resolveRuntimeConfigString(options.output, config.output) ?? "text"
      );

      try {
        await runInteractiveSession({
          sessionId: options.session,
          model,
          provider,
          output,
          quiet: options.quiet,
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
  quiet?: boolean;
  session?: string;
};

type TuiOptions = {
  model?: string;
  provider?: string;
  output?: string;
  quiet?: boolean;
  session?: string;
};

function createSessionRecord(id: string, prompt: string): SessionRecord {
  const now = Date.now();
  return {
    id,
    title: prompt.slice(0, 48),
    createdAt: now,
    updatedAt: now,
    messages: [],
    toolCalls: [],
  };
}

function createMessageLog(userPrompt: string, assistantReply: string): SessionMessage[] {
  const now = Date.now();
  return [
    { role: "user", content: userPrompt, timestamp: now },
    { role: "assistant", content: assistantReply, timestamp: now + 1 },
  ];
}
