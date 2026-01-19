import { Command } from "commander";
import { SessionStore } from "../utils/sessionStore";
import { writeStderr, writeStdout } from "../utils/terminal";

export function sessionCommand(): Command {
  return new Command("session")
    .description("Manage sessions")
    .addCommand(listCommand())
    .addCommand(resumeCommand())
    .addCommand(deleteCommand());
}

function listCommand(): Command {
  return new Command("list")
    .description("List all sessions")
    .option("-n, --limit <n>", "Limit results", "10")
    .action(async (options: { limit: string }) => {
      const store = new SessionStore();
      const limit = Number.parseInt(options.limit, 10);
      const sessions = await store.list(Number.isNaN(limit) ? 10 : limit);
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
      writeStdout(`Resuming session ${id}...`);
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
