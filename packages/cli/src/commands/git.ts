import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ConfirmationRequest } from "@ku0/agent-runtime-core";
import { Command } from "commander";
import { createConfirmationHandler, resolveApprovalMode } from "../utils/approvals";
import { ConfigStore } from "../utils/configStore";

export function gitCommand(): Command {
  return new Command("git")
    .description("Git helpers with approval gating")
    .addCommand(statusCommand())
    .addCommand(commitCommand())
    .addCommand(pushCommand())
    .addCommand(prCommand());
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
