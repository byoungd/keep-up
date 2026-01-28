import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ConfirmationRequest } from "@ku0/agent-runtime-core";
import { Command } from "commander";
import { createConfirmationHandler, resolveApprovalMode } from "../utils/approvals";
import { ConfigStore } from "../utils/configStore";
import { writeStderr } from "../utils/terminal";

interface GitCommandOptions {
  pr?: string;
  repo?: string;
  body?: string;
}

export function gitCommand(): Command {
  const command = new Command("git")
    .description("Git and GitHub helpers with approval gating")
    .addCommand(statusCommand())
    .addCommand(commitCommand())
    .addCommand(pushCommand())
    .addCommand(prCommand());

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

function statusCommand(): Command {
  return new Command("status").description("Show git status").action(async () => {
    await runCommand("git", ["status"]);
  });
}

function commitCommand(): Command {
  return new Command("commit")
    .description("Commit staged changes")
    .option("-m, --message <message>", "Commit message")
    .option("-a, --all", "Stage all modified files")
    .option("--approval <mode>", "Approval mode: ask, auto, deny")
    .option("-y, --yes", "Skip confirmation")
    .action(async (options: CommitOptions) => {
      const args = ["commit"] as string[];
      if (options.all) {
        args.push("-a");
      }
      if (options.message) {
        args.push("-m", options.message);
      }

      await requireApproval({
        action: "git.commit",
        description: "Create a git commit",
        risk: "medium",
        args: { message: options.message, all: Boolean(options.all) },
        approval: options.approval,
        yes: options.yes,
      });

      await runCommand("git", args);
    });
}

function pushCommand(): Command {
  return new Command("push")
    .description("Push commits to remote")
    .option("--remote <remote>", "Remote name")
    .option("--branch <branch>", "Branch name")
    .option("--approval <mode>", "Approval mode: ask, auto, deny")
    .option("-y, --yes", "Skip confirmation")
    .action(async (options: PushOptions) => {
      const args = ["push"] as string[];
      if (options.remote) {
        args.push(options.remote);
      }
      if (options.branch) {
        args.push(options.branch);
      }

      await requireApproval({
        action: "git.push",
        description: "Push commits to the remote repository",
        risk: "high",
        args: { remote: options.remote, branch: options.branch },
        approval: options.approval,
        yes: options.yes,
      });

      await runCommand("git", args);
    });
}

function prCommand(): Command {
  return new Command("pr")
    .description("Create a pull request using gh")
    .option("--title <title>", "Pull request title")
    .option("--body <body>", "Pull request body")
    .option("--draft", "Create as draft")
    .option("--base <branch>", "Base branch")
    .option("--head <branch>", "Head branch")
    .option("--approval <mode>", "Approval mode: ask, auto, deny")
    .option("-y, --yes", "Skip confirmation")
    .action(async (options: PrOptions) => {
      const args = ["pr", "create"] as string[];
      if (options.title) {
        args.push("--title", options.title);
      }
      if (options.body) {
        args.push("--body", options.body);
      }
      if (options.draft) {
        args.push("--draft");
      }
      if (options.base) {
        args.push("--base", options.base);
      }
      if (options.head) {
        args.push("--head", options.head);
      }

      await requireApproval({
        action: "git.pr",
        description: "Create a pull request via gh",
        risk: "high",
        args: {
          title: options.title,
          body: options.body,
          draft: Boolean(options.draft),
          base: options.base,
          head: options.head,
        },
        approval: options.approval,
        yes: options.yes,
      });

      await runCommand("gh", args);
    });
}

type CommitOptions = {
  message?: string;
  all?: boolean;
  approval?: string;
  yes?: boolean;
};

type PushOptions = {
  remote?: string;
  branch?: string;
  approval?: string;
  yes?: boolean;
};

type PrOptions = {
  title?: string;
  body?: string;
  draft?: boolean;
  base?: string;
  head?: string;
  approval?: string;
  yes?: boolean;
};

type ApprovalInput = {
  action: string;
  description: string;
  risk: ConfirmationRequest["risk"];
  args: Record<string, unknown>;
  approval?: string;
  yes?: boolean;
};

async function requireApproval(input: ApprovalInput): Promise<void> {
  if (input.yes) {
    return;
  }

  const configStore = new ConfigStore();
  const config = await configStore.load();
  const approvalMode = resolveApprovalMode(
    input.approval,
    config.approvalMode,
    "KEEPUP_APPROVAL_MODE"
  );
  const handler = createConfirmationHandler({
    mode: approvalMode,
    ask: promptUser,
  });

  if (!handler) {
    throw new Error("Approval required to continue.");
  }

  const approved = await handler({
    toolName: input.action,
    description: input.description,
    arguments: input.args,
    risk: input.risk,
    reason: "Git helper operation",
    riskTags: ["git", "cli"],
  });

  if (!approved) {
    throw new Error("Operation not approved.");
  }
}

function promptUser(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => {
      reject(new Error(`${command} failed: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
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
