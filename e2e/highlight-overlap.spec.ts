import { expect, test } from "@playwright/test";
import { selectTextBySubstring, waitForEditorReady } from "./helpers/editor";

/**
 * Overlapping Highlight E2E Tests
 *
 * Tests the interaction behavior when multiple annotations overlap.
 * Key scenarios:
 * 1. Hovering overlapped text should detect the SMALLEST (most specific) annotation
 * 2. Visual highlight rects should match exact text selection
 * 3. Both annotation handles remain accessible
 */
test.describe("Overlapping Highlights", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);

    // Clear editor and type test content
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("The quick brown fox jumps over the lazy dog", {
      delay: 5,
    });
  });

  test("Nested highlight hover detects the smallest (most specific) annotation", async ({
    page,
  }) => {
    // Create LONG highlight: "quick brown" (Yellow, created first = lower z-index)
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // Create SHORT highlight: "brown" (Green, created second = higher z-index)
    await selectTextBySubstring(page, "brown");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight green" }).click();
    await page.waitForTimeout(500);

    // Verify both highlights exist
    const yellowRects = page.locator(".highlight-rect--yellow");
    const greenRects = page.locator(".highlight-rect--green");
    await expect(yellowRects.first()).toBeAttached();
    await expect(greenRects.first()).toBeAttached();

    // Hover over "brown" (the overlapped area)
    // Both yellow and green cover this text, but green was created LATER
    const brownRect = await greenRects.first().boundingBox();
    if (!brownRect) {
      throw new Error("Green highlight rect not found");
    }

    await page.mouse.move(brownRect.x + brownRect.width / 2, brownRect.y + brownRect.height / 2);
    await page.waitForTimeout(500);

    // The GREEN handle should be visible (smallest/most specific annotation)
    const greenHandle = page.locator('.lfcc-annotation-handle[data-annotation-color="green"]');
    await expect(greenHandle.first()).toHaveCSS("opacity", "1", {
      timeout: 2000,
    });

    // The hover class should be applied to the GREEN annotation elements
    const greenHoveredElements = page.locator(
      ".lfcc-annotation--green.lfcc-annotation--panel-hover"
    );
    await expect(greenHoveredElements.first()).toBeAttached();
  });

  test("Hovering non-overlapped part of long highlight shows its handle", async ({ page }) => {
    // Create LONG highlight: "quick brown" (Yellow)
    await selectTextBySubstring(page, "quick brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // Create SHORT highlight: "brown" (Green)
    await selectTextBySubstring(page, "brown");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight green" }).click();
    await page.waitForTimeout(500);

    // Hover over "quick" (NOT overlapped, only yellow covers this)
    const yellowRects = page.locator(".highlight-rect--yellow");
    const yellowRect = await yellowRects.first().boundingBox();
    if (!yellowRect) {
      throw new Error("Yellow highlight rect not found");
    }

    // Hover the left part (where "quick" is - not overlapped with green)
    await page.mouse.move(
      yellowRect.x + 20, // Left side of yellow rect
      yellowRect.y + yellowRect.height / 2
    );
    await page.waitForTimeout(500);

    // The YELLOW handle should be visible
    const yellowHandle = page.locator('.lfcc-annotation-handle[data-annotation-color="yellow"]');
    await expect(yellowHandle.first()).toHaveCSS("opacity", "1", {
      timeout: 2000,
    });

    // The hover class should be on yellow annotation
    const yellowHoveredElements = page.locator(
      ".lfcc-annotation--yellow.lfcc-annotation--panel-hover"
    );
    await expect(yellowHoveredElements.first()).toBeAttached();
  });

  test("Highlight visual rect matches exact text selection (no extension)", async ({ page }) => {
    // Select exactly "brown" and create a highlight
    await selectTextBySubstring(page, "brown");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // Get the highlight rect bounding box
    const highlightRect = page.locator(".highlight-rect--yellow").first();
    const rectBox = await highlightRect.boundingBox();
    if (!rectBox) {
      throw new Error("Highlight rect not found");
    }

    // Verify the highlight annotation data matches expected text
    // Check that the annotation target in the DOM contains exactly "brown"
    const annotationText = await page.evaluate(() => {
      const targets = document.querySelectorAll(".lfcc-annotation--yellow");
      const texts: string[] = [];
      for (const t of targets) {
        texts.push(t.textContent || "");
      }
      return texts.join("");
    });

    // The annotation should contain exactly "brown", not more
    expect(annotationText).toBe("brown");

    // Also verify rect has reasonable dimensions
    expect(rectBox.width).toBeGreaterThan(10);
    expect(rectBox.height).toBeGreaterThan(10);
  });

  test("Three overlapping highlights: smallest one is detected on hover", async ({ page }) => {
    // Create three overlapping highlights in order:
    // 1. Yellow: "quick brown fox" (oldest)
    // 2. Green: "brown fox" (middle)
    // 3. Red/Purple: "fox" (newest)

    const toolbar = page.locator("[data-testid='selection-toolbar']");

    // 1. Yellow
    await selectTextBySubstring(page, "quick brown fox");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // 2. Green
    await selectTextBySubstring(page, "brown fox");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight green" }).click();
    await page.waitForTimeout(500);

    // 3. Purple (or red if purple not available)
    await selectTextBySubstring(page, "fox");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    const purpleBtn = toolbar.getByRole("button", { name: "Highlight purple" });
    const redBtn = toolbar.getByRole("button", { name: "Highlight red" });
    if (await purpleBtn.isVisible()) {
      await purpleBtn.click();
    } else {
      await redBtn.click();
    }
    await page.waitForTimeout(500);

    // Hover over "fox" - should detect the smallest (purple/red) annotation
    const foxRects = page.locator(".highlight-rect--purple, .highlight-rect--red");
    const foxRect = await foxRects.first().boundingBox();
    if (foxRect) {
      await page.mouse.move(foxRect.x + foxRect.width / 2, foxRect.y + foxRect.height / 2);
      await page.waitForTimeout(500);

      // The smallest handle should be visible
      const newestHandle = page.locator(
        '.lfcc-annotation-handle[data-annotation-color="purple"], .lfcc-annotation-handle[data-annotation-color="red"]'
      );
      await expect(newestHandle.first()).toHaveCSS("opacity", "1", {
        timeout: 2000,
      });
    }
  });

  /**
   * Regression Test: Overlapping Highlights Attribute Merging
   * Issue: When two highlights overlap, ProseMirror merges their attributes.
   * Previously, this caused the `data-span-id` of the underlying highlight to be
   * overwritten, resulting in missing geometry/gaps.
   * Fix: `span-id` is now in the class list (`lfcc-span-{id}`), which merges correctly.
   */
  test("Underlying highlight maintains geometry when overlapped (Regression Test)", async ({
    page,
  }) => {
    // 1. Setup text "AAA BBB CCC"
    await selectTextBySubstring(page, "The quick brown fox jumps over the lazy dog");
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("AAA BBB CCC");
    await page.waitForTimeout(100);

    // 2. Create Yellow highlight on ALL ("AAA BBB CCC")
    await selectTextBySubstring(page, "AAA BBB CCC");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
    await page.waitForTimeout(500);

    // 3. Create Green highlight on MIDDLE ("BBB")
    await selectTextBySubstring(page, "BBB");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight green" }).click();
    await page.waitForTimeout(500);

    // 4. Verification
    // Use geometric intersection to verify Yellow highlight exists under "BBB".
    // Can't use elementsFromPoint due to pointer-events: none.

    // Select BBB again to get its exact position
    await selectTextBySubstring(page, "BBB");

    const isCovered = await page.evaluate(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      const textRect = range.getBoundingClientRect();

      const center = {
        x: textRect.left + textRect.width / 2,
        y: textRect.top + textRect.height / 2,
      };

      const yellowRects = Array.from(document.querySelectorAll(".highlight-rect--yellow"));

      return yellowRects.some((el) => {
        const rect = el.getBoundingClientRect();
        return (
          center.x >= rect.left &&
          center.x <= rect.right &&
          center.y >= rect.top &&
          center.y <= rect.bottom
        );
      });
    });

    expect(isCovered, "Yellow highlight should exist under the overlapping Green highlight").toBe(
      true
    );
  });
});
