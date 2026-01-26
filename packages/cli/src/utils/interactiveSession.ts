import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import {
  type ApprovalMode,
  type AutoApprovalOptions,
  createConfirmationHandler,
} from "./approvals";
import type { OutputFormat } from "./output";
import { extractAssistantText, formatAgentOutput } from "./output";
import { runPromptWithStreaming } from "./promptRunner";
import { createRuntimeResources } from "./runtimeClient";
import type { SandboxMode } from "./runtimeOptions";
import { type SessionRecord, SessionStore } from "./sessionStore";
import { writeStdout } from "./terminal";

export interface InteractiveSessionOptions {
  sessionId?: string;
  model?: string;
  provider?: string;
  output: OutputFormat;
  quiet?: boolean;
  approvalMode?: ApprovalMode;
  sandbox?: SandboxMode;
  autoApproval?: AutoApprovalOptions;
  instructions?: string;
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
  const ask = createAsk(rl);

  const session = await selectSession({
    sessions,
    sessionId: options.sessionId,
    ask,
  });
  ensureSessionMetadata(session);

  writeStdout("Keep-Up TUI");
  writeStdout(`Session: ${session.id}${session.title ? ` (${session.title})` : ""}`);
  writeStdout("Type /exit to quit, /help for commands.\n");

  const { runtime } = await createRuntimeResources({
    model: options.model,
    provider: options.provider,
    sessionId: session.id,
    initialMessages: session.messages,
    instructions: options.instructions,
    sandbox: options.sandbox,
  });
  const confirmationHandler = createConfirmationHandler({
    mode: options.approvalMode ?? "ask",
    ask,
    quiet: options.quiet,
    autoApproval: options.autoApproval,
  });

  try {
    await runInteractiveLoop({
      ask,
      runtime,
      options,
      session,
      sessionStore,
      confirmationHandler,
    });
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
    approvals: [],
  };
}

function printHelp(): void {
  writeStdout("Commands:");
  writeStdout("  /help  Show this help");
  writeStdout("  /exit  Exit the session");
}

type InputAction =
  | { type: "skip" }
  | { type: "exit" }
  | { type: "help" }
  | { type: "prompt"; text: string };

function createAsk(rl: ReturnType<typeof createInterface>) {
  return (prompt: string) =>
    new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => resolve(answer.trim()));
    });
}

function classifyInput(input: string): InputAction {
  if (!input) {
    return { type: "skip" };
  }
  if (EXIT_COMMANDS.has(input)) {
    return { type: "exit" };
  }
  if (HELP_COMMANDS.has(input)) {
    return { type: "help" };
  }
  return { type: "prompt", text: input };
}

function ensureSessionMetadata(session: SessionRecord): void {
  session.toolCalls = session.toolCalls ?? [];
  session.approvals = session.approvals ?? [];
}

async function runInteractiveLoop(input: {
  ask: (prompt: string) => Promise<string>;
  runtime: Awaited<ReturnType<typeof createRuntimeResources>>["runtime"];
  options: InteractiveSessionOptions;
  session: SessionRecord;
  sessionStore: SessionStore;
  confirmationHandler?: ReturnType<typeof createConfirmationHandler>;
}): Promise<void> {
  while (true) {
    const raw = await input.ask("> ");
    const action = classifyInput(raw);
    if (action.type === "skip") {
      continue;
    }
    if (action.type === "exit") {
      return;
    }
    if (action.type === "help") {
      printHelp();
      continue;
    }

    await handlePrompt({
      prompt: action.text,
      runtime: input.runtime,
      options: input.options,
      session: input.session,
      sessionStore: input.sessionStore,
      confirmationHandler: input.confirmationHandler,
    });
  }
}

async function handlePrompt(input: {
  prompt: string;
  runtime: Awaited<ReturnType<typeof createRuntimeResources>>["runtime"];
  options: InteractiveSessionOptions;
  session: SessionRecord;
  sessionStore: SessionStore;
  confirmationHandler?: ReturnType<typeof createConfirmationHandler>;
}): Promise<void> {
  const state = await runPromptWithStreaming({
    runtime: input.runtime,
    prompt: input.prompt,
    quiet: input.options.quiet,
    toolCalls: input.session.toolCalls,
    approvals: input.session.approvals,
    confirmationHandler: input.confirmationHandler,
  });

  const assistantText = extractAssistantText(state);
  const now = Date.now();
  input.session.messages.push(
    { role: "user", content: input.prompt, timestamp: now },
    { role: "assistant", content: assistantText, timestamp: now + 1 }
  );
  input.session.updatedAt = Date.now();
  input.session.title = input.session.title || input.prompt.slice(0, 48);

  await input.sessionStore.save(input.session);

  if (input.options.output === "json") {
    writeStdout(
      formatAgentOutput(state, input.options.output, {
        sessionId: input.session.id,
        toolCalls: input.session.toolCalls,
        approvals: input.session.approvals,
      })
    );
    return;
  }

  writeStdout(assistantText || "<no assistant response>");
}
