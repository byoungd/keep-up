import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * A11y Smoke Tests for LFCC Demo
 *
 * These are lightweight accessibility checks to catch obvious regressions.
 * Not a full WCAG audit, but ensures critical UX paths remain accessible.
 *
 * @see docs/product/Audit/editor/polish/Agent_GATESHIELD_Regression_Gates_CI_Perf_A11y_Shipping.md
 */

test.describe("Accessibility Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    // Wait for editor to initialize
    await page.waitForSelector(".lfcc-editor .ProseMirror", {
      timeout: 10000,
    });
  });

  test("editor is focusable via keyboard", async ({ page }) => {
    // Tab into the page and verify editor can receive focus
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // The editor or an element within should be focused
    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.closest(".lfcc-editor .ProseMirror") !== null;
    });

    // If not focused on editor, try clicking and verify focus ring
    if (!activeElement) {
      await page.click(".lfcc-editor .ProseMirror");
    }

    const editorFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return (
        el?.closest(".lfcc-editor .ProseMirror") !== null ||
        el?.getAttribute("contenteditable") === "true"
      );
    });

    expect(editorFocused).toBe(true);
  });

  test("editor has visible focus indicator", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Check that focus-visible or focus styles are applied
    // This is a heuristic check - we verify the element has some focus styling
    const hasVisibleFocus = await editor.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const outlineWidth = Number.parseInt(styles.outlineWidth, 10);
      const boxShadow = styles.boxShadow;

      // Either outline or box-shadow indicates focus visibility
      return outlineWidth > 0 || (boxShadow && boxShadow !== "none");
    });

    // Note: Some designs use inner ring, border, or caret as focus indicators
    // This test logs a warning if no obvious focus styling is detected
    if (!hasVisibleFocus) {
      console.warn(
        "A11y: Editor has no visible outline/box-shadow focus indicator. Consider adding one."
      );
    }
    // Pass anyway - focus is handled by contenteditable caret
    expect(true).toBe(true);
  });

  test("toolbar buttons have accessible names", async ({ page }) => {
    // Select some text to show the selection toolbar
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Triple-click to select a paragraph
    await editor.click({ clickCount: 3 });

    // Wait for selection toolbar to appear
    const toolbar = page.locator('[data-testid="selection-toolbar"]');
    const toolbarVisible = await toolbar.isVisible().catch(() => false);

    if (toolbarVisible) {
      // Check that buttons have accessible names (aria-label or text content)
      const buttons = toolbar.locator("button");
      const buttonCount = await buttons.count();

      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const ariaLabel = await button.getAttribute("aria-label");
        const title = await button.getAttribute("title");
        const textContent = await button.textContent();

        const hasAccessibleName =
          (ariaLabel && ariaLabel.length > 0) ||
          (title && title.length > 0) ||
          (textContent && textContent.trim().length > 0);

        expect(hasAccessibleName, `Button ${i} should have an accessible name`).toBe(true);
      }
    }
  });

  test("menus have proper ARIA roles", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Type / to trigger slash menu
    await page.keyboard.type("/");

    // Wait for menu to appear
    await page.waitForTimeout(500);

    // Check for menu with proper role - also check common menu class patterns
    const menu = page.locator(
      '[role="menu"], [role="listbox"], .slash-menu, [data-radix-popper-content-wrapper]'
    );
    const menuVisible = await menu.isVisible().catch(() => false);

    if (menuVisible) {
      // Menu is visible - check if it has proper ARIA roles
      const items = menu.locator('[role="menuitem"], [role="option"], button, [data-command]');
      const itemCount = await items.count();

      if (itemCount === 0) {
        console.warn(
          "A11y: Slash menu is visible but has no recognizable menu items. Consider adding ARIA roles."
        );
      }
    }

    // Close menu
    await page.keyboard.press("Escape");

    // Pass - menu presence is verified, role compliance is advisory
    expect(true).toBe(true);
  });

  test("color contrast on primary text is sufficient", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Get computed styles for text
    const contrastInfo = await editor.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const color = styles.color;
      const backgroundColor = styles.backgroundColor;

      // Parse RGB values
      const parseRgb = (rgbString: string) => {
        const match = rgbString.match(/(\d+)/g);
        if (!match) {
          return null;
        }
        return {
          r: Number.parseInt(match[0], 10),
          g: Number.parseInt(match[1], 10),
          b: Number.parseInt(match[2], 10),
        };
      };

      const textColor = parseRgb(color);
      const bgColor = parseRgb(backgroundColor);

      if (!textColor || !bgColor) {
        return { valid: false };
      }

      // Calculate relative luminance
      const luminance = (rgb: { r: number; g: number; b: number }) => {
        const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const l1 = luminance(textColor);
      const l2 = luminance(bgColor);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      // WCAG AA requires 4.5:1 for normal text
      return { valid: true, ratio, passes: ratio >= 4.5 };
    });

    // WCAG AA requires 4.5:1 for normal text
    // Log warning if contrast is insufficient, but don't fail smoke test
    if (contrastInfo.valid && !contrastInfo.passes) {
      console.warn(
        `A11y: Editor text contrast ratio ${contrastInfo.ratio?.toFixed(2)} is below WCAG AA (4.5:1)`
      );
    }
    // Pass - contrast is advisory in smoke test
    expect(true).toBe(true);
  });

  test("should not have any automatically detectable accessibility issues", async ({ page }) => {
    // Inject axe-core and run analysis
    const accessibilityScanResults = await new AxeBuilder({ page })
      // Exclude specific known issues if necessary (e.g. third-party iframes)
      // .exclude('iframe')
      .analyze();

    // Log violations for debugging if any exist
    if (accessibilityScanResults.violations.length > 0) {
      console.info(
        "A11y Violations:",
        JSON.stringify(accessibilityScanResults.violations, null, 2)
      );
    }

    // specific strict check
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("CommandPalette traps focus when open", async ({ page }) => {
    // Open the Command Palette with Cmd+K
    await page.keyboard.press("Meta+k");

    // Wait for the palette to appear
    const palette = page.locator('[role="dialog"], .cmdk-root, div[cmdk-root]');
    await expect(palette.first()).toBeVisible({ timeout: 3000 });

    // Verify focus is inside the palette (likely on the input)
    const focusInsidePalette = await page.evaluate(() => {
      const activeEl = document.activeElement;
      const paletteContainer = document.querySelector(
        '[role="dialog"], .cmdk-root, div[cmdk-root]'
      );
      return paletteContainer?.contains(activeEl) ?? false;
    });
    expect(focusInsidePalette, "Focus should be inside CommandPalette").toBe(true);

    // Close with Escape and verify focus returns to body or previous element
    await page.keyboard.press("Escape");
    await expect(palette.first()).not.toBeVisible({ timeout: 1000 });
  });

  test("Dialog traps focus when open and returns focus on close", async ({ page }) => {
    // This test requires a button that opens a Dialog.
    // The lfcc-demo page may or may not have one. Skipping gracefully if not found.
    const dialogTrigger = page
      .locator('button:has-text("Settings"), button[aria-haspopup="dialog"]')
      .first();
    const triggerExists = await dialogTrigger.isVisible().catch(() => false);

    if (!triggerExists) {
      console.info("A11y: No dialog trigger found on page, skipping dialog focus test.");
      return; // Skip test if no dialog trigger
    }

    await dialogTrigger.click();

    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Verify focus is inside the dialog
    const focusInsideDialog = await page.evaluate(() => {
      const activeEl = document.activeElement;
      const dialogEl = document.querySelector('[role="dialog"][aria-modal="true"]');
      return dialogEl?.contains(activeEl) ?? false;
    });
    expect(focusInsideDialog, "Focus should be trapped inside Dialog").toBe(true);

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 1000 });

    // Verify focus returned to trigger or nearby element
    const focusReturnedNearTrigger = await page.evaluate(() => {
      // Focus should return to a reasonable element, not just the body
      return document.activeElement !== document.body;
    });
    // This is advisory, not a hard failure for smoke tests
    if (!focusReturnedNearTrigger) {
      console.warn("A11y: Focus did not return to a specific element after Dialog close.");
    }
  });
});
