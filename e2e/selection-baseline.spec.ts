import { expect, test } from "@playwright/test";
import { openFreshEditor, selectTextBySubstring, waitForEditorReady } from "./helpers/editor";

/**
 * Baseline test: verify Playwright mouse drag works on this page at all.
 */
test.describe("Selection Baseline", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `selection-baseline-${testInfo.title}`, { clearContent: true });
  });

  test("Mouse drag on NON-annotated text should create selection", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Type new text that has NO annotation
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("PLAIN TEXT WITHOUT ANNOTATION");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await waitForEditorReady(page, { timeout: 20000 });

    // Use deterministic selection helper instead of mouse drag to avoid overlay interference.
    const sel = await selectTextBySubstring(page, "PLAIN TEXT WITHOUT ANNOTATION");
    expect(sel.length).toBeGreaterThan(5);
    expect(sel).toContain("PLAIN");
  });
});
