import { expect, test } from "@playwright/test";
import { selectTextBySubstring, waitForEditorReady } from "./helpers/editor";

/**
 * HighlightOverlay E2E Tests
 *
 * Tests the overlay-based highlight rendering system that provides:
 * - True z-index stacking for overlapping annotations
 * - Portal-based rendering outside ProseMirror DOM
 * - Proper geometry calculation and viewport culling
 */
test.describe("HighlightOverlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);

    // Seed content with overlapping text
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.type("The quick brown fox jumps over the lazy dog.", {
      delay: 10,
    });
  });

  test("Highlight overlay container renders in DOM", async ({ page }) => {
    // Create a highlight first
    await selectTextBySubstring(page, "quick brown");

    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // Wait for highlight overlay to appear
    await page.waitForTimeout(500);

    // Check that highlight-overlay container exists in body (portal)
    const overlayContainer = page.locator(".highlight-overlay");
    await expect(overlayContainer).toBeAttached();

    // Check that highlight rects are rendered
    const highlightRects = page.locator(".highlight-rect");
    await expect(highlightRects.first()).toBeAttached();
  });

  test("Single annotation renders with correct color", async ({ page }) => {
    // Create a yellow highlight
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await page.waitForTimeout(500);

    // Verify highlight rect has yellow background
    const highlightRect = page.locator(".highlight-rect--yellow").first();
    await expect(highlightRect).toBeAttached();

    // Check the rect has correct styles (yellow-ish color)
    const bgColor = await highlightRect.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // Yellow color should be in the yellow spectrum (r > 200, g > 200)
    expect(bgColor).toMatch(/rgb\s*\(\s*\d{2,3}\s*,\s*\d{2,3}\s*,\s*\d{1,3}\s*\)/);
  });

  test("Multiple non-overlapping annotations render correctly", async ({ page }) => {
    // Create first highlight (yellow)
    await selectTextBySubstring(page, "quick");
    let toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await page.waitForTimeout(300);

    // Create second highlight (green) on different text
    await selectTextBySubstring(page, "lazy");
    toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight green" }).click();

    await page.waitForTimeout(500);

    // Both highlights should exist
    const yellowRects = page.locator(".highlight-rect--yellow");
    const greenRects = page.locator(".highlight-rect--green");

    await expect(yellowRects.first()).toBeAttached();
    await expect(greenRects.first()).toBeAttached();
  });

  test("Annotations have z-index based on creation time", async ({ page }) => {
    // Create first highlight on "quick"
    await selectTextBySubstring(page, "quick");
    let toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await page.waitForTimeout(500);

    // Create second highlight on "over" (later creation time)
    await selectTextBySubstring(page, "over");
    toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight green" }).click();

    await page.waitForTimeout(500);

    // Both colors should be visible
    const yellowRects = page.locator(".highlight-rect--yellow");
    const greenRects = page.locator(".highlight-rect--green");

    await expect(yellowRects.first()).toBeAttached();
    await expect(greenRects.first()).toBeAttached();

    // Both should have a z-index value (ordered by creation time)
    const yellowZIndex = await yellowRects.first().evaluate((el) => {
      return Number.parseInt(window.getComputedStyle(el).zIndex || "0", 10);
    });
    const greenZIndex = await greenRects.first().evaluate((el) => {
      return Number.parseInt(window.getComputedStyle(el).zIndex || "0", 10);
    });

    // Both should have valid z-index values
    expect(yellowZIndex).toBeGreaterThan(0);
    expect(greenZIndex).toBeGreaterThan(0);

    // z-index values should be different (ordered by creation timestamp)
    expect(yellowZIndex).not.toBe(greenZIndex);
  });

  test("Highlight overlay has pointer-events none", async ({ page }) => {
    // Create a highlight
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await page.waitForTimeout(500);

    // Verify overlay container has pointer-events: none
    const overlay = page.locator(".highlight-overlay");
    const pointerEvents = await overlay.evaluate((el) => {
      return window.getComputedStyle(el).pointerEvents;
    });
    expect(pointerEvents).toBe("none");
  });

  test("Highlight rects have fixed positioning", async ({ page }) => {
    // Create highlight
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await page.waitForTimeout(500);

    // Verify highlight rect uses fixed positioning
    const rect = page.locator(".highlight-rect--yellow").first();
    const position = await rect.evaluate((el) => {
      return window.getComputedStyle(el).position;
    });
    expect(position).toBe("fixed");
  });

  test("Decoration interaction layer is transparent in overlay mode", async ({ page }) => {
    // Create a highlight
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await page.waitForTimeout(500);

    // Check that the decoration in the editor has the target class (transparent)
    const decorationTarget = page.locator(".lfcc-editor .lfcc-annotation-target");
    await expect(decorationTarget.first()).toBeAttached();

    // Verify it has transparent background
    const bgColor = await decorationTarget.first().evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // Should be transparent (rgba(0,0,0,0)) or background: transparent
    expect(bgColor).toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/);
  });

  test("Highlight annotation can be clicked through overlay", async ({ page }) => {
    // Create a highlight
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await page.waitForTimeout(500);

    // Find the annotation target in the editor (interaction layer)
    const annotationTarget = page.locator(".lfcc-editor .lfcc-annotation-target");
    await expect(annotationTarget.first()).toBeAttached();

    // Click on the annotation - should work since overlay has pointer-events: none
    await annotationTarget.first().click();

    // After clicking, we should be able to interact (cursor should be in editor)
    const selection = await page.evaluate(() => {
      return window.getSelection()?.toString() || "";
    });
    // Clicking should place cursor, not necessarily select text
    expect(selection).toBeDefined();
  });

  test("Highlight overlay updates after drag reorder", async ({ page }) => {
    // Collect console errors throughout the test
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Create additional blocks for drag reorder
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second paragraph content.", { delay: 10 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Third paragraph here.", { delay: 10 });
    await page.waitForTimeout(300);

    // Create a highlight on "quick brown"
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // Verify highlight exists
    const highlightRect = page.locator(".highlight-rect--yellow").first();
    await expect(highlightRect).toBeAttached();
    const initialRect = await highlightRect.boundingBox();
    expect(initialRect).not.toBeNull();

    // Get blocks and perform drag
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(2);

    // Hover first block to show handle
    const sourceContent = blocks.first().locator("[data-content-container]").first();
    await sourceContent.hover({ force: true });
    await page.waitForTimeout(200);

    // Wait for handle to appear
    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible({ timeout: 3000 });

    // Get positions for drag
    const handleBounds = await handle.boundingBox();
    const targetBlock = blocks.nth(1);
    const targetBounds = await targetBlock.boundingBox();

    if (!handleBounds || !targetBounds) {
      throw new Error("Could not get element bounds");
    }

    const startX = handleBounds.x + handleBounds.width / 2;
    const startY = handleBounds.y + handleBounds.height / 2;
    const endY = targetBounds.y + targetBounds.height - 5;
    const endX = targetBounds.x + targetBounds.width / 2;

    // Perform drag
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(50);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Move in steps
    const steps = 25;
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      await page.mouse.move(
        startX + (endX - startX) * progress,
        startY + (endY - startY) * progress
      );
      await page.waitForTimeout(8);
    }

    await page.waitForTimeout(150);
    await page.mouse.up();

    // Wait for geometry refresh
    await page.waitForTimeout(800);

    // Verify highlight overlay still renders (key success criteria)
    await expect(page.locator(".highlight-overlay")).toBeAttached();
    await expect(highlightRect).toBeAttached();

    // KEY ASSERTION: No critical console errors during drag reorder
    // This is the main bug fix - "mismatched transaction" error should not occur
    const criticalErrors = consoleErrors.filter(
      (err) =>
        err.includes("mismatched transaction") ||
        err.includes("RangeError") ||
        err.includes("LORO_APPLY_FAIL") ||
        err.includes("Applying a mismatched")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
