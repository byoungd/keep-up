import { spawn } from "node:child_process";
import { Command } from "commander";
import { writeStderr } from "../utils/terminal";

interface GitCommandOptions {
  pr?: string;
  repo?: string;
  body?: string;
}

export function gitCommand(): Command {
  const command = new Command("git").description("Git and GitHub helpers");

  command
    .command("review")
    .description("Post a /review comment on the current PR")
    .option("--pr <number-or-url>", "PR number or URL")
    .option("--repo <owner/name>", "GitHub repo override")
    .option("--body <text>", "Custom comment body")
    .action((options: GitCommandOptions) => {
      void runSlashCommand("/review", options).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        writeStderr(message);
        process.exit(1);
      });
    });

  command
    .command("explain")
    .description("Post an /explain comment on the current PR")
    .option("--pr <number-or-url>", "PR number or URL")
    .option("--repo <owner/name>", "GitHub repo override")
    .option("--body <text>", "Custom comment body")
    .action((options: GitCommandOptions) => {
      void runSlashCommand("/explain", options).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        writeStderr(message);
        process.exit(1);
      });
    });

  return command;
}

async function runSlashCommand(slash: string, options: GitCommandOptions): Promise<void> {
  const body = options.body ?? slash;
  const args = buildGhArgs(body, options);
  await runGh(args);
}

function buildGhArgs(body: string, options: GitCommandOptions): string[] {
  const args = ["pr", "comment"];
  if (options.pr) {
    args.push(options.pr);
  }
  args.push("--body", body);
  if (options.repo) {
    args.push("--repo", options.repo);
  }
  return args;
}

function runGh(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: "inherit" });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`gh exited with code ${code ?? "unknown"}`));
      }
    });
  });
}
