import { Command } from "commander";
import { fetchCoworkJson } from "../utils/coworkGateway";
import { writeStdout } from "../utils/terminal";

type NodeDescriptor = {
  id: string;
  name?: string;
  kind?: string;
  status?: string;
  capabilities?: Array<{ command: string }>;
};

export function nodeCommand(): Command {
  return new Command("node")
    .description("Manage gateway device nodes")
    .addCommand(listCommand())
    .addCommand(describeCommand())
    .addCommand(invokeCommand());
}

function listCommand(): Command {
  return new Command("list")
    .description("List connected nodes")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<{ nodes?: NodeDescriptor[] }>("/api/gateway/nodes", {
        baseUrl: options.baseUrl,
      });
      const nodes = data.nodes ?? [];
      if (nodes.length === 0) {
        writeStdout("No nodes connected.");
        return;
      }
      writeStdout("ID\tSTATUS\tKIND\tNAME");
      for (const node of nodes) {
        writeStdout(
          `${node.id}\t${node.status ?? "unknown"}\t${node.kind ?? "-"}\t${node.name ?? "-"}`
        );
      }
    });
}

function describeCommand(): Command {
  return new Command("describe")
    .description("Describe a node")
    .argument("<id>", "Node id")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (id: string, options: { baseUrl?: string }) => {
      const data = await fetchCoworkJson<{ node?: NodeDescriptor }>(
        `/api/gateway/nodes/${encodeURIComponent(id)}`,
        { baseUrl: options.baseUrl }
      );
      writeStdout(JSON.stringify(data.node ?? {}, null, 2));
    });
}

function invokeCommand(): Command {
  return new Command("invoke")
    .description("Invoke a node command")
    .argument("<id>", "Node id")
    .argument("<command>", "Command name")
    .option("--args <json>", "Command args as JSON")
    .option("--base-url <url>", "Cowork API base URL")
    .action(async (id: string, command: string, options: { args?: string; baseUrl?: string }) => {
      const args = options.args ? parseJson(options.args) : undefined;
      const data = await fetchCoworkJson<{ result?: unknown }>(
        `/api/gateway/nodes/${encodeURIComponent(id)}/invoke`,
        {
          baseUrl: options.baseUrl,
          method: "POST",
          body: JSON.stringify({ command, args }),
          headers: { "Content-Type": "application/json" },
        }
      );
      writeStdout(JSON.stringify(data.result ?? {}, null, 2));
    });
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message}`);
  }
}
