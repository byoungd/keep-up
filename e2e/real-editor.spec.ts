import { type Page, expect, test } from "@playwright/test";
import { focusEditor, modKey, openFreshEditor, selectTextBySubstring } from "./helpers/editor";

test.use({ screenshot: "only-on-failure" });

async function getAnnotationIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // Try overlay-mode selector first, fall back to legacy
    const overlaySelector = ".highlight-overlay .highlight-rect[data-annotation-id]";
    const targetSelector = ".lfcc-editor .lfcc-annotation-target[data-annotation-id]";
    const legacySelector = ".lfcc-editor .lfcc-annotation[data-annotation-id]";

    let nodes = document.querySelectorAll<HTMLElement>(overlaySelector);
    if (nodes.length === 0) {
      nodes = document.querySelectorAll<HTMLElement>(targetSelector);
    }
    if (nodes.length === 0) {
      nodes = document.querySelectorAll<HTMLElement>(legacySelector);
    }

    return Array.from(nodes)
      .map((el) => el.getAttribute("data-annotation-id"))
      .filter(Boolean) as string[];
  });
}

test.describe("Real Editor Annotation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshEditor(page, "real-editor-anno", { clearContent: false });
  });

  test("single-block annotation creation and focus", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    const uniqueText = `ANNO_TEST_${Date.now()}`;
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(uniqueText);

    // Select and annotate
    await selectTextBySubstring(page, uniqueText);
    const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
    await expect(highlightButton).toBeVisible({ timeout: 5000 });

    const idsBefore = await getAnnotationIds(page);
    await highlightButton.click();

    // Wait for annotation to appear
    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(idsBefore.length);

    const idsAfter = await getAnnotationIds(page);
    const createdId = idsAfter.find((id) => !idsBefore.includes(id));
    expect(createdId).toBeDefined();

    // Verify highlight is visible (check overlay layer for visual rendering)
    const highlightRect = page
      .locator(`.highlight-rect[data-annotation-id="${createdId}"]`)
      .first();
    await expect(highlightRect).toBeAttached();

    // Verify panel item exists and can be clicked
    const panelItem = page.locator(
      `[data-annotation-role="panel-item"][data-annotation-id="${createdId}"]`
    );
    await expect(panelItem).toBeVisible({ timeout: 5000 });
    await panelItem.click();

    // Note: Focus visual feedback (box-shadow) in overlay mode requires
    // the focusedAnnotationId to be set in the annotation store.
    // This test verifies the panel item interaction works.
    // Focus styling is tested separately in highlight-overlay.spec.ts
  });

  test("annotation survives text editing", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    const uniqueText = `EDIT_TEST_${Date.now()}`;
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(uniqueText);

    // Create annotation
    await selectTextBySubstring(page, uniqueText);
    const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
    await expect(highlightButton).toBeVisible({ timeout: 5000 });

    const idsBefore = await getAnnotationIds(page);
    await highlightButton.click();

    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(idsBefore.length);

    const idsAfter = await getAnnotationIds(page);
    const createdId = idsAfter.find((id) => !idsBefore.includes(id));
    const highlight = page.locator(`.highlight-rect[data-annotation-id="${createdId}"]`).first();

    // Click elsewhere to dismiss selection toolbar before continuing
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);

    // Edit text near annotation
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" additional text");

    // Annotation should still be visible (attached in overlay)
    await expect(highlight).toBeAttached();
  });

  test("undo/redo with annotations", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await focusEditor(page);

    const uniqueText = `UNDO_TEST_${Date.now()}`;
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(uniqueText);

    // Create annotation
    await selectTextBySubstring(page, uniqueText);
    const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
    await expect(highlightButton).toBeVisible({ timeout: 5000 });

    const idsBefore = await getAnnotationIds(page);
    await highlightButton.click();

    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(idsBefore.length);

    const idsAfter = await getAnnotationIds(page);
    const createdId = idsAfter.find((id) => !idsBefore.includes(id));
    expect(createdId).toBeDefined();

    // Perform undo/redo - annotation should persist (LFCC behavior)
    await focusEditor(page);
    await page.keyboard.press(`${modKey}+z`);
    // In LFCC, annotations persist independently of undo stack
    // The test verifies the editor doesn't crash
    await page.waitForTimeout(200);

    await focusEditor(page);
    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.waitForTimeout(200);

    // Editor should still be functional
    await focusEditor(page);
    await page.keyboard.type(" test");
    const content = await editor.textContent();
    expect(content).toContain("test");
  });
});
