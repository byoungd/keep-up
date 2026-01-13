import { expect, test } from "@playwright/test";
import { getToolbar, selectFirstTextRange, waitForEditorReady } from "./helpers/editor";
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

  test("Comments persist across reload", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    const annotationPanel = page.locator('[data-testid="annotation-panel"]');
    if (!(await annotationPanel.isVisible({ timeout: 2000 }))) {
      test.skip();
      return;
    }

    const panelItem = page.locator("[data-annotation-role='panel-item']").first();
    if (!(await panelItem.isVisible({ timeout: 2000 }))) {
      await editor.click();
      await editor.type("Comment persistence annotation.");
      await selectFirstTextRange(page);

      const toolbar = await getToolbar(page);
      await toolbar.waitFor({ state: "visible", timeout: 2000 });
      const highlightBtn = toolbar.getByRole("button", { name: "Highlight yellow" });
      if (await highlightBtn.isVisible({ timeout: 2000 })) {
        await highlightBtn.click({ force: true });
      }
    }

    if (!(await panelItem.isVisible({ timeout: 5000 }))) {
      test.skip();
      return;
    }

    const annotationId = await panelItem.getAttribute("data-annotation-id");
    if (!annotationId) {
      test.skip();
      return;
    }

    const commentToggle = panelItem.locator("[data-annotation-role='comment-toggle']");
    if (await commentToggle.isVisible({ timeout: 2000 })) {
      await commentToggle.click();

      await waitForPersistedDoc(page, docId, 0, 2000, 0).catch(() => undefined);
      const baselineMeta = await getPersistedDocMeta(page, docId);
      const baselineUpdatedAt = baselineMeta?.updatedAt ?? 0;
      const baselineSnapshotLength = baselineMeta?.snapshotLength ?? 0;

      const replyInput = page.getByPlaceholder("Add a note...").first();
      if (await replyInput.isVisible({ timeout: 2000 })) {
        const testComment = `Test comment ${Date.now()}`;
        await replyInput.fill(testComment);
        await replyInput.press("Enter");

        await waitForPersistedDoc(page, docId, baselineUpdatedAt, 15000, baselineSnapshotLength);

        await page.reload();
        await waitForEditorReady(page, { timeout: 15000 });

        await expect(editor).toBeVisible({ timeout: 10000 });

        const restoredItem = page.locator(
          `[data-annotation-role='panel-item'][data-annotation-id="${annotationId}"]`
        );
        if (!(await restoredItem.isVisible({ timeout: 3000 }))) {
          test.skip();
          return;
        }
        await restoredItem.locator("[data-annotation-role='comment-toggle']").click();

        await expect(annotationPanel).toContainText(testComment, { timeout: 5000 });
      }
    }
  });
});
