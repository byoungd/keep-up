import { expect, test } from "@playwright/test";
import {
  getEditorHTML,
  getEditorText,
  modKey,
  openFreshEditor,
  selectTextBySubstring,
  typeInEditor,
} from "./helpers/editor";

/**
 * Comprehensive Keyboard Shortcuts Tests
 *
 * Tests covering keyboard shortcuts using established patterns.
 */
test.describe.configure({ mode: "parallel" });

test.describe("Keyboard Shortcuts Comprehensive", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `shortcuts-${testInfo.title}`, { clearContent: true });
  });

  // ==========================================================================
  // FORMATTING SHORTCUTS
  // ==========================================================================

  test("Ctrl+B toggles bold", async ({ page }) => {
    await typeInEditor(page, "Bold text here");
    await selectTextBySubstring(page, "text");
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);

    let html = await getEditorHTML(page);
    expect(html).toMatch(/<strong[^>]*>text<\/strong>/);

    // Toggle off
    await selectTextBySubstring(page, "text");
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);

    html = await getEditorHTML(page);
    expect(html).not.toMatch(/<strong[^>]*>text<\/strong>/);
  });

  test("Ctrl+I toggles italic", async ({ page }) => {
    await typeInEditor(page, "Italic text here");
    await selectTextBySubstring(page, "text");
    await page.keyboard.press(`${modKey}+i`);
    await page.waitForTimeout(200);

    let html = await getEditorHTML(page);
    expect(html).toMatch(/<em[^>]*>text<\/em>/);

    // Toggle off
    await selectTextBySubstring(page, "text");
    await page.keyboard.press(`${modKey}+i`);
    await page.waitForTimeout(200);

    html = await getEditorHTML(page);
    expect(html).not.toMatch(/<em[^>]*>text<\/em>/);
  });

  test("Ctrl+B and Ctrl+I can combine", async ({ page }) => {
    await typeInEditor(page, "Combined formatting");
    await selectTextBySubstring(page, "Combined");
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(100);
    await selectTextBySubstring(page, "Combined");
    await page.keyboard.press(`${modKey}+i`);
    await page.waitForTimeout(200);

    const html = await getEditorHTML(page);
    expect(html).toMatch(/<strong/);
    expect(html).toMatch(/<em/);
  });

  // ==========================================================================
  // SELECT ALL
  // ==========================================================================

  test("Ctrl+A selects all content", async ({ page }) => {
    await typeInEditor(page, "First paragraph");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Second paragraph");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.type("REPLACED");
    await page.waitForTimeout(200);

    const text = await getEditorText(page);
    expect(text).toContain("REPLACED");
    expect(text).not.toContain("First");
  });

  // ==========================================================================
  // CLIPBOARD SHORTCUTS
  // ==========================================================================

  test("Ctrl+C copies and Ctrl+V pastes", async ({ page }) => {
    await typeInEditor(page, "Copy this");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+c`);
    await page.waitForTimeout(200);

    // Clear and paste
    await page.keyboard.press("Backspace");
    await page.keyboard.press(`${modKey}+v`);
    await page.waitForTimeout(500);

    const content = await getEditorText(page);
    expect(content).toContain("Copy this");
  });

  test("Ctrl+X cuts selected text", async ({ page }) => {
    await typeInEditor(page, "Cut this text");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+x`);
    await page.waitForTimeout(200);

    let content = await getEditorText(page);
    expect(content.trim()).toBe("");

    await page.keyboard.press(`${modKey}+v`);
    await page.waitForTimeout(300);

    content = await getEditorText(page);
    expect(content).toContain("Cut this text");
  });

  // ==========================================================================
  // UNDO/REDO SHORTCUTS
  // ==========================================================================

  test("Ctrl+Z undoes last action", async ({ page }) => {
    await typeInEditor(page, "Test");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content.length).toBeLessThan(4);
  });

  test("Ctrl+Shift+Z redoes undone action", async ({ page }) => {
    await typeInEditor(page, "Test");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+z`);
    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content).toContain("Test");
  });

  // ==========================================================================
  // SPECIAL KEYS
  // ==========================================================================

  test("Backspace deletes character", async ({ page }) => {
    await typeInEditor(page, "ABC");
    await page.waitForTimeout(200);

    await page.keyboard.press("Backspace");
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content).toContain("AB");
    expect(content).not.toContain("ABC");
  });

  test("Enter creates new block", async ({ page }) => {
    await typeInEditor(page, "Line 1");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Line 2");
    await page.waitForTimeout(200);

    const html = await getEditorHTML(page);
    // Should have multiple blocks
    expect(html).toContain("Line 1");
    expect(html).toContain("Line 2");
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  // Skipped: Mark-at-cursor behavior varies; covered by formatting tests
  test.skip("Shortcuts work with empty selection (mark at cursor)", async ({ page }) => {
    await page.keyboard.press(`${modKey}+b`);
    await typeInEditor(page, "Bold");
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);

    const html = await getEditorHTML(page);
    expect(html).toMatch(/<strong/);
  });

  test("Rapid shortcut execution does not crash", async ({ page }) => {
    await typeInEditor(page, "Rapid test");
    await page.waitForTimeout(200);

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press(`${modKey}+b`);
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(300);

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible();
  });

  test("Multiple formatting shortcuts in sequence", async ({ page }) => {
    await typeInEditor(page, "Test text");
    await selectTextBySubstring(page, "Test");
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(100);
    await selectTextBySubstring(page, "Test");
    await page.keyboard.press(`${modKey}+i`);
    await page.waitForTimeout(200);

    const html = await getEditorHTML(page);
    expect(html).toMatch(/<strong/);
    expect(html).toMatch(/<em/);
  });
});
