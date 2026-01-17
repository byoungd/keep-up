/**
 * TypeScript LSP Provider
 *
 * Configuration for typescript-language-server integration.
 */

import type { LspProvider } from "../types";

/**
 * Create a TypeScript LSP provider
 */
export function createTypeScriptProvider(): LspProvider {
  return {
    id: "typescript",
    name: "TypeScript Language Server",
    extensions: ["ts", "tsx", "js", "jsx"] as const,
    command: "typescript-language-server",
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
    initOptions: {
      preferences: {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
      },
    },
  };
}
