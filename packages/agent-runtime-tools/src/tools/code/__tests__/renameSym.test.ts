import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_PRESETS, type ToolContext } from "@ku0/agent-runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import { CodeInteractionServer } from "../codeServer";
import { LANGUAGE_SERVERS, resolveLanguageServerCommand } from "../lsp/servers";

const fixturesRoot = fileURLToPath(new URL("./fixtures/rename-ts-project", import.meta.url));

const tsServer = LANGUAGE_SERVERS.find((server) => server.id === "typescript");
const tsCommand = tsServer ? resolveLanguageServerCommand(tsServer, process.cwd()) : null;
const runTest = tsCommand ? (isCommandAvailable(tsCommand) ? it : it.skip) : it.skip;

describe("rename_sym", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  runTest(
    "renames a symbol across multiple files",
    async () => {
      tempDir = await fs.mkdtemp(path.join(tmpdir(), "rename-sym-"));
      const projectRoot = path.join(tempDir, "project");
      await fs.cp(fixturesRoot, projectRoot, { recursive: true });

      const indexFile = path.join(projectRoot, "src", "index.ts");
      const consumerFile = path.join(projectRoot, "src", "consumer.ts");
      const content = await fs.readFile(indexFile, "utf8");
      const position = findSymbolPosition(content, "greet");

      const server = new CodeInteractionServer();
      const context: ToolContext = {
        security: SECURITY_PRESETS.developer,
      };
      try {
        const result = await server.callTool(
          {
            name: "rename_sym",
            arguments: {
              path: indexFile,
              line: position.line,
              character: position.character,
              new_name: "welcome",
              apply: true,
            },
          },
          context
        );

        expect(result.success).toBe(true);

        const updatedIndex = await fs.readFile(indexFile, "utf8");
        const updatedConsumer = await fs.readFile(consumerFile, "utf8");

        expect(updatedIndex).toContain("function welcome");
        expect(updatedIndex).toContain("message = welcome");
        expect(updatedConsumer).toContain("welcome");
      } finally {
        await server.dispose();
      }
    },
    60_000
  );
});

function findSymbolPosition(content: string, symbol: string): { line: number; character: number } {
  const index = content.indexOf(symbol);
  if (index < 0) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  const before = content.slice(0, index);
  const lines = before.split("\n");
  const line = lines.length;
  const character = lines[lines.length - 1].length + 1;

  return { line, character };
}

function isCommandAvailable(command: string): boolean {
  const hasPathSeparator =
    command.includes(path.sep) || command.includes("/") || command.includes("\\");
  if (hasPathSeparator || path.isAbsolute(command)) {
    return existsSync(command);
  }

  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { stdio: "ignore" });
  return result.status === 0;
}
