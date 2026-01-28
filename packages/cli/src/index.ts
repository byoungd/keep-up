#!/usr/bin/env node
import { Command } from "commander";
import { agentCommand, runCommand } from "./commands/agent";
import { approvalsCommand } from "./commands/approvals";
import { checkpointCommand } from "./commands/checkpoint";
import { completionCommand } from "./commands/completion";
import { doctorCommand } from "./commands/doctor";
import { mcpCommand } from "./commands/mcp";
import { writeStderr } from "./utils/terminal";

const program = new Command();

program.name("keepup").description("Keep-Up CLI").version("0.1.0");

program.addCommand(agentCommand());
program.addCommand(runCommand());
program.addCommand(approvalsCommand());
program.addCommand(checkpointCommand());
program.addCommand(doctorCommand());
program.addCommand(completionCommand());
program.addCommand(mcpCommand());

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  writeStderr(message);
  process.exit(1);
});
