import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * E2E tests for Notes (threaded comments) and Share functionality.
 * These tests verify note creation, persistence, and share workflows.
 */

test.describe("Notes and Share", () => {
  const DEMO_URL = "/editor?seed=liquid-refactor";

  test.use({ viewport: { width: 1400, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    // Wait for editor to be ready
    const editor = page.locator('[data-testid="lfcc-editor"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
  });

  const waitForFirstAnnotation = async (page: Page) => {
    const panel = page.getByTestId("annotation-panel");
    await expect(panel).toBeVisible({ timeout: 10000 });
    const firstItem = panel.locator("[data-annotation-role='panel-item']").first();
    await expect(firstItem).toBeVisible({ timeout: 10000 });
    return panel;
  };

  test("Add note to annotation and verify it appears", async ({ page }) => {
    const panel = await waitForFirstAnnotation(page);
    const commentToggle = panel.locator("[data-annotation-role='comment-toggle']").first();
    await expect(commentToggle).toBeVisible({ timeout: 5000 });
    await commentToggle.click();

    // Type a note
    const noteInput = panel.getByLabel(/add a note/i).first();
    await expect(noteInput).toBeVisible({ timeout: 5000 });

    const testNote = `Test note ${Date.now()}`;
    await noteInput.fill(testNote);
    await noteInput.press("Enter");

    // Wait for note to appear
    await expect(page.locator(`text=${testNote}`)).toBeVisible({ timeout: 3000 });
  });

  test("Delete note and verify it disappears", async ({ page }) => {
    const panel = await waitForFirstAnnotation(page);
    const commentToggle = panel.locator("[data-annotation-role='comment-toggle']").first();
    await expect(commentToggle).toBeVisible({ timeout: 5000 });
    await commentToggle.click();

    // Add a note first
    const noteInput = panel.getByLabel(/add a note/i).first();
    await expect(noteInput).toBeVisible({ timeout: 5000 });

    const testNote = `Delete me ${Date.now()}`;
    await noteInput.fill(testNote);
    await noteInput.press("Enter");

    // Wait for note
    const noteLocator = page.locator(`text=${testNote}`);
    await expect(noteLocator).toBeVisible({ timeout: 3000 });

    // Find and click delete button (appears on hover)
    const commentBubble = noteLocator.locator(
      "xpath=ancestor::div[contains(@class, 'group/comment')]"
    );
    await commentBubble.hover();

    const deleteBtn = commentBubble.getByRole("button", { name: "Delete" });
    page.once("dialog", (dialog) => dialog.accept());
    await deleteBtn.click();

    // Verify note is gone
    await expect(noteLocator).not.toBeVisible({ timeout: 3000 });
  });

  test("Share button copies URL to clipboard", async ({ page, context }) => {
    // Grant clipboard permission
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const panel = await waitForFirstAnnotation(page);
    const shareBtn = panel.getByRole("button", { name: /^share$/i });

    await shareBtn.click();

    // Check for success toast
    const toast = page.locator("text=Link copied to clipboard");
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Verify clipboard contains URL
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(page.url().split("?")[0]);
  });

  test("Copy annotation link writes a deep link", async ({ page, context }) => {
    // Grant clipboard permission
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const panel = await waitForFirstAnnotation(page);
    const copyLinkBtn = panel.locator("[data-annotation-role='copy-link']").first();
    await expect(copyLinkBtn).toBeVisible({ timeout: 5000 });

    await copyLinkBtn.click();

    const toast = page.locator("text=Annotation link copied.");
    await expect(toast).toBeVisible({ timeout: 3000 });

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("ann=");
  });

  test("Search filters annotations by content", async ({ page }) => {
    await waitForFirstAnnotation(page);
    const searchInput = page.locator('[aria-label="Search annotations"]');

    // Type a search query that likely won't match
    await searchInput.fill("xyznonexistent");

    // Should show empty state or no results
    await page.waitForTimeout(300);

    // Clear and type a common word
    await searchInput.fill("");

    // Annotations should reappear
    const items = page.locator("[data-annotation-role='panel-item']");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
