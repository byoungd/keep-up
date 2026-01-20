import type { LspSymbol } from "@ku0/tool-lsp";
import { describe, expect, it } from "vitest";

import { SymbolGraph } from "../symbolGraph";

describe("SymbolGraph", () => {
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
});
