import { expect, test } from "@playwright/test";
import {
  focusEditor,
  getPointForSubstring,
  openFreshEditor,
  selectRangeBetweenSubstrings,
  setEditorContent,
} from "./helpers/editor";

test.use({ screenshot: "only-on-failure" });

/**
 * Selection Sync Tests
 *
 * These tests verify that clicking within annotated text correctly
 * syncs the browser selection to ProseMirror's internal selection.
 */

async function forceCommit(page: Parameters<typeof focusEditor>[0]): Promise<void> {
  await page.evaluate(() => {
    const globalAny = window as unknown as { __lfccForceCommit?: () => void };
    globalAny.__lfccForceCommit?.();
  });
  await page.waitForTimeout(100);
}

async function applyHighlight(page: Parameters<typeof focusEditor>[0]): Promise<void> {
  const toolbar = page.locator("[data-testid='selection-toolbar']");
  try {
    await expect(toolbar).toBeVisible({ timeout: 3000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click({ force: true });
  } catch {
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modKey}+Shift+A`);
  }
  await forceCommit(page);
}

test.describe("Selection Sync with Annotations", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshEditor(page, "selection-sync");
  });

  test("clicking inside annotation should position cursor correctly", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Add test content
    await focusEditor(page);

    const testLine = "CLICK_TEST_LINE_ABC_DEF_GHI";
    await page.keyboard.type(testLine);

    // Select and highlight a portion
    await selectRangeBetweenSubstrings(page, "ABC", "GHI");

    await applyHighlight(page);

    // Wait for annotation to be created (use overlay selector for current UI)
    const annotationSelector = ".highlight-overlay .highlight-rect, .lfcc-annotation";
    await expect(page.locator(annotationSelector).first()).toBeVisible({ timeout: 5000 });

    const clickPoint = await getPointForSubstring(page, "GHI", { preferEnd: true });
    expect(clickPoint).not.toBeNull();
    if (clickPoint) {
      await page.mouse.click(clickPoint.x, clickPoint.y);
    }
    await page.evaluate(() =>
      (window as unknown as { __lfccView?: { focus?: () => void } }).__lfccView?.focus?.()
    );

    // Small delay for selection to sync
    await page.waitForTimeout(100);

    // Type some text
    const insertedText = "_INSERTED_";
    await page.keyboard.type(insertedText);

    // Verify text was inserted at the correct position (near the end)
    const content = await editor.textContent();
    expect(content).toContain(insertedText);

    const insertedIndex = content?.indexOf(insertedText) ?? -1;
    const lineStart = content?.indexOf("CLICK_TEST_LINE_") ?? -1;

    expect(lineStart).toBeGreaterThanOrEqual(0);
    expect(insertedIndex).toBeGreaterThan(lineStart);
    expect(insertedIndex).toBeLessThan(lineStart + testLine.length + insertedText.length);
  });

  test("clicking after multi-paragraph annotation should position cursor correctly", async ({
    page,
  }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Add multi-paragraph content
    const para1 = "PARA1_START_END";
    const para2 = "PARA2_MIDDLE";
    const para3 = "PARA3_FINAL_CURSOR_HERE";

    await setEditorContent(page, `${para1}\n${para2}\n${para3}`);
    await focusEditor(page);

    // Create annotation spanning first two paragraphs
    await selectRangeBetweenSubstrings(page, "PARA1", "PARA2_MIDDLE");

    await applyHighlight(page);

    // Wait for annotation (use overlay selector for current UI)
    const annotationSelector = ".highlight-overlay .highlight-rect, .lfcc-annotation";
    await expect(page.locator(annotationSelector).first()).toBeVisible({ timeout: 5000 });

    // Click at the end of PARA3 (outside the annotation)
    const clickPoint = await getPointForSubstring(page, "CURSOR_HERE", { preferEnd: true });
    expect(clickPoint).not.toBeNull();
    if (clickPoint) {
      await page.mouse.click(clickPoint.x, clickPoint.y);
    }
    await page.evaluate(() =>
      (window as unknown as { __lfccView?: { focus?: () => void } }).__lfccView?.focus?.()
    );
    // Type and verify
    const testInsert = "_FINAL_INSERT_";
    await page.keyboard.type(testInsert);

    const content = await editor.textContent();

    // The insert should be after CURSOR_HERE, not somewhere else
    const insertIndex = content?.indexOf(testInsert) ?? -1;
    const cursorHereIndex = content?.indexOf("CURSOR_HERE") ?? -1;

    // Should be right after CURSOR_HERE
    expect(insertIndex).toBeGreaterThan(cursorHereIndex);
    expect(insertIndex - cursorHereIndex).toBeLessThan(20);
  });

  test("pressing Enter after clicking should insert newline at correct position", async ({
    page,
  }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Add content
    const testLine = "ENTER_TEST_LINE";
    await setEditorContent(page, `${testLine}\nSECOND_LINE`);
    await focusEditor(page);

    // Create annotation on first line
    await selectRangeBetweenSubstrings(page, "ENTER", "LINE");

    await applyHighlight(page);

    // Wait for annotation (use overlay selector for current UI)
    const annotationSelector = ".highlight-overlay .highlight-rect, .lfcc-annotation";
    await expect(page.locator(annotationSelector).first()).toBeVisible({ timeout: 5000 });

    // Click at the end of second line
    const clickPoint = await getPointForSubstring(page, "SECOND_LINE", { preferEnd: true });
    expect(clickPoint).not.toBeNull();
    if (clickPoint) {
      await page.mouse.click(clickPoint.x, clickPoint.y);
    }
    await page.evaluate(() =>
      (window as unknown as { __lfccView?: { focus?: () => void } }).__lfccView?.focus?.()
    );
    // Press Enter and type on new line
    await page.keyboard.press("Enter");
    await page.waitForTimeout(50);
    const newLineText = "NEW_PARAGRAPH_AFTER_ENTER";
    await page.keyboard.type(newLineText);

    // Verify the new paragraph exists
    const content = await editor.textContent();
    expect(content).toContain(newLineText);

    // The new text should be after SECOND_LINE
    const newLineIndex = content?.indexOf(newLineText) ?? -1;
    const secondLineIndex = content?.indexOf("SECOND_LINE") ?? -1;

    expect(newLineIndex).toBeGreaterThan(secondLineIndex);
  });
});
