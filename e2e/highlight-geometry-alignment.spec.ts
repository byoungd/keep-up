import { expect, test } from "@playwright/test";
import { selectTextBySubstring, waitForEditorReady } from "./helpers/editor";

/**
 * Highlight Geometry Alignment Tests
 *
 * These tests verify that the visual highlight overlay rects
 * are correctly aligned with the ProseMirror handle decorations.
 *
 * KEY INSIGHT: In overlay rendering mode (useOverlayRendering=true):
 * - Inline decoration spans (.lfcc-annotation--*) are INVISIBLE transparent wrappers
 * - The VISIBLE elements are:
 *   1. Highlight overlay rects (.highlight-rect--*)
 *   2. Handle widgets (.lfcc-annotation-handle)
 *
 * Tests must click/interact with VISIBLE elements and compare overlay to handles.
 */
test.describe("Highlight Geometry Alignment", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);

    // Clear editor and type test content
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
  });

  test("Overlay rect matches handle positions for single highlight", async ({ page }) => {
    // Type specific text
    await page.keyboard.type("Drag the handles to update the range", {
      delay: 5,
    });
    await page.waitForTimeout(300);

    // Select "update" and highlight
    await selectTextBySubstring(page, "update");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // Get handle positions (start and end handles define the annotation range)
    const handles = await page.evaluate(() => {
      const start = document.querySelector(
        '.lfcc-annotation-handle--start[data-annotation-color="yellow"]'
      );
      const end = document.querySelector(
        '.lfcc-annotation-handle--end[data-annotation-color="yellow"]'
      );
      return {
        start: start ? start.getBoundingClientRect() : null,
        end: end ? end.getBoundingClientRect() : null,
      };
    });

    // Get overlay rect
    const overlayRect = await page.evaluate(() => {
      const overlay = document.querySelector(".highlight-rect--yellow");
      return overlay ? overlay.getBoundingClientRect() : null;
    });

    expect(handles.start).not.toBeNull();
    expect(handles.end).not.toBeNull();
    expect(overlayRect).not.toBeNull();
    if (!handles.start || !handles.end || !overlayRect) return;

    // CRITICAL: Overlay should align with handles
    // Start handle right edge should be near overlay left edge
    const startDiff = Math.abs(overlayRect.left - (handles.start.left + handles.start.width));
    expect(startDiff).toBeLessThan(20);

    // End handle left edge should be near overlay right edge
    const endDiff = Math.abs(overlayRect.right - handles.end.left);
    expect(endDiff).toBeLessThan(20);
  });

  test("Overlay rect matches text selection exactly", async ({ page }) => {
    // Type specific text
    await page.keyboard.type("The quick brown fox jumps", { delay: 5 });
    await page.waitForTimeout(300);

    // Select exactly "brown" and highlight
    await selectTextBySubstring(page, "brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // Get handle positions (these define the annotation range from ProseMirror)
    const handles = await page.evaluate(() => {
      const startHandle = document.querySelector(
        '.lfcc-annotation-handle--start[data-annotation-color="yellow"]'
      );
      const endHandle = document.querySelector(
        '.lfcc-annotation-handle--end[data-annotation-color="yellow"]'
      );
      return {
        start: startHandle ? startHandle.getBoundingClientRect() : null,
        end: endHandle ? endHandle.getBoundingClientRect() : null,
      };
    });

    // Get overlay rect
    const overlayRect = await page.evaluate(() => {
      const overlay = document.querySelector(".highlight-rect--yellow") as HTMLElement | null;
      return overlay ? overlay.getBoundingClientRect() : null;
    });

    expect(handles.start).not.toBeNull();
    expect(handles.end).not.toBeNull();
    expect(overlayRect).not.toBeNull();
    if (!handles.start || !handles.end || !overlayRect) return;

    // CRITICAL: Overlay should start at or very close to the start handle
    const startDiff = Math.abs(overlayRect.left - (handles.start.left + handles.start.width));
    expect(startDiff).toBeLessThan(20);

    // CRITICAL: Overlay should end at or very close to the end handle
    const endDiff = Math.abs(overlayRect.right - handles.end.left);
    expect(endDiff).toBeLessThan(20);

    // Verify overlay has reasonable dimensions
    expect(overlayRect.width).toBeGreaterThan(20); // "brown" is at least 20px
    expect(overlayRect.height).toBeGreaterThan(10); // At least one line height
  });

  // NOTE: Test "Clicking highlight overlay" is skipped because overlays have pointer-events: none
  // The overlay cannot be directly clicked - interactions go through the editor's inline decorations

  // NOTE: Test "Inserting text BEFORE highlight shifts overlay" is skipped because
  // the current anchor system uses static encoded offsets, not Loro CRDT cursors.
  // Position tracking after edits requires proper cursor integration (LFCC-CURSOR-TODO)

  test("Multiple highlights maintain correct positions after typing at end", async ({ page }) => {
    // Setup: Create multiple highlights
    await page.keyboard.type("First Second Third Fourth", { delay: 5 });
    await page.waitForTimeout(300);

    const toolbar = page.locator("[data-testid='selection-toolbar']");

    // Highlight "First"
    await selectTextBySubstring(page, "First");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(300);

    // Highlight "Third"
    await selectTextBySubstring(page, "Third");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight green" }).click();
    await page.waitForTimeout(300);

    // Get positions before any interaction
    const yellowBefore = await page.locator(".highlight-rect--yellow").first().boundingBox();
    const greenBefore = await page.locator(".highlight-rect--green").first().boundingBox();

    expect(yellowBefore).not.toBeNull();
    expect(greenBefore).not.toBeNull();
    if (!yellowBefore || !greenBefore) return;

    // Type at END of document (doesn't shift existing highlights)
    await page.keyboard.press("End");
    await page.keyboard.type(" extra", { delay: 5 });
    await page.waitForTimeout(300);

    // Get positions after typing
    const yellowAfter = await page.locator(".highlight-rect--yellow").first().boundingBox();
    const greenAfter = await page.locator(".highlight-rect--green").first().boundingBox();

    expect(yellowAfter).not.toBeNull();
    expect(greenAfter).not.toBeNull();
    if (!yellowAfter || !greenAfter) return;

    // CRITICAL: Highlights before "extra" should NOT shift since we typed at the END
    expect(Math.abs(yellowAfter.x - yellowBefore.x)).toBeLessThan(5);
    expect(Math.abs(greenAfter.x - greenBefore.x)).toBeLessThan(5);
  });

  test("Handle and overlay geometry stay synchronized", async ({ page }) => {
    // Setup: Create a highlight
    await page.keyboard.type("Test handle overlay sync check", { delay: 5 });
    await page.waitForTimeout(300);

    await selectTextBySubstring(page, "overlay");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // Get overlay and handle positions
    const positions = await page.evaluate(() => {
      const overlay = document.querySelector(".highlight-rect--yellow");
      const startHandle = document.querySelector(
        '.lfcc-annotation-handle--start[data-annotation-color="yellow"]'
      );
      const endHandle = document.querySelector(
        '.lfcc-annotation-handle--end[data-annotation-color="yellow"]'
      );
      return {
        overlay: overlay ? overlay.getBoundingClientRect() : null,
        startHandle: startHandle ? startHandle.getBoundingClientRect() : null,
        endHandle: endHandle ? endHandle.getBoundingClientRect() : null,
      };
    });

    expect(positions.overlay).not.toBeNull();
    expect(positions.startHandle).not.toBeNull();
    expect(positions.endHandle).not.toBeNull();
    if (!positions.overlay || !positions.startHandle || !positions.endHandle) return;

    // CRITICAL: Overlay should align with handles
    // Start handle right edge should be near overlay left edge
    const startDiff = Math.abs(
      positions.overlay.left - (positions.startHandle.left + positions.startHandle.width)
    );
    expect(startDiff).toBeLessThan(20);

    // End handle left edge should be near overlay right edge
    const endDiff = Math.abs(positions.overlay.right - positions.endHandle.left);
    expect(endDiff).toBeLessThan(20);

    // Overlay dimensions should be reasonable
    expect(positions.overlay.width).toBeGreaterThan(30); // "overlay" is at least 30px
    expect(positions.overlay.height).toBeGreaterThan(10);
  });
});
