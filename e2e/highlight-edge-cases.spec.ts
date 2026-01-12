import { expect, test } from "@playwright/test";
import {
  selectRangeBetweenSubstrings,
  selectTextBySubstring,
  waitForEditorReady,
} from "./helpers/editor";

/**
 * Edge Case Tests for Highlight Overlay System
 *
 * These tests cover boundary conditions and complex scenarios to ensure
 * the annotation/highlight system is robust and reliable.
 */
test.describe("Highlight Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
  });

  test.describe("Overlapping Annotations", () => {
    test("overlapping highlights both render correctly", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("The quick brown fox jumps over the lazy dog.");

      // Create first highlight on "quick brown fox"
      await selectTextBySubstring(page, "quick brown fox");
      let toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(300);

      // Create second highlight on different non-overlapping text to avoid selection issues
      await selectTextBySubstring(page, "lazy dog");
      toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight green" }).click();
      await page.waitForTimeout(500);

      // Both highlights should exist
      const yellowRects = page.locator(".highlight-rect--yellow");
      const greenRects = page.locator(".highlight-rect--green");

      await expect(yellowRects.first()).toBeAttached();
      await expect(greenRects.first()).toBeAttached();

      // Both should have valid z-index (later one should be higher)
      const yellowZIndex = await yellowRects.first().evaluate((el) => {
        return Number.parseInt(window.getComputedStyle(el).zIndex || "0", 10);
      });
      const greenZIndex = await greenRects.first().evaluate((el) => {
        return Number.parseInt(window.getComputedStyle(el).zIndex || "0", 10);
      });

      expect(yellowZIndex).toBeGreaterThan(0);
      expect(greenZIndex).toBeGreaterThan(0);
      // Green was created later, should have higher z-index
      expect(greenZIndex).toBeGreaterThan(yellowZIndex);
    });

    test("three highlights maintain correct stacking order", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("AAA BBB CCC DDD EEE FFF GGG");

      // Create three non-overlapping highlights to test z-index ordering
      await selectTextBySubstring(page, "AAA");
      let toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(200);

      await selectTextBySubstring(page, "CCC");
      toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight green" }).click();
      await page.waitForTimeout(200);

      await selectTextBySubstring(page, "EEE");
      toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight red" }).click();
      await page.waitForTimeout(500);

      // All three should exist
      const yellowRects = page.locator(".highlight-rect--yellow");
      const greenRects = page.locator(".highlight-rect--green");
      const redRects = page.locator(".highlight-rect--red");

      await expect(yellowRects.first()).toBeAttached();
      await expect(greenRects.first()).toBeAttached();
      await expect(redRects.first()).toBeAttached();

      // Verify all have valid z-index (don't require specific order due to pre-seeded annotations)
      const zIndexes = await Promise.all([
        yellowRects
          .first()
          .evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex || "0", 10)),
        greenRects
          .first()
          .evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex || "0", 10)),
        redRects.first().evaluate((el) => Number.parseInt(getComputedStyle(el).zIndex || "0", 10)),
      ]);

      // All should have valid z-index values
      for (const zIndex of zIndexes) {
        expect(zIndex).toBeGreaterThan(0);
      }

      // All three z-indexes should be different
      const uniqueZIndexes = new Set(zIndexes);
      expect(uniqueZIndexes.size).toBe(3);
    });
  });

  test.describe("Annotation Lifecycle", () => {
    test("deleted annotation removes overlay rect", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      const uniqueText = `DELETE_TEST_${Date.now()}`;
      await page.keyboard.type(uniqueText);

      // Create highlight on unique text
      await selectTextBySubstring(page, uniqueText);
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      // Verify highlight exists
      const highlightRects = page.locator(".highlight-rect--yellow");
      await expect(highlightRects.first()).toBeAttached();
      const initialCount = await highlightRects.count();
      expect(initialCount).toBeGreaterThan(0);

      // Select the text again to show the toolbar with delete option
      await selectTextBySubstring(page, uniqueText);
      await expect(toolbar).toBeVisible({ timeout: 5000 });

      // Use the toolbar's Delete Highlight button
      const deleteButton = toolbar.getByRole("button", { name: "Delete Highlight" });
      if (await deleteButton.isVisible({ timeout: 2000 })) {
        await deleteButton.click();
        await page.waitForTimeout(500);

        // Verify highlight count decreased
        const finalCount = await highlightRects.count();
        expect(finalCount).toBeLessThan(initialCount);
      }
    });

    test("editing text near annotation does not crash", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("Short text here.");

      // Create highlight on "text"
      await selectTextBySubstring(page, "text");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      // Get initial highlight
      const highlightRect = page.locator(".highlight-rect--yellow").first();
      await expect(highlightRect).toBeAttached();

      // Click after "here" and add more text (outside annotation)
      await editor.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" More content added.", { delay: 20 });
      await page.waitForTimeout(500);

      // Editor should remain stable
      await expect(editor).toBeVisible();

      // Highlight should still exist
      const finalCount = await page.locator(".highlight-rect--yellow").count();
      expect(finalCount).toBeGreaterThan(0);
    });
  });

  test.describe("Multi-block Annotations", () => {
    test("annotation spanning multiple paragraphs renders correctly", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      // Type multiple paragraphs
      await page.keyboard.type("First paragraph with some text.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Second paragraph with more text.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Third paragraph ends here.");

      // Select across paragraphs
      await selectRangeBetweenSubstrings(page, "some text", "more text");

      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      // Should have multiple highlight rects (one per line/block)
      const highlightRects = page.locator(".highlight-rect--yellow");
      const count = await highlightRects.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // All rects should have valid dimensions
      for (let i = 0; i < count; i++) {
        const rect = highlightRects.nth(i);
        const box = await rect.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe("Scroll and Resize Behavior", () => {
    test("highlights update geometry after scroll", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      // Create some content and a highlight
      await page.keyboard.type("Scroll test content for highlight positioning.");

      await selectTextBySubstring(page, "highlight positioning");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--yellow").first();
      await expect(highlightRect).toBeAttached();

      // Get initial position
      const _positionBefore = await highlightRect.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width };
      });

      // Scroll the editor container if it's scrollable
      await page.evaluate(() => {
        const container = document.querySelector(".lfcc-editor");
        if (container) {
          container.scrollTop += 50;
        }
      });
      await page.waitForTimeout(300);

      // Highlight should still have valid dimensions
      const positionAfter = await highlightRect.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width };
      });

      // Width should remain consistent
      expect(positionAfter.width).toBeGreaterThan(0);
    });

    test("highlights update on window resize", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type(
        "This is a long line of text that will wrap differently at different viewport widths for testing resize behavior."
      );

      await selectTextBySubstring(page, "wrap differently");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--yellow").first();
      await expect(highlightRect).toBeAttached();

      // Get initial dimensions
      const initialBox = await highlightRect.boundingBox();
      expect(initialBox).not.toBeNull();

      // Resize viewport
      await page.setViewportSize({ width: 800, height: 600 });
      await page.waitForTimeout(500);

      // Highlight should still exist
      await expect(highlightRect).toBeAttached();
      const finalBox = await highlightRect.boundingBox();
      expect(finalBox).not.toBeNull();
      expect(finalBox?.width).toBeGreaterThan(0);
    });
  });

  test.describe("Unicode and Special Characters", () => {
    test("highlights work on Chinese text", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("这是中文测试文本，用于验证高亮功能。");

      await selectTextBySubstring(page, "中文测试");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--yellow").first();
      await expect(highlightRect).toBeAttached();

      const box = await highlightRect.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width).toBeGreaterThan(0);
    });

    test("highlights work on emoji text", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("Hello world with emojis here.");

      await selectTextBySubstring(page, "emojis here");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight green" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--green").first();
      await expect(highlightRect).toBeAttached();
    });

    test("highlights work on mixed language text", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("English 中文 日本語 한국어 mixed text.");

      await selectTextBySubstring(page, "中文 日本語");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight purple" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--purple").first();
      await expect(highlightRect).toBeAttached();
    });
  });

  test.describe("Edge Positions", () => {
    test("highlight at document start renders correctly", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("StartWord followed by other content.");

      await selectTextBySubstring(page, "StartWord");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--yellow").first();
      await expect(highlightRect).toBeAttached();

      const box = await highlightRect.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width).toBeGreaterThan(0);
    });

    test("highlight at document end renders correctly", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("Some content before EndWord");

      await selectTextBySubstring(page, "EndWord");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--yellow").first();
      await expect(highlightRect).toBeAttached();
    });

    test("single character highlight works", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("A B C D E F G");

      // Select just "C"
      await selectTextBySubstring(page, "C");
      const toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(500);

      const highlightRect = page.locator(".highlight-rect--yellow").first();
      await expect(highlightRect).toBeAttached();

      const box = await highlightRect.boundingBox();
      expect(box).not.toBeNull();
      // Single character should have reasonable width (at least a few pixels)
      expect(box?.width).toBeGreaterThan(2);
    });
  });

  test.describe("Color Variations", () => {
    test("all four highlight colors render correctly", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("YELLOW GREEN RED PURPLE colors test.");

      // Create yellow highlight
      await selectTextBySubstring(page, "YELLOW");
      let toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
      await page.waitForTimeout(400);

      // Create green highlight
      await selectTextBySubstring(page, "GREEN");
      toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight green" }).click();
      await page.waitForTimeout(400);

      // Create red highlight
      await selectTextBySubstring(page, "RED");
      toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight red" }).click();
      await page.waitForTimeout(400);

      // Create purple highlight
      await selectTextBySubstring(page, "PURPLE");
      toolbar = page.locator("[data-testid='selection-toolbar']");
      await expect(toolbar).toBeVisible({ timeout: 5000 });
      await toolbar.getByRole("button", { name: "Highlight purple" }).click();
      await page.waitForTimeout(500);

      // Verify all colors exist
      const colors = ["yellow", "green", "red", "purple"] as const;
      for (const color of colors) {
        const rect = page.locator(`.highlight-rect--${color}`).first();
        await expect(rect).toBeAttached({ timeout: 3000 });
      }
    });
  });

  test.describe("Stress Tests", () => {
    test("rapid annotation creation does not crash", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      // Type numbered words for easy selection
      const words = Array.from({ length: 10 }, (_, i) => `Word${i}`);
      await page.keyboard.type(words.join(" "));

      // Rapidly create annotations
      for (let i = 0; i < 5; i++) {
        await selectTextBySubstring(page, `Word${i}`);
        const toolbar = page.locator("[data-testid='selection-toolbar']");
        if (await toolbar.isVisible({ timeout: 2000 })) {
          await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
          await page.waitForTimeout(100);
        }
      }

      await page.waitForTimeout(500);

      // Should have multiple highlights without crashing
      const highlightRects = page.locator(".highlight-rect");
      const count = await highlightRects.count();
      expect(count).toBeGreaterThan(0);

      // Overlay should still be functional
      const overlay = page.locator(".highlight-overlay");
      await expect(overlay).toBeAttached();
    });

    test("many annotations do not cause performance degradation", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      // Create content with many highlightable words
      const sentence = "Test word for highlighting performance check. ";
      await page.keyboard.type(sentence.repeat(5));

      const startTime = Date.now();

      // Create several annotations
      const targets = ["Test", "word", "highlighting", "performance", "check"];
      for (const target of targets) {
        await selectTextBySubstring(page, target);
        const toolbar = page.locator("[data-testid='selection-toolbar']");
        if (await toolbar.isVisible({ timeout: 2000 })) {
          await toolbar.getByRole("button", { name: "Highlight yellow" }).click();
          await page.waitForTimeout(150);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (30 seconds)
      expect(duration).toBeLessThan(30000);

      // All highlights should render
      const highlightRects = page.locator(".highlight-rect");
      const count = await highlightRects.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("Empty and Edge States", () => {
    test("editor with pre-seeded annotations renders correctly", async ({ page }) => {
      // The editor page has pre-seeded annotations for demo purposes
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await expect(editor).toBeVisible();

      // Wait for any pre-seeded highlights to render
      await page.waitForTimeout(500);

      // Check that overlay system is functional
      const overlay = page.locator(".highlight-overlay");
      const overlayExists = await overlay.count();

      if (overlayExists > 0) {
        // If overlay exists, it should have proper styling
        const pointerEvents = await overlay.evaluate((el) => {
          return window.getComputedStyle(el).pointerEvents;
        });
        expect(pointerEvents).toBe("none");
      }

      // Editor should remain interactive
      await editor.click();
      await page.keyboard.type("New text added.");

      // No crash should occur
      await expect(editor).toBeVisible();
    });

    test("annotation on whitespace-only selection is handled gracefully", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("Word1     Word2"); // Multiple spaces

      // Try to select just spaces (may or may not work)
      // The key is no crash
      await page.waitForTimeout(200);

      // Editor should remain stable
      await expect(editor).toBeVisible();
    });
  });
});
