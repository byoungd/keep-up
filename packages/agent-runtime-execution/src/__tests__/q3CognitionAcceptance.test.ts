import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { SECURITY_PRESETS, type ToolContext } from "@ku0/agent-runtime-core";
import {
  CodeInteractionServer,
  detectLanguageServerForPath,
  isServerAvailable,
} from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";

import { LspService } from "../lsp";

const fixtureRoot = fileURLToPath(new URL("./fixtures/ts-lsp-project", import.meta.url));

const sampleFile = path.join(fixtureRoot, "src", "index.ts");
const detected = detectLanguageServerForPath(sampleFile);
const lspConfig = detected?.config;
const lspAvailable = lspConfig ? await isServerAvailable(lspConfig) : false;
const lspTest = lspAvailable ? it : it.skip;

async function createTempProject(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "ku0-q3-lsp-"));
  const root = path.join(tempDir, "project");
  await cp(fixtureRoot, root, { recursive: true });
  return {
    root,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

function findSymbolPosition(
  content: string,
  symbol: string,
  startIndex = 0
): { line: number; character: number } {
  const safeStart = startIndex < 0 ? 0 : startIndex;
  const index = content.indexOf(symbol, safeStart);
  if (index < 0) {
    throw new Error(`Symbol not found: ${symbol}`);
  }

  const before = content.slice(0, index);
  const lines = before.split("\n");
  const line = lines.length;
  const character = lines[lines.length - 1].length + 1;

  return { line, character };
}

function extractText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const text = result.content?.find((item) => item.type === "text")?.text;
  return text ?? "";
}

describe("Q3 Track X Acceptance", () => {
  lspTest(
    "X-AC-1 symbol resolution navigates to AuthService definition",
    async () => {
      const project = await createTempProject();
      const consumerPath = path.join(project.root, "src", "consumer.ts");
      const indexPath = path.join(project.root, "src", "index.ts");
      const content = await readFile(consumerPath, "utf8");
      const usageIndex = content.indexOf("new AuthService");
      const position = findSymbolPosition(content, "AuthService", usageIndex);

      const server = new CodeInteractionServer();
      const context: ToolContext = { security: SECURITY_PRESETS.developer };

      try {
        const result = await server.callTool(
          {
            name: "nav_def",
            arguments: {
              path: consumerPath,
              line: position.line,
              character: position.character,
            },
          },
          context
        );

        expect(result.success).toBe(true);
        const text = extractText(result);
        expect(text).toContain(indexPath);
      } finally {
        await server.dispose();
        await project.cleanup();
      }
    },
    60_000
  );

  lspTest(
    "X-AC-2 reference search returns multiple call sites",
    async () => {
      const project = await createTempProject();
      const indexPath = path.join(project.root, "src", "index.ts");
      const content = await readFile(indexPath, "utf8");
      const position = findSymbolPosition(content, "greet");

      const server = new CodeInteractionServer();
      const context: ToolContext = { security: SECURITY_PRESETS.developer };

      try {
        const result = await server.callTool(
          {
            name: "nav_refs",
            arguments: {
              path: indexPath,
              line: position.line,
              character: position.character,
            },
          },
          context
        );

        expect(result.success).toBe(true);
        const text = extractText(result);
        const references = text.split("\n").filter((line) => line.trim().startsWith("- "));
        expect(references.length).toBeGreaterThanOrEqual(3);
      } finally {
        await server.dispose();
        await project.cleanup();
      }
    },
    60_000
  );

  lspTest(
    "X-AC-3 safe rename updates dependent files",
    async () => {
      const project = await createTempProject();
      const indexPath = path.join(project.root, "src", "index.ts");
      const consumerPath = path.join(project.root, "src", "consumer.ts");
      const consumer2Path = path.join(project.root, "src", "consumer2.ts");
      const content = await readFile(indexPath, "utf8");
      const position = findSymbolPosition(content, "greet");

      const server = new CodeInteractionServer();
      const context: ToolContext = { security: SECURITY_PRESETS.developer };

      try {
        const result = await server.callTool(
          {
            name: "rename_sym",
            arguments: {
              path: indexPath,
              line: position.line,
              character: position.character,
              new_name: "welcome",
              apply: true,
            },
          },
          context
        );

        expect(result.success).toBe(true);

        const [updatedIndex, updatedConsumer, updatedConsumer2] = await Promise.all([
          readFile(indexPath, "utf8"),
          readFile(consumerPath, "utf8"),
          readFile(consumer2Path, "utf8"),
        ]);

        expect(updatedIndex).toContain("function welcome");
        expect(updatedConsumer).toContain("welcome(");
        expect(updatedConsumer2).toContain("welcome(");
      } finally {
        await server.dispose();
        await project.cleanup();
      }
    },
    60_000
  );

  it("X-AC-4 impact analysis lists dependent files", async () => {
    const project = await createTempProject();
    const root = project.root;
    const indexPath = path.join(root, "src", "index.ts");
    const consumerPath = path.join(root, "src", "consumer.ts");
    const consumer2Path = path.join(root, "src", "consumer2.ts");

    const service = new LspService({ rootPath: root, watch: false });

    try {
      await service.indexProject();
      const dependents = service.getKnowledgeGraph().getDependents(indexPath);
      expect(dependents).toContain(path.resolve(consumerPath));
      expect(dependents).toContain(path.resolve(consumer2Path));
    } finally {
      await service.stop();
      await project.cleanup();
    }
  }, 60_000);
});
