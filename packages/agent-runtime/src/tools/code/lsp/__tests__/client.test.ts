import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createLSPClient } from "../client";
import { LANGUAGE_SERVERS } from "../servers";

const fixturesRoot = fileURLToPath(new URL("./fixtures/sample-ts-project", import.meta.url));
const entryFile = path.join(fixturesRoot, "src", "index.ts");

const tsServer = LANGUAGE_SERVERS.find((server) => server.id === "typescript");
const runTest = tsServer && isCommandAvailable(tsServer.command) ? it : it.skip;

describe("LSPClient (TypeScript)", () => {
  runTest(
    "should initialize and get document symbols",
    async () => {
      if (!tsServer) {
        return;
      }

      const client = await createLSPClient({
        command: tsServer.command,
        args: tsServer.args,
        cwd: fixturesRoot,
        timeout: 60_000,
      });

      try {
        await client.initialize(fixturesRoot);
        await client.waitForReady();
        await client.openFile(entryFile);

        const symbols = await client.getDocumentSymbols(entryFile);
        expect(symbols.length).toBeGreaterThan(0);
      } finally {
        await client.shutdown();
      }
    },
    60_000
  );
});

function isCommandAvailable(command: string): boolean {
  const hasPathSeparator =
    command.includes(path.sep) || command.includes("/") || command.includes("\\");
  if (hasPathSeparator || path.isAbsolute(command)) {
    return fs.existsSync(command);
  }

  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { stdio: "ignore" });
  return result.status === 0;
}
