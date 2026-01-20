import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CodeInteractionServer } from "@ku0/agent-runtime-tools";
import { afterEach, describe, expect, it } from "vitest";
import { createFileContextTracker, type FileContextTracker } from "../context";
import { createSecurityPolicy } from "../security";
import type { ToolContext } from "../types";

const DEFAULT_TIMEOUT_MS = 2000;

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = 50
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

describe("CodeInteractionServer stale context checks", () => {
  let workspace = "";
  let tracker: FileContextTracker | undefined;

  afterEach(async () => {
    if (tracker) {
      await tracker.dispose();
      tracker = undefined;
    }
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
      workspace = "";
    }
  });

  it("blocks edits when file context is stale", async () => {
    workspace = await mkdtemp(join(tmpdir(), "ku0-stale-"));
    const filePath = join(workspace, "alpha.txt");
    await writeFile(filePath, "one", "utf-8");

    tracker = createFileContextTracker({
      workspacePath: workspace,
      awaitWriteFinishMs: 10,
      recentWriteWindowMs: 0,
    });
    const handle = tracker.getHandle("ctx-1");

    const server = new CodeInteractionServer();
    const security = createSecurityPolicy("power");
    const context: ToolContext = { security, fileContext: handle };

    const readResult = await server.callTool(
      { name: "read_file", arguments: { path: filePath } },
      context
    );
    expect(readResult.success).toBe(true);

    await writeFile(filePath, "two", "utf-8");
    await waitForCondition(() => handle.isStale(filePath));

    const editResult = await server.callTool(
      {
        name: "edit_file",
        arguments: {
          path: filePath,
          edits: [{ start_line: 1, end_line: 1, replacement: "two" }],
        },
      },
      context
    );

    expect(editResult.success).toBe(false);
    expect(editResult.error?.code).toBe("CONFLICT");
  });
});
