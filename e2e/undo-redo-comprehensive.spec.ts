import { expect, test } from "@playwright/test";
import {
  getEditorHTML,
  getEditorText,
  modKey,
  openFreshEditor,
  typeInEditor,
} from "./helpers/editor";

/**
 * Comprehensive Undo/Redo Tests
 *
 * Tests covering all edge cases for undo/redo behavior using established patterns.
 */
test.describe.configure({ mode: "parallel" });

test.describe("Undo/Redo Comprehensive", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `undo-redo-${testInfo.title}`, { clearContent: true });
  });

  // ==========================================================================
  // BASIC UNDO/REDO
  // ==========================================================================

  test("Ctrl+Z undoes last action", async ({ page }) => {
    await typeInEditor(page, "Hello");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content.length).toBeLessThan(5);
  });

  test("Ctrl+Shift+Z redoes undone content", async ({ page }) => {
    await typeInEditor(page, "Test");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content).toContain("Test");
  });

  test("Multiple undo operations work in sequence", async ({ page }) => {
    await typeInEditor(page, "One");
    await page.waitForTimeout(100);
    await typeInEditor(page, " Two");
    await page.waitForTimeout(100);
    await typeInEditor(page, " Three");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+z`);
    await page.keyboard.press(`${modKey}+z`);
    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content.length).toBeLessThan(12);
  });

  // ==========================================================================
  // DEEP UNDO STACK
  // ==========================================================================

  test("Deep undo stack (10+ operations) works correctly", async ({ page }) => {
    for (let i = 1; i <= 10; i++) {
      await typeInEditor(page, `W${i} `);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(300);

    const contentBefore = await getEditorText(page);
    expect(contentBefore).toContain("W10");

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press(`${modKey}+z`);
      await page.waitForTimeout(100);
    }

    const contentAfter = await getEditorText(page);
    expect(contentAfter.length).toBeLessThan(contentBefore.length);
  });

  // ==========================================================================
  // UNDO WITH FORMATTING
  // ==========================================================================

  test("Undo bold formatting removes bold", async ({ page }) => {
    await typeInEditor(page, "Bold text");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(200);

    let html = await getEditorHTML(page);
    expect(html).toMatch(/<strong/);

    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    html = await getEditorHTML(page);
    expect(html).not.toMatch(/<strong/);
  });

  test("Undo italic formatting removes italic", async ({ page }) => {
    await typeInEditor(page, "Italic text");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+i`);
    await page.waitForTimeout(200);

    let html = await getEditorHTML(page);
    expect(html).toMatch(/<em/);

    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    html = await getEditorHTML(page);
    expect(html).not.toMatch(/<em/);
  });

  // ==========================================================================
  // UNDO BLOCK OPERATIONS
  // ==========================================================================

  test("Undo paragraph deletion restores content", async ({ page }) => {
    await typeInEditor(page, "Line to delete");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(200);

    let content = await getEditorText(page);
    expect(content.trim()).toBe("");

    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    content = await getEditorText(page);
    expect(content).toContain("Line to delete");
  });

  // ==========================================================================
  // REDO STACK BEHAVIOR
  // ==========================================================================

  test("Redo stack clears when new content is typed", async ({ page }) => {
    await typeInEditor(page, "Original");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    await typeInEditor(page, "New");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content).not.toContain("Original");
    expect(content).toContain("New");
  });

  test("Multiple redo operations work correctly", async ({ page }) => {
    await typeInEditor(page, "ABC");
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+z`);
    await page.keyboard.press(`${modKey}+z`);
    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.waitForTimeout(200);

    const content = await getEditorText(page);
    expect(content).toContain("ABC");
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  test("Undo in empty editor does not crash", async ({ page }) => {
    await page.keyboard.press(`${modKey}+z`);
    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(200);

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible();
  });

  test("Redo in empty redo stack does not crash", async ({ page }) => {
    await typeInEditor(page, "X");
    await page.waitForTimeout(100);

    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.waitForTimeout(200);

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible();

    const content = await getEditorText(page);
    expect(content).toContain("X");
  });

  test("Rapid undo/redo does not crash", async ({ page }) => {
    await typeInEditor(page, "Rapid test content");
    await page.waitForTimeout(200);

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(`${modKey}+z`);
      await page.keyboard.press(`${modKey}+Shift+z`);
    }
    await page.waitForTimeout(300);

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible();
  });
});
