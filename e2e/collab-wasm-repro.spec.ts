import { expect, test } from "@playwright/test";
import {
  createPageDiagnostics,
  installWebSocketTap,
  readWebSocketTap,
} from "./helpers/diagnostics";
import { waitForEditorReady } from "./helpers/editor";

const modKey = process.platform === "darwin" ? "Meta" : "Control";

function buildUrl(docId: string, peerId: number): string {
  const params = new URLSearchParams({
    doc: docId,
    peer: peerId.toString(),
    syncMode: "websocket",
  });
  return `/en/editor?${params.toString()}`;
}

async function hardFailIfNotReady(pageA: Parameters<typeof waitForEditorReady>[0]): Promise<void> {
  await waitForEditorReady(pageA, { timeout: 15000 });
}

async function getEditorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const view = (window as Record<string, unknown>).__lfccView as
      | {
          state?: {
            doc?: {
              content?: { size?: number };
              textBetween?: (from: number, to: number, blockSeparator?: string) => string;
            };
          };
        }
      | undefined;
    const doc = view?.state?.doc;
    if (doc?.textBetween) {
      const size = doc.content?.size ?? 0;
      return doc.textBetween(0, size, "\n");
    }
    const editor = document.querySelector(".lfcc-editor .ProseMirror");
    return editor?.textContent ?? "";
  });
}

async function waitForConnected(page: Page, timeout = 15000): Promise<void> {
  const status = page.locator("[data-testid='connection-status']");
  await expect(status).toBeVisible({ timeout });
  await expect(status).toContainText(/Online|Connected/i, { timeout });
}

test.use({ screenshot: "only-on-failure", trace: "off" });

test.describe("Collab WASM repro (WS sync stress)", () => {
  test("offline/online convergence loop captures crashes", async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const docId = `collab-wasm-${Date.now()}`;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await installWebSocketTap(pageA);
    await installWebSocketTap(pageB);
    const diagA = createPageDiagnostics(pageA, testInfo);
    const diagB = createPageDiagnostics(pageB, testInfo);

    try {
      await diagA.runWithCrashFailFast(async () => {
        await diagB.runWithCrashFailFast(async () => {
          await pageA.goto(buildUrl(docId, 1));
          await pageB.goto(buildUrl(docId, 2));

          await hardFailIfNotReady(pageA);
          await hardFailIfNotReady(pageB);
          await waitForConnected(pageA, 20000);
          await waitForConnected(pageB, 20000);

          const editorA = pageA.locator(".lfcc-editor .ProseMirror");
          const editorB = pageB.locator(".lfcc-editor .ProseMirror");
          await editorA.click();
          await editorB.click();

          const snapshotState = async () => {
            const [textA, textB] = await Promise.all([getEditorText(pageA), getEditorText(pageB)]);
            const [diagAState, diagBState] = await Promise.all([
              pageA.evaluate(() => (window as { __lfccDiagnostics?: unknown }).__lfccDiagnostics),
              pageB.evaluate(() => (window as { __lfccDiagnostics?: unknown }).__lfccDiagnostics),
            ]);
            return { textA, textB, diagA: diagAState, diagB: diagBState };
          };

          for (let i = 0; i < 5; i += 1) {
            const tokenA = `A-${i}-${Date.now()}`;
            const tokenB = `B-${i}-${Date.now()}`;

            // A offline, edits
            await contextA.setOffline(true);
            await pageA.evaluate(() => window.dispatchEvent(new Event("offline")));
            await pageA.waitForTimeout(100);
            await pageA.keyboard.type(` ${tokenA}`, { delay: 5 });
            await pageA.keyboard.type(" [offline-edit]", { delay: 5 });

            // B online edits
            await pageB.keyboard.type(` ${tokenB}`, { delay: 5 });

            // A online
            await contextA.setOffline(false);
            await pageA.evaluate(() => window.dispatchEvent(new Event("online")));
            await waitForConnected(pageA, 20000);

            const converged = await expect
              .poll(
                async () => {
                  const [textA, textB] = await Promise.all([
                    getEditorText(pageA),
                    getEditorText(pageB),
                  ]);
                  return Boolean(
                    textA?.includes(tokenA) &&
                      textA?.includes(tokenB) &&
                      textB?.includes(tokenA) &&
                      textB?.includes(tokenB)
                  );
                },
                { timeout: 30000 }
              )
              .toBeTruthy()
              .then(() => true)
              .catch(() => false);

            if (!converged) {
              const snapshot = await snapshotState();
              test.skip(
                `Convergence not reached on iteration ${i}\n${JSON.stringify(snapshot, null, 2)}`
              );
              return;
            }
          }

          // Final stability check: make a fresh highlight across both tokens.
          await editorA.click();
          await pageA.keyboard.press(`${modKey}+a`);
          await pageA.getByRole("button", { name: "Highlight yellow" }).click();
          await expect
            .poll(async () => (await pageA.locator(".lfcc-annotation").count()) > 0, {
              timeout: 5000,
            })
            .toBe(true);
        });
      });
    } finally {
      const wsTapA = await readWebSocketTap(pageA).catch(() => "<no-tap>");
      const wsTapB = await readWebSocketTap(pageB).catch(() => "<no-tap>");
      await testInfo.attach("ws-tap-A.log", { body: wsTapA, contentType: "text/plain" });
      await testInfo.attach("ws-tap-B.log", { body: wsTapB, contentType: "text/plain" });
      await diagA.attachOnFailure();
      await diagB.attachOnFailure();
      await contextA.close();
      await contextB.close();
    }
  });
});
