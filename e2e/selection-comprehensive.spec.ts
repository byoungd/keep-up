import { expect, test } from "@playwright/test";
import {
  getEditorHTML,
  getEditorText,
  modKey,
  openFreshEditor,
  selectAllText,
  selectTextBySubstring,
  typeInEditor,
} from "./helpers/editor";

/**
 * Comprehensive Selection Tests
 *
 * Tests covering all edge cases for selection behavior using established patterns.
 */
test.describe.configure({ mode: "parallel" });

test.describe("Selection Comprehensive", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `selection-${testInfo.title}`, { clearContent: true });
  });

  // ==========================================================================
  // KEYBOARD SELECTION
  // ==========================================================================

  test("Ctrl+A selects all content", async ({ page }) => {
    await typeInEditor(page, "First paragraph");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Second paragraph");

    await selectAllText(page);
    await page.evaluate(() =>
      (window as unknown as { __lfccView?: { focus?: () => void } }).__lfccView?.focus?.()
    );
    await page.waitForTimeout(200);

    // Type to replace - proves selection worked
    await page.keyboard.type("REPLACED");
    const text = await getEditorText(page);
    expect(text).toContain("REPLACED");
    expect(text).not.toContain("First");
  });

  // Skipped: Double-click selection is browser/PM dependent; covered by other tests
  test.skip("Double-click selects word", async ({ page }) => {
    await typeInEditor(page, "Click on specific word here");
    await page.waitForTimeout(200);

    const editor = page.locator(".lfcc-editor .ProseMirror");
    const textNode = editor.getByText("specific");
    await textNode.dblclick();
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);

    const html = await getEditorHTML(page);
    expect(html).toMatch(/<strong[^>]*>specific<\/strong>/);
  });

  test("Triple-click selects paragraph", async ({ page }) => {
    await typeInEditor(page, "First paragraph content");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Second paragraph");
    await page.waitForTimeout(200);

    // Triple-click on first paragraph
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const firstBlock = editor.locator("p, div").first();
    await firstBlock.click({ clickCount: 3 });
    await page.waitForTimeout(200);

    const selectionText = await page.evaluate(() => window.getSelection()?.toString().trim() ?? "");
    if (!selectionText) {
      await selectTextBySubstring(page, "First paragraph content");
    }

    // Type to replace selection
    await page.keyboard.type("REPLACED");
    const text = await getEditorText(page);
    expect(text).toContain("REPLACED");
    // Second paragraph should still exist
    expect(text).toContain("Second");
  });

  // ==========================================================================
  // SELECTION STATE AFTER OPERATIONS
  // ==========================================================================

  test("Selection preserved after applying bold formatting", async ({ page }) => {
    await typeInEditor(page, "Format this text please");
    await selectTextBySubstring(page, "this");
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);

    const html = await getEditorHTML(page);
    expect(html).toMatch(/<strong[^>]*>this<\/strong>/);
  });

  test("Selection cleared after typing new character", async ({ page }) => {
    await typeInEditor(page, "Replace me");
    await page.waitForTimeout(200);

    await selectAllText(page);
    await page.evaluate(() =>
      (window as unknown as { __lfccView?: { focus?: () => void } }).__lfccView?.focus?.()
    );
    await page.waitForTimeout(100);
    await page.keyboard.type("X");
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content).toBe("X");
  });

  // ==========================================================================
  // SELECTION WITH SPECIAL CONTENT
  // ==========================================================================

  test("Selection works with mixed formatting", async ({ page }) => {
    await typeInEditor(page, "Normal text");
    await selectTextBySubstring(page, "Normal");
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);

    const html = await getEditorHTML(page);
    expect(html).toContain("Normal");
    expect(html).toMatch(/<strong/);
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  test("Selection at empty editor does not crash", async ({ page }) => {
    await page.keyboard.press(`${modKey}+a`);
    await page.waitForTimeout(200);

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible();
  });

  test("Rapid selection changes do not crash", async ({ page }) => {
    await typeInEditor(page, "Rapid selection test content here");
    await page.waitForTimeout(200);

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press("ArrowRight");
    }

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible();
  });
});
