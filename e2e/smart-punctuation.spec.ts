import { expect, test } from "@playwright/test";
import {
  getAnnotationIds,
  getAnnotationTextById,
  selectRangeBetweenSubstrings,
  selectTextBySubstring,
  waitForEditorReady,
} from "./helpers/editor";

/**
 * Off-by-One Bug Regression Test
 * Tests that highlights include the final character correctly.
 */
test.describe("Off-by-One Span Bug Regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
  });

  test("highlight should include the last character of selected text", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    const token = `SmartPunct-${Date.now()}.`;
    await editor.type(` ${token}`);

    // Wait for DOM to settle
    await page.waitForTimeout(300);

    const selectedText = await selectTextBySubstring(page, token);

    // Verify selection worked
    expect(selectedText).toBe(token);

    const baselineIds = await getAnnotationIds(page);

    // Wait for toolbar
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });

    // Click first color button to create annotation
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(baselineIds.length);
    const currentIds = await getAnnotationIds(page);
    const newId = currentIds.find((id) => !baselineIds.includes(id)) ?? null;
    expect(newId).toBeTruthy();
    if (!newId) {
      throw new Error("Failed to find the new annotation id");
    }
    await expect.poll(async () => getAnnotationTextById(page, newId)).toContain(token);
  });

  test("multi-block selection should include last char of each block", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    const firstToken = `First-${Date.now()}.`;
    const secondToken = `Second-${Date.now()}.`;
    await editor.type(` ${firstToken}`);
    await editor.press("Enter");
    await editor.type(secondToken);

    await page.waitForTimeout(300);

    const selectedText = await selectRangeBetweenSubstrings(page, firstToken, secondToken);
    console.info("Selected text:", selectedText);

    const baselineIds = await getAnnotationIds(page);

    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(baselineIds.length);
    const currentIds = await getAnnotationIds(page);
    const newId = currentIds.find((id) => !baselineIds.includes(id)) ?? null;
    expect(newId).toBeTruthy();
    if (!newId) {
      throw new Error("Failed to find the new annotation id");
    }
    await expect.poll(async () => getAnnotationTextById(page, newId)).toContain(firstToken);
    await expect.poll(async () => getAnnotationTextById(page, newId)).toContain(secondToken);
  });
});
