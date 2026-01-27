import { EventEmitter } from "node:events";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import type { LspClient } from "../client";
import { LspToolServer } from "../tools/lspToolServer";
import type { LspDiagnostic } from "../types";

class MockLspClient extends EventEmitter {
  private ready = false;

  async start(): Promise<void> {
    this.ready = true;
  }

  async stop(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async openDocument(filePath: string): Promise<void> {
    const diagnostics: LspDiagnostic[] = [
      {
        file: filePath,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        severity: "warning",
        message: "Mock diagnostic",
      },
    ];

    setTimeout(() => {
      this.emit("diagnostics", filePath, diagnostics);
    }, 10);
  }
}

describe("LspToolServer diagnostics", () => {
  it("returns formatted diagnostics when emitted", async () => {
    const filePath = resolvePath("/tmp/example.ts");
    const client = new MockLspClient() as unknown as LspClient;
    const server = new LspToolServer(async () => client);

    const result = await server.callTool(
      { name: "lsp_diagnostics", arguments: { file: filePath } },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.content[0]?.text).toContain("Found 1 diagnostic(s)");
    expect(result.content[0]?.text).toContain("Mock diagnostic");
  });
});
