import { expect, test } from "@playwright/test";
import { getEditorText, waitForEditorReady } from "./helpers/editor";
import { getPersistedDocMeta, waitForPersistedDoc } from "./helpers/persistence";

test.describe("Document Persistence", () => {
  let docId = "";
  let demoUrl = "";

  test.beforeEach(async ({ page }, testInfo) => {
    const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    docId = `persist-${Date.now()}-${safeTitle}`;
    demoUrl = `/editor?doc=${docId}`;
    await page.goto(demoUrl);
    await waitForEditorReady(page, { timeout: 10000 });
  });

  test("Document content persists across reload", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    await waitForPersistedDoc(page, docId, 0, 2000, 0).catch(() => undefined);
    const baselineMeta = await getPersistedDocMeta(page, docId);
    const baselineUpdatedAt = baselineMeta?.updatedAt ?? 0;
    const baselineSnapshotLength = baselineMeta?.snapshotLength ?? 0;
    await editor.click();
    const testContent = `Persistence test ${Date.now()}`;
    await editor.type(testContent);
    await expect(page.locator(`text=${testContent}`)).toBeVisible({ timeout: 5000 });

    await waitForPersistedDoc(page, docId, baselineUpdatedAt, 15000, baselineSnapshotLength);

    await page.reload();
    await waitForEditorReady(page, { timeout: 15000 });

    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect
      .poll(async () => (await getEditorText(page)).includes(testContent), { timeout: 15000 })
      .toBe(true);
  });
});
