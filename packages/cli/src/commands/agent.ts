import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

type LaunchTuiOptions = {
  tuiBinary: string;
  tuiHost: string;
  model?: string;
  provider?: string;
  sessionId?: string;
};

const TUI_BIN_ENV = "KEEPUP_TUI_BIN";
const TUI_HOST_ENV = "KEEPUP_TUI_HOST";
const TUI_MODEL_ENV = "KEEPUP_TUI_MODEL";
const TUI_PROVIDER_ENV = "KEEPUP_TUI_PROVIDER";
const TUI_SESSION_ENV = "KEEPUP_TUI_SESSION";

function resolveTuiBinary(): string | undefined {
  const override = process.env[TUI_BIN_ENV];
  if (override && existsSync(override)) {
    return override;
  }

  const suffix = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    path.resolve(process.cwd(), `packages/keepup-tui/target/release/keepup-tui${suffix}`),
    path.resolve(process.cwd(), `packages/keepup-tui/target/debug/keepup-tui${suffix}`),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveTuiHost(): string | undefined {
  const override = process.env[TUI_HOST_ENV];
  if (override && existsSync(override)) {
    return override;
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const hostPath = path.resolve(__dirname, "../tui/host.js");
  return existsSync(hostPath) ? hostPath : undefined;
}

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
