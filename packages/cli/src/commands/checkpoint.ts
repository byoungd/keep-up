import { Command } from "commander";
import { fetchCoworkJson } from "../utils/coworkGateway";
import { writeStdout } from "../utils/terminal";

type CheckpointSummary = {
  id: string;
  status: string;
  createdAt: number;
  task?: string;
  currentStep?: number;
};

export function checkpointCommand(): Command {
  return new Command("checkpoint")
    .description("Manage checkpoints via Cowork gateway")
    .addCommand(listCommand())
    .addCommand(showCommand())
    .addCommand(createCommand())
    .addCommand(restoreCommand())
    .addCommand(replayCommand());
}

function listCommand(): Command {
  return new Command("list")
    .description("List checkpoints for a session")
    .argument("<sessionId>", "Session ID")
    .option("--base-url <url>", "Cowork API base URL")
    .option("--status <status>", "Filter by status (pending, completed, failed, cancelled)")
    .option("--limit <n>", "Limit results")
    .action(
      async (sessionId: string, options: { baseUrl?: string; status?: string; limit?: string }) => {
        const params = new URLSearchParams();
        if (options.status) {
          params.set("status", options.status);
        }
        if (options.limit) {
          params.set("limit", options.limit);
        }
        const qs = params.toString();
        const data = await fetchCoworkJson<{ checkpoints?: CheckpointSummary[] }>(
          `/api/sessions/${sessionId}/checkpoints${qs ? `?${qs}` : ""}`,
          { baseUrl: options.baseUrl }
        );
        const checkpoints = data.checkpoints ?? [];
        if (checkpoints.length === 0) {
          writeStdout("No checkpoints found.");
          return;
        }
        writeStdout("ID\tSTATUS\tSTEP\tCREATED\tTASK");
        for (const checkpoint of checkpoints) {
          const created = new Date(checkpoint.createdAt).toLocaleString();
          const step = checkpoint.currentStep ?? 0;
          writeStdout(
            `${checkpoint.id}\t${checkpoint.status}\t${step}\t${created}\t${checkpoint.task ?? ""}`
          );
        }
      }
    );
}

function showCommand(): Command {
  return new Command("show")
    .description("Show checkpoint details")
    .argument("<sessionId>", "Session ID")
    .argument("<checkpointId>", "Checkpoint ID")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (sessionId: string, checkpointId: string, options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<{ checkpoint?: unknown }>(
        `/api/sessions/${sessionId}/checkpoints/${checkpointId}`,
        { baseUrl: options.baseUrl }
      );
      writeStdout(JSON.stringify(data.checkpoint ?? {}, null, 2));
    });
}

function createCommand(): Command {
  return new Command("create")
    .description("Create a checkpoint for a session")
    .argument("<sessionId>", "Session ID")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (sessionId: string, options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<Record<string, unknown>>(
        `/api/sessions/${sessionId}/checkpoints`,
        { baseUrl: options.baseUrl, method: "POST" }
      );
      writeStdout(JSON.stringify(data, null, 2));
    });
}

function restoreCommand(): Command {
  return new Command("restore")
    .description("Restore a checkpoint for a session")
    .argument("<sessionId>", "Session ID")
    .argument("<checkpointId>", "Checkpoint ID")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (sessionId: string, checkpointId: string, options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<Record<string, unknown>>(
        `/api/sessions/${sessionId}/checkpoints/${checkpointId}/restore`,
        { baseUrl: options.baseUrl, method: "POST" }
      );
      writeStdout(JSON.stringify(data, null, 2));
    });
}

function replayCommand(): Command {
  return new Command("replay")
    .description("Compute replay plan for a checkpoint")
    .argument("<sessionId>", "Session ID")
    .argument("<checkpointId>", "Checkpoint ID")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (sessionId: string, checkpointId: string, options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<Record<string, unknown>>(
        `/api/sessions/${sessionId}/checkpoints/${checkpointId}/replay`,
        { baseUrl: options.baseUrl, method: "POST" }
      );
      writeStdout(JSON.stringify(data, null, 2));
    });
}
