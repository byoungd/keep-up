import { type Page, expect, test } from "@playwright/test";
import {
  assertDocumentContains,
  getEditorText,
  getPointForSubstring,
  openFreshEditor,
  selectTextBySubstring,
  setEditorContent,
  typeInEditor,
  waitForEditorReady,
} from "./helpers/editor";

const RUN_MULTI_REPLICA = process.env.UI_GATE_MULTI_REPLICA === "1";
const WORKER_INDEX = process.env.PLAYWRIGHT_WORKER_INDEX ?? Math.random().toString(36).slice(2, 5);

function buildDbName(peerId: string): string {
  return `reader-db-worker-${WORKER_INDEX}-${peerId.toLowerCase()}`;
}

function buildEditorUrl(docId: string, peerId: string): string {
  const params = new URLSearchParams({
    doc: docId,
    peer: peerId,
    db: buildDbName(peerId),
    seed: "0",
    syncMode: "websocket",
  });
  return `/editor?${params.toString()}`;
}

async function waitForOnline(page: Page): Promise<boolean> {
  const status = page.locator("[data-testid='connection-status']");
  try {
    await expect(status).toContainText(/Online|Connected/, { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForOffline(page: Page): Promise<void> {
  const status = page.locator("[data-testid='connection-status']");
  await expect(status).toContainText(/Offline|Reconnecting|Connecting/, { timeout: 10_000 });
}

async function setOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}

async function setOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

async function forceCommit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globalAny = window as unknown as { __lfccForceCommit?: () => void };
    globalAny.__lfccForceCommit?.();
  });
}

test.describe("Living Briefs Collaboration", () => {
  test.skip(!RUN_MULTI_REPLICA, "Requires multi-replica sync setup (UI_GATE_MULTI_REPLICA=1)");

  test("offline edits sync after reconnect", async ({ browser }) => {
    const docId = `brief-offline-${Date.now()}`;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await pageA.goto(buildEditorUrl(docId, "A"));
      await pageB.goto(buildEditorUrl(docId, "B"));

      await waitForEditorReady(pageA);
      await waitForEditorReady(pageB);

      const onlineA = await waitForOnline(pageA);
      const onlineB = await waitForOnline(pageB);
      if (!onlineA || !onlineB) {
        test.skip(true, "Websocket sync unavailable");
        return;
      }

      await setEditorContent(pageA, "Living Brief Alpha\nInitial paragraph.");
      await assertDocumentContains(pageB, "Living Brief Alpha", { timeout: 10_000 });

      await setOffline(pageA);
      await waitForOffline(pageA);

      await typeInEditor(pageA, "\nOffline update from author A.");
      await assertDocumentContains(pageA, "Offline update from author A.");
      await forceCommit(pageA);

      await setOnline(pageA);
      await expect(pageA.locator("[data-testid='connection-status']")).toContainText(
        /Online|Connected/,
        { timeout: 20_000 }
      );

      await expect
        .poll(async () => (await getEditorText(pageB)).includes("Offline update from author A."), {
          timeout: 30_000,
        })
        .toBe(true);
    } finally {
      await pageA.close();
      await pageB.close();
      await contextA.close();
      await contextB.close();
    }
  });

  test("concurrent edits merge without data loss", async ({ browser }) => {
    const docId = `brief-concurrent-${Date.now()}`;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await pageA.goto(buildEditorUrl(docId, "A"));
      await pageB.goto(buildEditorUrl(docId, "B"));

      await waitForEditorReady(pageA);
      await waitForEditorReady(pageB);

      const onlineA = await waitForOnline(pageA);
      const onlineB = await waitForOnline(pageB);
      if (!onlineA || !onlineB) {
        test.skip(true, "Websocket sync unavailable");
        return;
      }

      await setEditorContent(pageA, "Paragraph One\nParagraph Two");
      await assertDocumentContains(pageB, "Paragraph Two", { timeout: 10_000 });

      const pointA = await getPointForSubstring(pageA, "Paragraph One", { preferEnd: true });
      const pointB = await getPointForSubstring(pageB, "Paragraph Two", { preferEnd: true });
      if (!pointA || !pointB) {
        throw new Error("Failed to locate paragraph text for editing");
      }

      await pageA.mouse.click(pointA.x, pointA.y);
      await pageA.keyboard.press("End");
      await typeInEditor(pageA, " [A edit]");

      await pageB.mouse.click(pointB.x, pointB.y);
      await pageB.keyboard.press("End");
      await typeInEditor(pageB, " [B edit]");

      await assertDocumentContains(pageA, "[A edit]", { timeout: 15_000 });
      await assertDocumentContains(pageA, "[B edit]", { timeout: 15_000 });
      await assertDocumentContains(pageB, "[A edit]", { timeout: 15_000 });
      await assertDocumentContains(pageB, "[B edit]", { timeout: 15_000 });
    } finally {
      await pageA.close();
      await pageB.close();
      await contextA.close();
      await contextB.close();
    }
  });
});

test.describe("Living Brief Suggestion Preview", () => {
  test("agent preview shows a suggestion without overwriting content", async ({ page }) => {
    await openFreshEditor(page, "brief-suggestion-preview");
    await waitForEditorReady(page);

    await typeInEditor(page, "Living Brief content to refactor.");
    const originalText = await getEditorText(page);

    await selectTextBySubstring(page, "Living Brief");

    const structButton = page.getByRole("button", { name: "Struct Demo" });
    await expect(structButton).toBeVisible({ timeout: 5_000 });
    await structButton.click();

    await expect(page.getByText("Structural Refactoring Preview")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Apply Refactor" })).toBeVisible();

    const currentText = await getEditorText(page);
    expect(currentText).toBe(originalText);
  });
});
