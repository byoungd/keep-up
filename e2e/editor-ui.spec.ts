import { expect, test } from "@playwright/test";
import { openFreshEditor, waitForEditorReady } from "./helpers/editor";

test.describe("Editor UI Controls", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `editor-ui-${testInfo.title}`, { clearContent: true });
  });

  test.describe("Undo/Redo Buttons", () => {
    test("undo button is disabled when no history", async ({ page }) => {
      // Wait for history stack to settle after page load
      await page.waitForTimeout(500);

      const undoButton = page.getByRole("button", { name: /undo/i });
      await expect(undoButton).toBeVisible();
      // Check disabled state with polling since history may still be settling
      await expect
        .poll(
          async () => {
            return await undoButton.isDisabled();
          },
          { timeout: 5000 }
        )
        .toBe(true);
    });

    test("redo button is disabled when no redo history", async ({ page }) => {
      const redoButton = page.getByRole("button", { name: /redo/i });
      await expect(redoButton).toBeVisible();
      await expect(redoButton).toBeDisabled();
    });

    test("undo button enables after typing", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.type("Test text for undo");

      const undoButton = page.getByRole("button", { name: /undo/i });
      await expect(undoButton).toBeEnabled();
    });

    test("clicking undo button reverts changes", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      const uniqueText = `UNDO_TEST_${Date.now()}`;
      await page.keyboard.type(uniqueText);

      // Verify text exists
      await expect(editor).toContainText(uniqueText);

      // Click undo button
      const undoButton = page.getByRole("button", { name: /undo/i });
      await undoButton.click();

      // Verify text is removed
      await expect(editor).not.toContainText(uniqueText);
    });

    test("clicking redo button restores undone changes", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      const uniqueText = `REDO_TEST_${Date.now()}`;
      await page.keyboard.type(uniqueText);

      // Undo
      const undoButton = page.getByRole("button", { name: /undo/i });
      await undoButton.click();
      await expect(editor).not.toContainText(uniqueText);

      // Redo
      const redoButton = page.getByRole("button", { name: /redo/i });
      await expect(redoButton).toBeEnabled();
      await redoButton.click();

      // Verify text is restored
      await expect(editor).toContainText(uniqueText);
    });
  });

  test.describe("ConnectionBadge", () => {
    test("connection badge is visible with state label", async ({ page }) => {
      // ConnectionBadge shows "Online", "Offline", "Connecting", etc.
      // Use getByText to find any of the state labels
      const online = page.getByText("Online", { exact: true });
      const offline = page.getByText("Offline", { exact: true });
      const connecting = page.getByText("Connecting", { exact: true });

      // Wait for any of them to be visible
      await expect(online.or(offline).or(connecting).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Keyboard Shortcuts Modal", () => {
    test("Cmd+/ opens keyboard shortcuts modal", async ({ page }) => {
      // Press Cmd+/ (Meta+/)
      await page.keyboard.press("Meta+/");

      // Modal should appear
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible({ timeout: 3000 });

      // Should contain "Keyboard Shortcuts" text in title
      await expect(modal).toContainText("Keyboard Shortcuts");
    });

    test("keyboard shortcuts modal can be closed with Escape", async ({ page }) => {
      await page.keyboard.press("Meta+/");
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
    });

    test("keyboard shortcuts modal has search functionality", async ({ page }) => {
      await page.keyboard.press("Meta+/");
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();

      // Verify search input exists
      const searchInput = modal.getByPlaceholder("Search shortcuts...");
      await expect(searchInput).toBeVisible();
    });

    test("keyboard shortcuts modal can be closed with close button", async ({ page }) => {
      await page.keyboard.press("Meta+/");
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();

      // Click close button
      const closeButton = modal.getByRole("button", { name: /close/i });
      await closeButton.click();

      await expect(modal).not.toBeVisible();
    });
  });
});

test.describe("Editor URL Parameters", () => {
  test("?seed=1k seeds content with perf blocks", async ({ page }) => {
    await page.goto("/editor?seed=1k");
    await waitForEditorReady(page);

    const editor = page.locator(".lfcc-editor .ProseMirror");
    // Perf blocks contain "Perf block" text
    await expect(editor).toContainText(/Perf block/);
  });

  test("?doc= parameter creates isolated document", async ({ page }) => {
    const docId = `test-doc-${Date.now()}`;
    await page.goto(`/editor?doc=${docId}`);
    await waitForEditorReady(page);

    // Editor should load without errors
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible();
  });
});
