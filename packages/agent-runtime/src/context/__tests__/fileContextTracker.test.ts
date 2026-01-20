import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBus } from "@ku0/agent-runtime-control";
import { afterEach, describe, expect, it } from "vitest";
import { createFileContextTracker, type FileContextTracker } from "../fileContextTracker";

const DEFAULT_TIMEOUT_MS = 2000;

function createSilentLogger() {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

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

describe("FileContextTracker", () => {
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

  it.skip(
    "marks files stale on external edits and emits an event",
    { timeout: 10000 },
    async () => {
      const tmp = await mkdtemp(join(tmpdir(), "ku0-context-"));
      workspace = await realpath(tmp);
      const eventBus = createEventBus();
      tracker = createFileContextTracker({
        workspacePath: workspace,
        eventBus,
        awaitWriteFinishMs: 10,
        recentWriteWindowMs: 0,
        usePolling: true,
        logger: createSilentLogger(),
      });

      // Wait for watcher to be ready before making file changes
      await tracker.waitForReady();

      const filePath = join(workspace, "alpha.txt");
      await writeFile(filePath, "one", "utf-8");

      const handle = tracker.getHandle("ctx-1");
      handle.markRead(filePath);

      const events: Array<{ payload: unknown }> = [];
      eventBus.subscribe("context:file-stale", (event) => events.push(event));

      await writeFile(filePath, "two", "utf-8");

      await waitForCondition(() => handle.isStale(filePath), 5000);

      expect(handle.isStale(filePath)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
      const payload = events[0]?.payload as { path?: string };
      expect(payload?.path).toBe("alpha.txt");
    }
  );
});
