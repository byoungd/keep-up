import type { LspSymbol } from "@ku0/tool-lsp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SymbolGraph } from "../symbolGraph";

describe("SymbolGraph", () => {
  let previousNativeSetting: string | undefined;

  const makeSymbol = (name: string, kind: string, file: string, line = 1): LspSymbol => ({
    name,
    kind,
    file,
    line,
    column: 1,
    endLine: line,
    endColumn: 10,
  });

  beforeEach(() => {
    previousNativeSetting = process.env.KU0_SYMBOL_INDEX_DISABLE_NATIVE;
    process.env.KU0_SYMBOL_INDEX_DISABLE_NATIVE = "1";
  });

  afterEach(() => {
    if (previousNativeSetting === undefined) {
      delete process.env.KU0_SYMBOL_INDEX_DISABLE_NATIVE;
    } else {
      process.env.KU0_SYMBOL_INDEX_DISABLE_NATIVE = previousNativeSetting;
    }
  });

  it("indexes symbols by file and supports queries", () => {
    const graph = new SymbolGraph();
    const symbols: LspSymbol[] = [
      {
        name: "AuthService",
        kind: "Class",
        file: "/repo/src/auth.ts",
        line: 1,
        column: 1,
        endLine: 10,
        endColumn: 1,
        detail: "class AuthService",
        children: [
          {
            name: "login",
            kind: "Method",
            file: "/repo/src/auth.ts",
            line: 3,
            column: 3,
            endLine: 3,
            endColumn: 20,
          },
        ],
      },
    ];

    graph.updateFileSymbols("/repo/src/auth.ts", symbols);

    const results = graph.query("auth login", { limit: 5 });
    const names = results.map((result) => result.symbol.name);
    expect(names).toContain("AuthService");
    expect(names).toContain("login");
  });

  it("removes symbols for deleted files", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/users.ts", [
      {
        name: "User",
        kind: "Interface",
        file: "/repo/src/users.ts",
        line: 1,
        column: 1,
        endLine: 5,
        endColumn: 1,
      },
    ]);

    graph.removeFile("/repo/src/users.ts");
    const results = graph.query("user");
    expect(results).toHaveLength(0);
  });

  it("reports added and removed counts for updates", () => {
    const graph = new SymbolGraph();
    const result = graph.updateFileSymbols("/repo/src/a.ts", [
      makeSymbol("Alpha", "Class", "/repo/src/a.ts", 1),
      makeSymbol("Beta", "Function", "/repo/src/a.ts", 5),
    ]);

    expect(result).toEqual({ added: 2, removed: 0 });
  });

  it("replaces symbols when the same file is updated", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/a.ts", [makeSymbol("Alpha", "Class", "/repo/src/a.ts", 1)]);
    graph.updateFileSymbols("/repo/src/a.ts", [makeSymbol("Gamma", "Class", "/repo/src/a.ts", 1)]);

    expect(graph.query("alpha")).toHaveLength(0);
    const results = graph.query("gamma");
    expect(results.map((result) => result.symbol.name)).toContain("Gamma");
  });

  it("returns symbol and file counts in stats", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/a.ts", [
      makeSymbol("Alpha", "Class", "/repo/src/a.ts", 1),
      makeSymbol("Beta", "Function", "/repo/src/a.ts", 5),
    ]);
    graph.updateFileSymbols("/repo/src/b.ts", [makeSymbol("Gamma", "Class", "/repo/src/b.ts", 1)]);

    expect(graph.getStats()).toEqual({ symbolCount: 3, fileCount: 2 });
  });

  it("updates stats when files are removed", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/a.ts", [makeSymbol("Alpha", "Class", "/repo/src/a.ts", 1)]);
    graph.updateFileSymbols("/repo/src/b.ts", [makeSymbol("Beta", "Class", "/repo/src/b.ts", 1)]);
    graph.removeFile("/repo/src/a.ts");

    expect(graph.getStats()).toEqual({ symbolCount: 1, fileCount: 1 });
  });

  it("filters query results by kind", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/a.ts", [
      makeSymbol("Service", "Class", "/repo/src/a.ts", 1),
      makeSymbol("Service", "Function", "/repo/src/a.ts", 10),
    ]);

    const results = graph.query("service", { kinds: ["Class"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.symbol.kind).toBe("Class");
  });

  it("respects query limits", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/a.ts", [
      makeSymbol("Alpha", "Class", "/repo/src/a.ts", 1),
      makeSymbol("AlphaTwo", "Class", "/repo/src/a.ts", 2),
      makeSymbol("AlphaThree", "Class", "/repo/src/a.ts", 3),
    ]);

    const results = graph.query("alpha", { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("returns empty results for blank queries", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/a.ts", [makeSymbol("Alpha", "Class", "/repo/src/a.ts", 1)]);

    expect(graph.query("   ")).toHaveLength(0);
  });

  it("ignores removeFile calls for unknown files", () => {
    const graph = new SymbolGraph();
    graph.updateFileSymbols("/repo/src/a.ts", [makeSymbol("Alpha", "Class", "/repo/src/a.ts", 1)]);
    graph.removeFile("/repo/src/missing.ts");

    expect(graph.getStats()).toEqual({ symbolCount: 1, fileCount: 1 });
  });
});
