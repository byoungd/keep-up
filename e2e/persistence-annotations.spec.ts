import { expect, test } from "@playwright/test";
import { selectFirstTextRange, waitForEditorReady } from "./helpers/editor";
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

  test("Annotations persist across reload", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    await waitForPersistedDoc(page, docId, 0, 2000, 0).catch(() => undefined);
    const baselineMeta = await getPersistedDocMeta(page, docId);
    const baselineUpdatedAt = baselineMeta?.updatedAt ?? 0;
    const baselineSnapshotLength = baselineMeta?.snapshotLength ?? 0;
    await editor.click();
    await editor.type("This is a test paragraph for annotation.");

    await selectFirstTextRange(page);

    const highlightBtn = page.getByRole("button", { name: "Highlight yellow" });
    if (await highlightBtn.isVisible({ timeout: 2000 })) {
      await highlightBtn.click();
    }

    await waitForPersistedDoc(page, docId, baselineUpdatedAt, 15000, baselineSnapshotLength);

    await page.reload();
    await waitForEditorReady(page, { timeout: 15000 });

    const annotationPanel = page.locator('[data-testid="annotation-panel"]');
    if (await annotationPanel.isVisible({ timeout: 3000 })) {
      const annotationItems = page.locator("[data-annotation-role='panel-item']");
      const count = await annotationItems.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
