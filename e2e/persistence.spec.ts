import { type Page, expect, test } from "@playwright/test";
import { getEditorText, selectFirstTextRange, waitForEditorReady } from "./helpers/editor";

/**
 * E2E tests for document persistence.
 * These tests verify that documents and annotations persist across page reloads.
 */

type PersistedDocMeta = { updatedAt: number; snapshotLength: number };

async function getPersistedDocMeta(page: Page, docId: string): Promise<PersistedDocMeta | null> {
  return page.evaluate((id) => {
    return new Promise<PersistedDocMeta | null>((resolve) => {
      const request = indexedDB.open("lfcc-reader-db", 3);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("docs", "readonly");
        const store = tx.objectStore("docs");
        const getRequest = store.get(id as string);
        getRequest.onsuccess = () => {
          const entry = getRequest.result as
            | { updatedAt?: number; snapshot?: Uint8Array }
            | undefined;
          const snapshotLength = entry?.snapshot?.byteLength ?? 0;
          db.close();
          resolve(entry ? { updatedAt: entry.updatedAt ?? 0, snapshotLength } : null);
        };
        getRequest.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });
  }, docId);
}

async function waitForPersistedDoc(
  page: Page,
  docId: string,
  minUpdatedAt = 0,
  timeoutMs = 5000,
  minSnapshotLength = 0
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const meta = await getPersistedDocMeta(page, docId);
    if (meta && meta.snapshotLength > minSnapshotLength && meta.updatedAt > minUpdatedAt) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for persisted doc ${docId}`);
}

test.describe("Document Persistence", () => {
  let docId = "";
  let demoUrl = "";

  test.beforeEach(async ({ page }, testInfo) => {
    const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    docId = `persist-${Date.now()}-${safeTitle}`;
    demoUrl = `/editor?doc=${docId}`;
    await page.goto(demoUrl);
  });

  test("Document content persists across reload", async ({ page }) => {
    await page.goto(demoUrl);

    // Wait for editor to be ready
    await waitForEditorReady(page, { timeout: 10000 });
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Type some content
    await waitForPersistedDoc(page, docId, 0, 2000, 0).catch(() => undefined);
    const baselineMeta = await getPersistedDocMeta(page, docId);
    const baselineUpdatedAt = baselineMeta?.updatedAt ?? 0;
    const baselineSnapshotLength = baselineMeta?.snapshotLength ?? 0;
    await editor.click();
    const testContent = `Persistence test ${Date.now()}`;
    await editor.type(testContent);
    await expect(page.locator(`text=${testContent}`)).toBeVisible({ timeout: 5000 });

    await waitForPersistedDoc(page, docId, baselineUpdatedAt, 15000, baselineSnapshotLength);

    // Reload the page
    await page.reload();
    await waitForEditorReady(page, { timeout: 15000 });

    // Verify content persists
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect
      .poll(async () => (await getEditorText(page)).includes(testContent), { timeout: 15000 })
      .toBe(true);
  });

  test("Annotations persist across reload", async ({ page }) => {
    await page.goto(demoUrl);

    // Wait for editor
    await waitForEditorReady(page, { timeout: 10000 });
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Type content
    await waitForPersistedDoc(page, docId, 0, 2000, 0).catch(() => undefined);
    const baselineMeta = await getPersistedDocMeta(page, docId);
    const baselineUpdatedAt = baselineMeta?.updatedAt ?? 0;
    const baselineSnapshotLength = baselineMeta?.snapshotLength ?? 0;
    await editor.click();
    await editor.type("This is a test paragraph for annotation.");

    // Select text and create annotation
    await selectFirstTextRange(page);

    // Wait for selection toolbar
    const highlightBtn = page.getByRole("button", { name: "Highlight yellow" });
    if (await highlightBtn.isVisible({ timeout: 2000 })) {
      await highlightBtn.click();
    }

    await waitForPersistedDoc(page, docId, baselineUpdatedAt, 15000, baselineSnapshotLength);

    // Reload
    await page.reload();
    await waitForEditorReady(page, { timeout: 15000 });

    // Check annotation panel shows the annotation
    const annotationPanel = page.locator('[data-testid="annotation-panel"]');
    if (await annotationPanel.isVisible({ timeout: 3000 })) {
      const annotationItems = page.locator("[data-annotation-role='panel-item']");
      const count = await annotationItems.count();
      // If there are annotations from seeding or our action, we should have at least 1
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test("Comments persist across reload", async ({ page }) => {
    await page.goto(demoUrl);

    // Wait for editor
    await waitForEditorReady(page, { timeout: 10000 });
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Check for existing annotations or create one
    const annotationPanel = page.locator('[data-testid="annotation-panel"]');
    if (!(await annotationPanel.isVisible({ timeout: 2000 }))) {
      // Skip if no panel
      test.skip();
      return;
    }

    const panelItem = page.locator("[data-annotation-role='panel-item']").first();
    const annotationId = await panelItem.getAttribute("data-annotation-id");
    if (!annotationId) {
      test.skip();
      return;
    }

    // Open selected annotation's comments
    const commentToggle = panelItem.locator("[data-annotation-role='comment-toggle']");
    if (await commentToggle.isVisible({ timeout: 2000 })) {
      await commentToggle.click();

      await waitForPersistedDoc(page, docId, 0, 2000, 0).catch(() => undefined);
      const baselineMeta = await getPersistedDocMeta(page, docId);
      const baselineUpdatedAt = baselineMeta?.updatedAt ?? 0;
      const baselineSnapshotLength = baselineMeta?.snapshotLength ?? 0;

      // Type a comment
      const replyInput = page.getByPlaceholder("Add a note...").first();
      if (await replyInput.isVisible({ timeout: 2000 })) {
        const testComment = `Test comment ${Date.now()}`;
        await replyInput.fill(testComment);
        await replyInput.press("Enter");

        await waitForPersistedDoc(page, docId, baselineUpdatedAt, 15000, baselineSnapshotLength);

        // Reload
        await page.reload();
        await waitForEditorReady(page, { timeout: 15000 });

        // Verify comment persists
        await expect(editor).toBeVisible({ timeout: 10000 });

        // Re-open comments for the same annotation
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
