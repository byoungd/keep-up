/**
 * TypeScript LSP Provider
 *
 * Configuration for typescript-language-server integration.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { LspProvider } from "../types";

/**
 * Create a TypeScript LSP provider
 */
export function createTypeScriptProvider(): LspProvider {
  const tsserverPath = resolveTypeScriptServerPath();
  const initOptions: Record<string, unknown> = {
    preferences: {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
    },
  };

  if (tsserverPath) {
    initOptions.tsserver = {
      path: tsserverPath,
      fallbackPath: tsserverPath,
    };
  }

  return {
    id: "typescript",
    name: "TypeScript Language Server",
    extensions: ["ts", "tsx", "js", "jsx"] as const,
    command: resolveLanguageServerCommand("typescript-language-server"),
    args: ["--stdio"],
    capabilities: {
      references: true,
      rename: true,
      documentSymbol: true,
      diagnostics: true,
      hover: true,
      definition: true,
      completion: true,
    },
    initOptions,
  };
}

function resolveLanguageServerCommand(command: string): string {
  if (
    command.includes(path.sep) ||
    command.includes("/") ||
    command.includes("\\") ||
    path.isAbsolute(command)
  ) {
    return command;
  }

  const resolved =
    resolveLocalBinary(command, process.cwd()) ??
    resolveLocalBinary(command, path.dirname(fileURLToPath(import.meta.url)));

  return resolved ?? command;
}

function resolveLocalBinary(command: string, startPath: string): string | null {
  const candidates =
    process.platform === "win32"
      ? [`${command}.cmd`, `${command}.exe`, `${command}.bat`]
      : [command];
  let current = path.resolve(startPath);

  while (true) {
    for (const candidate of candidates) {
      const binPath = path.join(current, "node_modules", ".bin", candidate);
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveTypeScriptServerPath(): string | null {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("typescript/lib/tsserver.js");
  } catch {
    return null;
  }
}
