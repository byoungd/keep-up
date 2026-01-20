import { randomUUID } from "node:crypto";
import { createMockLLM, createRuntime, createToolRegistry } from "@ku0/agent-runtime";
import { Command } from "commander";
import { ConfigStore } from "../utils/configStore";
import { extractAssistantText, formatAgentOutput } from "../utils/output";
import { type SessionMessage, type SessionRecord, SessionStore } from "../utils/sessionStore";
import { writeStderr, writeStdout } from "../utils/terminal";
import { configCommand } from "./config";
import { sessionCommand } from "./session";

export function agentCommand(): Command {
  return new Command("agent")
    .description("Manage agent runtime")
    .addCommand(runCommand())
    .addCommand(sessionCommand())
    .addCommand(configCommand());
}

function runCommand(): Command {
  return new Command("run")
    .description("Run agent with a prompt")
    .argument("<prompt>", "The prompt to execute")
    .option("-m, --model <model>", "Model to use", "mock")
    .option("-o, --output <format>", "Output format: text, json", "text")
    .option("-q, --quiet", "Suppress spinner", false)
    .option("--session <id>", "Continue existing session")
    .action(async (prompt: string, options: RunOptions) => {
      const configStore = new ConfigStore();
      const config = await configStore.load();
      const model = resolveConfigString(options.model, config.model) ?? "mock";
      const output = resolveOutput(resolveConfigString(options.output, config.output) ?? "text");

      const sessionStore = new SessionStore();
      const sessionId = options.session ?? `session_${randomUUID()}`;
      const existingSession = await sessionStore.get(sessionId);
      const session = existingSession ?? createSessionRecord(sessionId, prompt);

      const spinner = createSpinner(!options.quiet);
      spinner.start("Thinking");

      try {
        const llm = createMockLLM();
        llm.setDefaultResponse({
          content: `Mock response (${model})`,
          finishReason: "stop",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });

        const registry = createToolRegistry();
        const runtime = await createRuntime({
          components: {
            llm,
            registry,
          },
        });

        const result = await runtime.kernel.run(prompt);
        spinner.stop();

        const assistantText = extractAssistantText(result);
        const messageLog = createMessageLog(prompt, assistantText);
        session.messages.push(...messageLog);
        session.updatedAt = Date.now();
        session.title = session.title || prompt.slice(0, 48);

        await sessionStore.save(session);

        writeStdout(formatAgentOutput(result, output));
      } catch (error) {
        spinner.stop();
        const message = error instanceof Error ? error.message : String(error);
        writeStderr(message);
        process.exit(1);
      }
    });
}

type RunOptions = {
  model?: string;
  output?: string;
  quiet?: boolean;
  session?: string;
};

function resolveOutput(value: string): "text" | "json" {
  return value === "json" ? "json" : "text";
}

function resolveConfigString(primary: string | undefined, fallback: unknown): string | undefined {
  if (primary) {
    return primary;
  }
  return typeof fallback === "string" ? fallback : undefined;
}

function createSessionRecord(id: string, prompt: string): SessionRecord {
  const now = Date.now();
  return {
    id,
    title: prompt.slice(0, 48),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function createMessageLog(userPrompt: string, assistantReply: string): SessionMessage[] {
  const now = Date.now();
  return [
    { role: "user", content: userPrompt, timestamp: now },
    { role: "assistant", content: assistantReply, timestamp: now + 1 },
  ];
}

function createSpinner(enabled: boolean) {
  let interval: NodeJS.Timeout | undefined;
  const frames = ["-", "\\", "|", "/"];
  let index = 0;

  return {
    start(label: string) {
      if (!enabled) {
        return;
      }
      process.stdout.write(`${label} ${frames[index]}`);
      interval = setInterval(() => {
        index = (index + 1) % frames.length;
        process.stdout.write(`\r${label} ${frames[index]}`);
      }, 120);
    },
    stop() {
      if (!enabled) {
        return;
      }
      if (interval) {
        clearInterval(interval);
      }
      process.stdout.write("\r");
    },
  };
}
