import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { resolveApprovalMode, resolveAutoApprovalOptions } from "../utils/approvals";
import { ConfigStore } from "../utils/configStore";
import { runInteractiveSession } from "../utils/interactiveSession";
import { loadProjectInstructions } from "../utils/projectInstructions";
import {
  resolveOutput,
  resolveRuntimeConfigString,
  resolveSandboxMode,
} from "../utils/runtimeOptions";
import { SessionStore } from "../utils/sessionStore";
import { writeStderr, writeStdout } from "../utils/terminal";

export function sessionCommand(): Command {
  return new Command("session")
    .description("Manage sessions")
    .addCommand(listCommand())
    .addCommand(resumeCommand())
    .addCommand(exportCommand())
    .addCommand(deleteCommand());
}

function listCommand(): Command {
  return new Command("list")
    .description("List all sessions")
    .option("-n, --limit <n>", "Limit results", "10")
    .option("-a, --all", "List all sessions")
    .action(async (options: { limit: string; all?: boolean }) => {
      const store = new SessionStore();
      const limit = options.all ? 0 : Number.parseInt(options.limit, 10);
      const resolvedLimit = Number.isNaN(limit) ? 10 : limit;
      const sessions = await store.list(resolvedLimit);
      printSessionTable(sessions);
    });
}

function resumeCommand(): Command {
  return new Command("resume")
    .description("Resume a session")
    .argument("<id>", "Session ID")
    .action(async (id: string) => {
      const store = new SessionStore();
      const session = await store.get(id);
      if (!session) {
        writeStderr(`Session ${id} not found`);
        process.exit(1);
      }
      const configStore = new ConfigStore();
      const config = await configStore.load();
      const model = resolveRuntimeConfigString(undefined, config.model, "KEEPUP_MODEL") ?? "auto";
      const provider = resolveRuntimeConfigString(undefined, config.provider, "KEEPUP_PROVIDER");
      const output = resolveOutput(
        resolveRuntimeConfigString(undefined, config.output, "KEEPUP_OUTPUT") ?? "text"
      );
      const approvalMode = resolveApprovalMode(
        undefined,
        config.approvalMode,
        "KEEPUP_APPROVAL_MODE"
      );
      const sandbox = resolveSandboxMode(undefined, config.sandbox, "KEEPUP_SANDBOX");
      const autoApproval = resolveAutoApprovalOptions({
        policies: config.approvalPolicies,
        workspacePaths: config.approvalWorkspacePaths,
      });
      const instructions = await loadProjectInstructions({});

      writeStdout(`Resuming session ${id}...`);
      await runInteractiveSession({
        sessionId: id,
        model,
        provider,
        output,
        approvalMode,
        sandbox,
        autoApproval,
        instructions,
      });
    });
}

function exportCommand(): Command {
  return new Command("export")
    .description("Export a session record as JSON")
    .argument("<id>", "Session ID")
    .option("-o, --output <path>", "Output file path")
    .action(async (id: string, options: { output?: string }) => {
      const store = new SessionStore();
      const session = await store.get(id);
      if (!session) {
        writeStderr(`Session ${id} not found`);
        process.exit(1);
      }
      const payload = JSON.stringify(session, null, 2);
      if (options.output) {
        await writeFile(options.output, payload, "utf8");
        writeStdout(`Session ${id} exported to ${options.output}`);
        return;
      }
      writeStdout(payload);
    });
}

function deleteCommand(): Command {
  return new Command("delete")
    .description("Delete a session")
    .argument("<id>", "Session ID")
    .action(async (id: string) => {
      const store = new SessionStore();
      const deleted = await store.delete(id);
      if (!deleted) {
        writeStderr(`Session ${id} not found`);
        process.exit(1);
      }
      writeStdout(`Session ${id} deleted`);
    });
}

function printSessionTable(
  sessions: Array<{ id: string; title: string; updatedAt: number }>
): void {
  if (sessions.length === 0) {
    writeStdout("No sessions found.");
    return;
  }

  writeStdout("ID\tLast Updated\tTitle");
  for (const session of sessions) {
    const updated = new Date(session.updatedAt).toLocaleString();
    writeStdout(`${session.id}\t${updated}\t${session.title}`);
  }
}
