#!/usr/bin/env node
import { Command } from "commander";
import { agentCommand } from "./commands/agent";
import { writeStderr } from "./utils/terminal";

const program = new Command();

program.name("keepup").description("Keep-Up CLI").version("0.1.0");

program.addCommand(agentCommand());

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  writeStderr(message);
  process.exit(1);
});
