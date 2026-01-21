import { existsSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { AccessibilityNodeRef, AccessibilitySnapshot } from "@ku0/agent-runtime-tools";
import { BrowserManager, BrowserToolServer } from "@ku0/agent-runtime-tools";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "../types";

const executablePath = chromium.executablePath();
const hasChromium = Boolean(executablePath && existsSync(executablePath));
const describeIf = hasChromium ? describe : describe.skip;
const CLEANUP_TIMEOUT_MS = 60_000;

function createContext(sessionId = "session-browser-e2e"): ToolContext {
  return {
    sessionId,
    security: {
      sandbox: {
        type: "process",
        networkAccess: "full",
        fsIsolation: "workspace",
      },
      permissions: {
        bash: "sandbox",
        file: "workspace",
        code: "sandbox",
        computer: "disabled",
        network: "full",
        lfcc: "read",
      },
      limits: {
        maxExecutionTimeMs: 30_000,
        maxMemoryBytes: 256 * 1024 * 1024,
        maxOutputBytes: 1024 * 1024,
        maxConcurrentCalls: 3,
      },
    },
  };
}

function findRef(
  snapshot: AccessibilitySnapshot,
  role: string,
  name: string
): AccessibilityNodeRef | undefined {
  return Object.values(snapshot.map).find((node) => node.role === role && node.name === name);
}

describeIf("BrowserToolServer (e2e)", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let baseUrl = "";
  let manager: BrowserManager;
  let toolServer: BrowserToolServer;

  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  beforeAll(async () => {
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Browser Tool Fixture</title>
  </head>
  <body>
    <label for="name">Name</label>
    <input id="name" aria-label="Name" />
    <button id="submit" onclick="document.getElementById('status').textContent='clicked'">
      Submit
    </button>
    <div id="status">idle</div>
  </body>
</html>`;

    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });

    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/`;

    manager = new BrowserManager({ headless: true });
    toolServer = new BrowserToolServer({ manager });
  });

  afterAll(async () => {
    if (manager) {
      await withTimeout(manager.dispose(), CLEANUP_TIMEOUT_MS, "BrowserManager cleanup");
    }
    if (server) {
      await withTimeout(
        new Promise<void>((resolve) => server?.close(() => resolve())),
        CLEANUP_TIMEOUT_MS,
        "Fixture server close"
      );
    }
  }, CLEANUP_TIMEOUT_MS);

  it("navigates, snapshots, and interacts using accessibility refs", async () => {
    const context = createContext();

    const navigateResult = await toolServer.callTool(
      { name: "navigate", arguments: { url: baseUrl, sessionId: context.sessionId } },
      context
    );
    expect(navigateResult.success).toBe(true);

    const snapshotResult = await toolServer.callTool(
      { name: "snapshot", arguments: { sessionId: context.sessionId, interestingOnly: false } },
      context
    );
    if (!snapshotResult.success) {
      throw new Error(snapshotResult.error?.message ?? "Snapshot failed");
    }

    const snapshotContent = snapshotResult.content[0];
    expect(snapshotContent?.type).toBe("text");
    const snapshot = JSON.parse(snapshotContent?.text ?? "{}") as AccessibilitySnapshot;

    const inputRef = findRef(snapshot, "textbox", "Name");
    const buttonRef = findRef(snapshot, "button", "Submit");

    expect(inputRef?.ref).toBeDefined();
    expect(buttonRef?.ref).toBeDefined();

    const typeResult = await toolServer.callTool(
      {
        name: "interact",
        arguments: {
          sessionId: context.sessionId,
          action: "type",
          ref: inputRef?.ref,
          text: "Ada",
        },
      },
      context
    );
    expect(typeResult.success).toBe(true);

    const clickResult = await toolServer.callTool(
      {
        name: "interact",
        arguments: { sessionId: context.sessionId, action: "click", ref: buttonRef?.ref },
      },
      context
    );
    expect(clickResult.success).toBe(true);

    const page = await manager.getPage(context.sessionId ?? "default");
    const value = await page.inputValue("#name");
    expect(value).toBe("Ada");
    const status = await page.textContent("#status");
    expect(status).toBe("clicked");

    const screenshotResult = await toolServer.callTool(
      { name: "screenshot", arguments: { sessionId: context.sessionId } },
      context
    );
    expect(screenshotResult.success).toBe(true);
    const screenshot = screenshotResult.content[0];
    expect(screenshot?.type).toBe("image");
    expect(screenshot?.data?.length).toBeGreaterThan(0);

    const closeResult = await toolServer.callTool(
      { name: "close", arguments: { sessionId: context.sessionId } },
      context
    );
    expect(closeResult.success).toBe(true);
  });
});
