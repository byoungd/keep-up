import { expect, test } from "@playwright/test";

/**
 * Visual Regression Tests for LFCC Editor
 *
 * These tests capture screenshots of critical UI states to detect visual regressions.
 * Run `pnpm test:visual:update` to update baseline snapshots.
 */

test.describe("Visual Regression Tests", () => {
  test.beforeEach(async ({ page }) => {
    const docId = `visual-${Date.now()}`;
    await page.goto(`/editor?doc=${docId}`);
    await page.waitForSelector(".lfcc-editor .ProseMirror", { timeout: 15000 });
    await page.addStyleTag({
      content:
        ".lfcc-editor{width:674px !important;height:500px !important;box-sizing:border-box;}" +
        ".lfcc-editor .ProseMirror{caret-color:transparent !important;}" +
        "*,*::before,*::after{animation:none !important;transition:none !important;}",
    });
    await page.addStyleTag({
      content: "[data-testid='annotation-panel-container']{display:none !important;}",
    });
    await page.evaluate(async () => {
      if ("fonts" in document) {
        await (document as { fonts: { ready: Promise<unknown> } }).fonts.ready;
      }
    });
    // Wait for fonts and animations to settle
    await page.waitForTimeout(500);
  });

  test("editor empty state", async ({ page }) => {
    // Clear any existing content for a clean slate
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);

    // Capture screenshot of empty editor
    await expect(page.locator(".lfcc-editor")).toHaveScreenshot("editor-empty.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("editor with content", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Type some sample content
    await page.keyboard.type("# Welcome to the Editor");
    await page.keyboard.press("Enter");
    await page.keyboard.type("This is a paragraph with some text.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- First item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- Second item");
    await page.waitForTimeout(300);

    await expect(page.locator(".lfcc-editor")).toHaveScreenshot("editor-with-content.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("selection toolbar visible", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Type text and select it
    await page.keyboard.type("Select this text for toolbar");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.waitForTimeout(500);

    // The toolbar should now be visible
    const toolbar = page.locator('[role="toolbar"], [data-testid="selection-toolbar"]');
    if (await toolbar.isVisible()) {
      await expect(toolbar).toHaveScreenshot("selection-toolbar.png", {
        maxDiffPixelRatio: 0.02,
      });
    } else {
      // Fallback: screenshot the editor area with selection
      await expect(page.locator(".lfcc-editor")).toHaveScreenshot("editor-with-selection.png", {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  test("slash command menu", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Trigger slash menu
    await page.keyboard.type("/");
    await page.waitForTimeout(500);

    // Look for the slash menu
    const slashMenu = page.locator('[data-testid="slash-command-menu"]');
    if (await slashMenu.isVisible()) {
      await page.addStyleTag({
        content:
          "[data-testid='slash-command-menu']{width:379px !important;max-height:398px !important;}",
      });
      await expect(slashMenu).toHaveScreenshot("slash-menu.png", {
        maxDiffPixelRatio: 0.02,
      });
    }

    // Close menu
    await page.keyboard.press("Escape");
  });

  test("dark mode appearance", async ({ page }) => {
    // Toggle to dark mode if possible
    const themeToggle = page.locator(
      '[data-testid="theme-toggle"], button:has-text("Dark"), button:has([class*="moon"])'
    );

    if (await themeToggle.first().isVisible()) {
      await themeToggle.first().click();
      await page.waitForTimeout(500);

      // Check if dark mode is active
      const isDarkMode = await page.evaluate(() => {
        return (
          document.documentElement.classList.contains("dark") ||
          document.body.classList.contains("dark")
        );
      });

      if (isDarkMode) {
        await expect(page.locator(".lfcc-editor")).toHaveScreenshot("editor-dark-mode.png", {
          maxDiffPixelRatio: 0.02,
        });
      }
    }
  });

  test("full page layout", async ({ page }) => {
    // Capture the full demo layout including sidebar
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("full-page-layout.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });

  test("design catalog", async ({ page }) => {
    await page.goto("/en/design");
    // Wait for content to load
    await page.waitForSelector("h1");
    // Snapshot the whole design system page
    await expect(page).toHaveScreenshot("design-catalog.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
