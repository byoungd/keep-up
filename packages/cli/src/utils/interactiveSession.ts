import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { OutputFormat } from "./output";
import { extractAssistantText } from "./output";
import { runPromptWithStreaming } from "./promptRunner";
import { createRuntimeResources } from "./runtimeClient";
import { type SessionRecord, SessionStore } from "./sessionStore";
import { writeStdout } from "./terminal";

export interface InteractiveSessionOptions {
  sessionId?: string;
  model?: string;
  provider?: string;
  output: OutputFormat;
  quiet?: boolean;
}

const EXIT_COMMANDS = new Set(["/exit", "/quit"]);
const HELP_COMMANDS = new Set(["/help", "/?"]);

export async function runInteractiveSession(options: InteractiveSessionOptions): Promise<void> {
  const sessionStore = new SessionStore();
  const sessions = await sessionStore.list(10);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string) =>
    new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => resolve(answer.trim()));
    });

  const session = await selectSession({
    sessions,
    sessionId: options.sessionId,
    ask,
  });

  writeStdout("Keep-Up TUI");
  writeStdout(`Session: ${session.id}${session.title ? ` (${session.title})` : ""}`);
  writeStdout("Type /exit to quit, /help for commands.\n");

  const { runtime } = await createRuntimeResources({
    model: options.model,
    provider: options.provider,
    sessionId: session.id,
    initialMessages: session.messages,
  });

  try {
    while (true) {
      const input = await ask("> ");
      if (!input) {
        continue;
      }
      if (EXIT_COMMANDS.has(input)) {
        break;
      }
      if (HELP_COMMANDS.has(input)) {
        printHelp();
        continue;
      }

      const state = await runPromptWithStreaming({
        runtime,
        prompt: input,
        quiet: options.quiet,
        toolCalls: session.toolCalls,
      });

      const assistantText = extractAssistantText(state);
      const now = Date.now();
      session.messages.push(
        { role: "user", content: input, timestamp: now },
        { role: "assistant", content: assistantText, timestamp: now + 1 }
      );
      session.updatedAt = Date.now();
      session.title = session.title || input.slice(0, 48);

      await sessionStore.save(session);

      if (options.output === "json") {
        writeStdout(JSON.stringify(state, null, 2));
      } else {
        writeStdout(assistantText || "<no assistant response>");
      }
    }
  } finally {
    rl.close();
  }
}

type SessionSelectionInput = {
  sessions: SessionRecord[];
  sessionId?: string;
  ask: (prompt: string) => Promise<string>;
};

async function selectSession(input: SessionSelectionInput): Promise<SessionRecord> {
  if (input.sessionId) {
    const existing = input.sessions.find((session) => session.id === input.sessionId);
    if (existing) {
      return existing;
    }
  }

  if (input.sessions.length > 0 && !input.sessionId) {
    writeStdout("Recent sessions:");
    input.sessions.forEach((session, index) => {
      writeStdout(`  [${index + 1}] ${session.id} - ${session.title || "(untitled)"}`);
    });

    const selection = await input.ask("Select a session number or press Enter for a new one: ");
    if (selection) {
      const index = Number.parseInt(selection, 10);
      if (!Number.isNaN(index) && index >= 1 && index <= input.sessions.length) {
        return input.sessions[index - 1];
      }
      const byId = input.sessions.find((session) => session.id === selection);
      if (byId) {
        return byId;
      }
      writeStdout("Invalid selection. Starting a new session.");
    }
  }

  const newSessionId = input.sessionId ?? `session_${randomUUID()}`;
  const now = Date.now();
  return {
    id: newSessionId,
    title: "",
    createdAt: now,
    updatedAt: now,
    messages: [],
    toolCalls: [],
  };
}

function printHelp(): void {
  writeStdout("Commands:");
  writeStdout("  /help  Show this help");
  writeStdout("  /exit  Exit the session");
}
